"""
Cache service for the ML Recommendation System

This module handles Redis caching operations to improve performance.
It caches:
1. ML model predictions
2. User recommendations
3. Job similarity scores
4. Frequently accessed data

Caching reduces database load and speeds up API responses.
"""

import json
import pickle
from typing import Optional, Any, List, Dict
from datetime import datetime, timedelta

import aioredis
import structlog

logger = structlog.get_logger()


class CacheService:
    """
    Redis cache service for storing and retrieving data
    
    This service provides:
    - Fast access to frequently used data
    - Caching of ML model predictions
    - Temporary storage of recommendations
    - Performance optimization
    
    Redis is an in-memory database that's much faster than PostgreSQL for read operations.
    """
    
    def __init__(self, redis_url: str, db: int = 0):
        """
        Initialize the cache service
        
        Args:
            redis_url: Redis connection string (e.g., "redis://localhost:6379")
            db: Redis database number to use
        """
        self.redis_url = redis_url
        self.db = db
        self.redis: Optional[aioredis.Redis] = None
        
    async def connect(self):
        """
        Connect to Redis
        
        This method establishes a connection to the Redis server.
        Redis will be used to cache ML predictions and improve response times.
        """
        try:
            # Create Redis connection
            self.redis = aioredis.from_url(
                self.redis_url,
                db=self.db,
                encoding="utf-8",
                decode_responses=True  # Automatically decode responses to strings
            )
            
            # Test the connection
            await self.redis.ping()
            logger.info("✅ Redis cache connection established")
            
        except Exception as e:
            logger.error(f"❌ Failed to connect to Redis: {e}")
            # Don't crash the app if Redis is unavailable
            self.redis = None
    
    async def close(self):
        """
        Close Redis connection
        
        This method properly closes the Redis connection when the app shuts down.
        """
        if self.redis:
            await self.redis.close()
            logger.info("✅ Redis cache connection closed")
    
    async def is_healthy(self) -> bool:
        """
        Check if Redis cache is healthy
        
        This method tests if we can still connect to Redis.
        It's used by the health check endpoint.
        
        Returns:
            True if Redis is accessible, False otherwise
        """
        try:
            if not self.redis:
                return False
            
            await self.redis.ping()
            return True
        except Exception as e:
            logger.error(f"❌ Redis health check failed: {e}")
            return False
    
    async def get_recommendations(self, user_id: int, algorithm: str) -> Optional[List[int]]:
        """
        Get cached recommendations for a user
        
        This method checks if we have cached recommendations for a user.
        If found and not expired, it returns them immediately without running ML models.
        
        Args:
            user_id: User ID to get recommendations for
            algorithm: Which algorithm was used (collaborative, content, hybrid)
            
        Returns:
            List of job IDs if cached, None if not found or expired
        """
        try:
            if not self.redis:
                return None
            
            # Create cache key for this user and algorithm
            cache_key = f"recommendations:{user_id}:{algorithm}"
            
            # Try to get cached recommendations
            cached_data = await self.redis.get(cache_key)
            
            if cached_data:
                # Parse the cached data
                data = json.loads(cached_data)
                
                # Check if cache is still valid (not expired)
                cached_time = datetime.fromisoformat(data['timestamp'])
                if datetime.now() - cached_time < timedelta(minutes=30):  # 30 minute cache
                    logger.info(f"✅ Cache hit for user {user_id} with {algorithm} algorithm")
                    return data['recommendations']
                else:
                    # Cache expired, remove it
                    await self.redis.delete(cache_key)
                    logger.info(f"⏰ Cache expired for user {user_id}")
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Failed to get cached recommendations: {e}")
            return None
    
    async def set_recommendations(self, user_id: int, algorithm: str, recommendations: List[int], ttl: int = 1800):
        """
        Cache recommendations for a user
        
        This method stores recommendations in Redis so they can be retrieved quickly
        without running ML models again.
        
        Args:
            user_id: User ID to cache recommendations for
            algorithm: Which algorithm was used
            recommendations: List of job IDs to cache
            ttl: Time to live in seconds (default: 30 minutes)
        """
        try:
            if not self.redis:
                return
            
            # Create cache key
            cache_key = f"recommendations:{user_id}:{algorithm}"
            
            # Prepare data to cache
            cache_data = {
                'recommendations': recommendations,
                'timestamp': datetime.now().isoformat(),
                'algorithm': algorithm
            }
            
            # Store in Redis with expiration
            await self.redis.setex(
                cache_key,
                ttl,
                json.dumps(cache_data)
            )
            
            logger.info(f"💾 Cached {len(recommendations)} recommendations for user {user_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to cache recommendations: {e}")
    
    async def get_job_similarity(self, job_id: int) -> Optional[Dict[int, float]]:
        """
        Get cached job similarity scores
        
        This method retrieves pre-calculated similarity scores between jobs.
        Job similarities are expensive to calculate, so we cache them.
        
        Args:
            job_id: Job ID to get similarities for
            
        Returns:
            Dictionary mapping job IDs to similarity scores, or None if not cached
        """
        try:
            if not self.redis:
                return None
            
            cache_key = f"job_similarity:{job_id}"
            cached_data = await self.redis.get(cache_key)
            
            if cached_data:
                data = json.loads(cached_data)
                cached_time = datetime.fromisoformat(data['timestamp'])
                
                # Cache job similarities for 1 hour (they don't change often)
                if datetime.now() - cached_time < timedelta(hours=1):
                    logger.info(f"✅ Cache hit for job similarity {job_id}")
                    return data['similarities']
                else:
                    await self.redis.delete(cache_key)
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Failed to get cached job similarity: {e}")
            return None
    
    async def set_job_similarity(self, job_id: int, similarities: Dict[int, float], ttl: int = 3600):
        """
        Cache job similarity scores
        
        This method stores pre-calculated similarity scores between jobs.
        
        Args:
            job_id: Job ID to cache similarities for
            similarities: Dictionary mapping job IDs to similarity scores
            ttl: Time to live in seconds (default: 1 hour)
        """
        try:
            if not self.redis:
                return
            
            cache_key = f"job_similarity:{job_id}"
            
            cache_data = {
                'similarities': similarities,
                'timestamp': datetime.now().isoformat()
            }
            
            await self.redis.setex(
                cache_key,
                ttl,
                json.dumps(cache_data)
            )
            
            logger.info(f"💾 Cached job similarities for job {job_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to cache job similarity: {e}")
    
    async def get_user_preferences(self, user_id: int) -> Optional[Dict[str, Any]]:
        """
        Get cached user preferences
        
        This method retrieves cached user preferences to avoid database queries.
        
        Args:
            user_id: User ID to get preferences for
            
        Returns:
            User preferences dictionary or None if not cached
        """
        try:
            if not self.redis:
                return None
            
            cache_key = f"user_preferences:{user_id}"
            cached_data = await self.redis.get(cache_key)
            
            if cached_data:
                data = json.loads(cached_data)
                cached_time = datetime.fromisoformat(data['timestamp'])
                
                # Cache user preferences for 1 hour
                if datetime.now() - cached_time < timedelta(hours=1):
                    logger.info(f"✅ Cache hit for user preferences {user_id}")
                    return data['preferences']
                else:
                    await self.redis.delete(cache_key)
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Failed to get cached user preferences: {e}")
            return None
    
    async def set_user_preferences(self, user_id: int, preferences: Dict[str, Any], ttl: int = 3600):
        """
        Cache user preferences
        
        This method stores user preferences in cache for quick access.
        
        Args:
            user_id: User ID to cache preferences for
            preferences: User preferences dictionary
            ttl: Time to live in seconds (default: 1 hour)
        """
        try:
            if not self.redis:
                return
            
            cache_key = f"user_preferences:{user_id}"
            
            cache_data = {
                'preferences': preferences,
                'timestamp': datetime.now().isoformat()
            }
            
            await self.redis.setex(
                cache_key,
                ttl,
                json.dumps(cache_data)
            )
            
            logger.info(f"💾 Cached user preferences for user {user_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to cache user preferences: {e}")
    
    async def invalidate_user_cache(self, user_id: int):
        """
        Invalidate all cached data for a user
        
        This method removes all cached data for a user when their data changes.
        It's called when:
        - User preferences are updated
        - User interacts with new jobs
        - Recommendations need to be refreshed
        
        Args:
            user_id: User ID to invalidate cache for
        """
        try:
            if not self.redis:
                return
            
            # Get all keys for this user
            pattern = f"*:{user_id}:*"
            keys = await self.redis.keys(pattern)
            
            if keys:
                # Delete all cached data for this user
                await self.redis.delete(*keys)
                logger.info(f"🗑️ Invalidated cache for user {user_id} ({len(keys)} keys)")
            
        except Exception as e:
            logger.error(f"❌ Failed to invalidate user cache: {e}")
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics
        
        This method returns information about cache usage and performance.
        It's useful for monitoring and debugging.
        
        Returns:
            Dictionary with cache statistics
        """
        try:
            if not self.redis:
                return {"error": "Redis not available"}
            
            # Get Redis info
            info = await self.redis.info()
            
            # Count different types of cached data
            recommendation_keys = await self.redis.keys("recommendations:*")
            similarity_keys = await self.redis.keys("job_similarity:*")
            preference_keys = await self.redis.keys("user_preferences:*")
            
            return {
                "redis_connected": True,
                "total_keys": info.get("db0", {}).get("keys", 0),
                "recommendation_cache_count": len(recommendation_keys),
                "similarity_cache_count": len(similarity_keys),
                "preference_cache_count": len(preference_keys),
                "memory_usage": info.get("used_memory_human", "unknown"),
                "uptime": info.get("uptime_in_seconds", 0)
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get cache stats: {e}")
            return {"error": str(e)}
    
    async def clear_all_cache(self):
        """
        Clear all cached data
        
        This method removes all cached data from Redis.
        It's useful for:
        - Testing
        - Clearing stale data
        - Resetting the system
        
        WARNING: This will remove ALL cached data!
        """
        try:
            if not self.redis:
                return
            
            # Clear all data in the current database
            await self.redis.flushdb()
            logger.info("🗑️ Cleared all cache data")
            
        except Exception as e:
            logger.error(f"❌ Failed to clear cache: {e}") 