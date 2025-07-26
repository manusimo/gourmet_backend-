"""
Monitoring and metrics service for the ML Recommendation System

This module provides:
1. Performance tracking (response times, throughput)
2. ML model metrics (accuracy, training time)
3. System health monitoring
4. Prometheus-compatible metrics

It helps us understand how well the system is performing and identify issues.
"""

import time
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict, deque

import structlog

logger = structlog.get_logger()


class RecommendationMonitor:
    """
    Monitoring service for tracking system performance and metrics
    
    This service collects and stores metrics about:
    - API response times
    - Recommendation accuracy
    - Model training performance
    - Error rates
    - System usage patterns
    
    The metrics help us optimize the system and identify performance bottlenecks.
    """
    
    def __init__(self, max_history: int = 1000):
        """
        Initialize the monitoring service
        
        Args:
            max_history: Maximum number of metrics to keep in memory
        """
        self.max_history = max_history
        
        # Performance metrics
        self.response_times = deque(maxlen=max_history)
        self.request_counts = defaultdict(int)
        self.error_counts = defaultdict(int)
        
        # ML model metrics
        self.training_times = deque(maxlen=100)
        self.model_accuracies = defaultdict(list)
        self.recommendation_counts = defaultdict(int)
        
        # System metrics
        self.start_time = datetime.now()
        self.total_requests = 0
        self.total_errors = 0
        
        # Cache metrics
        self.cache_hits = 0
        self.cache_misses = 0
        
    async def log_recommendation_request(
        self, 
        user_id: int, 
        algorithm: str, 
        duration: float, 
        count: int
    ):
        """
        Log a recommendation request for monitoring
        
        This method records metrics about each recommendation request:
        - Response time
        - Algorithm used
        - Number of recommendations returned
        - User ID (for anonymized analytics)
        
        Args:
            user_id: User who requested recommendations
            algorithm: Algorithm used (collaborative, content, hybrid)
            duration: How long the request took (seconds)
            count: Number of recommendations returned
        """
        try:
            # Record response time
            self.response_times.append({
                'timestamp': datetime.now(),
                'duration': duration,
                'algorithm': algorithm,
                'user_id': user_id
            })
            
            # Update request counts
            self.request_counts[algorithm] += 1
            self.total_requests += 1
            
            # Update recommendation counts
            self.recommendation_counts[algorithm] += count
            
            # Log the request
            logger.info(
                f"📊 Recommendation request logged",
                user_id=user_id,
                algorithm=algorithm,
                duration=f"{duration:.3f}s",
                count=count
            )
            
        except Exception as e:
            logger.error(f"❌ Failed to log recommendation request: {e}")
    
    async def log_recommendation_error(
        self, 
        user_id: int, 
        algorithm: str, 
        duration: float, 
        error: str
    ):
        """
        Log a recommendation error for monitoring
        
        This method records when things go wrong so we can:
        - Track error rates
        - Identify problematic algorithms
        - Monitor system stability
        
        Args:
            user_id: User who experienced the error
            algorithm: Algorithm that failed
            duration: How long the request took before failing
            error: Error message or description
        """
        try:
            # Update error counts
            self.error_counts[algorithm] += 1
            self.total_errors += 1
            
            # Log the error
            logger.error(
                f"❌ Recommendation error logged",
                user_id=user_id,
                algorithm=algorithm,
                duration=f"{duration:.3f}s",
                error=error
            )
            
        except Exception as e:
            logger.error(f"❌ Failed to log recommendation error: {e}")
    
    async def log_model_training(self, model_name: str, duration: float, accuracy: Optional[float] = None):
        """
        Log model training metrics
        
        This method records information about model training:
        - Training time
        - Model accuracy (if available)
        - Which model was trained
        
        Args:
            model_name: Name of the model (collaborative, content, hybrid)
            duration: How long training took (seconds)
            accuracy: Model accuracy score (optional)
        """
        try:
            # Record training time
            self.training_times.append({
                'timestamp': datetime.now(),
                'model': model_name,
                'duration': duration,
                'accuracy': accuracy
            })
            
            # Record accuracy if available
            if accuracy is not None:
                self.model_accuracies[model_name].append(accuracy)
                # Keep only recent accuracy scores
                if len(self.model_accuracies[model_name]) > 10:
                    self.model_accuracies[model_name] = self.model_accuracies[model_name][-10:]
            
            logger.info(
                f"🎯 Model training logged",
                model=model_name,
                duration=f"{duration:.2f}s",
                accuracy=accuracy
            )
            
        except Exception as e:
            logger.error(f"❌ Failed to log model training: {e}")
    
    async def log_cache_hit(self, cache_type: str):
        """
        Log a cache hit for monitoring cache performance
        
        Args:
            cache_type: Type of cache hit (recommendations, preferences, similarities)
        """
        self.cache_hits += 1
        logger.debug(f"💾 Cache hit: {cache_type}")
    
    async def log_cache_miss(self, cache_type: str):
        """
        Log a cache miss for monitoring cache performance
        
        Args:
            cache_type: Type of cache miss (recommendations, preferences, similarities)
        """
        self.cache_misses += 1
        logger.debug(f"⏰ Cache miss: {cache_type}")
    
    async def get_metrics(self) -> Dict[str, Any]:
        """
        Get comprehensive system metrics
        
        This method returns all collected metrics in a format suitable for:
        - API responses
        - Monitoring dashboards
        - Performance analysis
        
        Returns:
            Dictionary containing all system metrics
        """
        try:
            # Calculate response time statistics
            response_time_stats = self._calculate_response_time_stats()
            
            # Calculate error rates
            error_rates = self._calculate_error_rates()
            
            # Calculate cache performance
            cache_stats = self._calculate_cache_stats()
            
            # Calculate model performance
            model_stats = self._calculate_model_stats()
            
            # System uptime
            uptime = datetime.now() - self.start_time
            
            return {
                "system": {
                    "uptime_seconds": uptime.total_seconds(),
                    "uptime_human": str(uptime).split('.')[0],  # Remove microseconds
                    "total_requests": self.total_requests,
                    "total_errors": self.total_errors,
                    "requests_per_minute": self._calculate_requests_per_minute()
                },
                "response_times": response_time_stats,
                "error_rates": error_rates,
                "cache_performance": cache_stats,
                "model_performance": model_stats,
                "algorithm_usage": dict(self.request_counts),
                "recommendations_generated": dict(self.recommendation_counts)
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get metrics: {e}")
            return {"error": str(e)}
    
    def _calculate_response_time_stats(self) -> Dict[str, Any]:
        """Calculate response time statistics"""
        if not self.response_times:
            return {"count": 0, "avg": 0, "min": 0, "max": 0, "p95": 0}
        
        times = [rt['duration'] for rt in self.response_times]
        times.sort()
        
        return {
            "count": len(times),
            "avg": sum(times) / len(times),
            "min": min(times),
            "max": max(times),
            "p95": times[int(len(times) * 0.95)] if len(times) > 0 else 0,
            "p99": times[int(len(times) * 0.99)] if len(times) > 0 else 0
        }
    
    def _calculate_error_rates(self) -> Dict[str, float]:
        """Calculate error rates by algorithm"""
        error_rates = {}
        for algorithm in self.request_counts:
            total_requests = self.request_counts[algorithm]
            total_errors = self.error_counts[algorithm]
            error_rate = (total_errors / total_requests * 100) if total_requests > 0 else 0
            error_rates[algorithm] = round(error_rate, 2)
        
        return error_rates
    
    def _calculate_cache_stats(self) -> Dict[str, Any]:
        """Calculate cache performance statistics"""
        total_cache_requests = self.cache_hits + self.cache_misses
        hit_rate = (self.cache_hits / total_cache_requests * 100) if total_cache_requests > 0 else 0
        
        return {
            "hits": self.cache_hits,
            "misses": self.cache_misses,
            "total_requests": total_cache_requests,
            "hit_rate_percent": round(hit_rate, 2)
        }
    
    def _calculate_model_stats(self) -> Dict[str, Any]:
        """Calculate model performance statistics"""
        stats = {}
        
        # Training time statistics
        if self.training_times:
            training_durations = [tt['duration'] for tt in self.training_times]
            stats["training_times"] = {
                "count": len(training_durations),
                "avg": sum(training_durations) / len(training_durations),
                "min": min(training_durations),
                "max": max(training_durations)
            }
        
        # Accuracy statistics
        for model_name, accuracies in self.model_accuracies.items():
            if accuracies:
                stats[f"{model_name}_accuracy"] = {
                    "count": len(accuracies),
                    "avg": sum(accuracies) / len(accuracies),
                    "min": min(accuracies),
                    "max": max(accuracies),
                    "latest": accuracies[-1] if accuracies else None
                }
        
        return stats
    
    def _calculate_requests_per_minute(self) -> float:
        """Calculate requests per minute based on recent activity"""
        if not self.response_times:
            return 0.0
        
        # Look at the last 5 minutes
        cutoff_time = datetime.now() - timedelta(minutes=5)
        recent_requests = [rt for rt in self.response_times if rt['timestamp'] > cutoff_time]
        
        return len(recent_requests) / 5.0  # Requests per minute
    
    async def get_health_status(self) -> Dict[str, Any]:
        """
        Get system health status
        
        This method provides a quick health check that can be used by:
        - Load balancers
        - Monitoring systems
        - Health check endpoints
        
        Returns:
            Dictionary with health status information
        """
        try:
            # Calculate basic health metrics
            error_rate = (self.total_errors / self.total_requests * 100) if self.total_requests > 0 else 0
            avg_response_time = self._calculate_response_time_stats()["avg"]
            
            # Determine overall health
            if error_rate > 10 or avg_response_time > 2.0:
                status = "unhealthy"
            elif error_rate > 5 or avg_response_time > 1.0:
                status = "degraded"
            else:
                status = "healthy"
            
            return {
                "status": status,
                "error_rate_percent": round(error_rate, 2),
                "avg_response_time_seconds": round(avg_response_time, 3),
                "uptime_seconds": (datetime.now() - self.start_time).total_seconds(),
                "total_requests": self.total_requests,
                "last_request": self.response_times[-1]['timestamp'].isoformat() if self.response_times else None
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get health status: {e}")
            return {"status": "unknown", "error": str(e)}
    
    async def reset_metrics(self):
        """
        Reset all metrics (useful for testing)
        
        This method clears all collected metrics and resets counters.
        Use with caution in production!
        """
        try:
            # Clear all metrics
            self.response_times.clear()
            self.request_counts.clear()
            self.error_counts.clear()
            self.training_times.clear()
            self.model_accuracies.clear()
            self.recommendation_counts.clear()
            
            # Reset counters
            self.total_requests = 0
            self.total_errors = 0
            self.cache_hits = 0
            self.cache_misses = 0
            
            # Reset start time
            self.start_time = datetime.now()
            
            logger.info("🔄 All metrics have been reset")
            
        except Exception as e:
            logger.error(f"❌ Failed to reset metrics: {e}")
    
    async def export_prometheus_metrics(self) -> str:
        """
        Export metrics in Prometheus format
        
        This method formats metrics for Prometheus monitoring systems.
        It returns metrics in the standard Prometheus text format.
        
        Returns:
            String containing Prometheus-formatted metrics
        """
        try:
            metrics = []
            
            # System metrics
            uptime = (datetime.now() - self.start_time).total_seconds()
            metrics.append(f"# HELP ml_recommendation_system_uptime_seconds System uptime in seconds")
            metrics.append(f"# TYPE ml_recommendation_system_uptime_seconds gauge")
            metrics.append(f"ml_recommendation_system_uptime_seconds {uptime}")
            
            # Request metrics
            metrics.append(f"# HELP ml_recommendation_requests_total Total number of recommendation requests")
            metrics.append(f"# TYPE ml_recommendation_requests_total counter")
            for algorithm, count in self.request_counts.items():
                metrics.append(f'ml_recommendation_requests_total{{algorithm="{algorithm}"}} {count}')
            
            # Error metrics
            metrics.append(f"# HELP ml_recommendation_errors_total Total number of recommendation errors")
            metrics.append(f"# TYPE ml_recommendation_errors_total counter")
            for algorithm, count in self.error_counts.items():
                metrics.append(f'ml_recommendation_errors_total{{algorithm="{algorithm}"}} {count}')
            
            # Response time metrics
            if self.response_times:
                avg_time = self._calculate_response_time_stats()["avg"]
                metrics.append(f"# HELP ml_recommendation_response_time_seconds Average response time")
                metrics.append(f"# TYPE ml_recommendation_response_time_seconds gauge")
                metrics.append(f"ml_recommendation_response_time_seconds {avg_time}")
            
            # Cache metrics
            metrics.append(f"# HELP ml_recommendation_cache_hits_total Total cache hits")
            metrics.append(f"# TYPE ml_recommendation_cache_hits_total counter")
            metrics.append(f"ml_recommendation_cache_hits_total {self.cache_hits}")
            
            metrics.append(f"# HELP ml_recommendation_cache_misses_total Total cache misses")
            metrics.append(f"# TYPE ml_recommendation_cache_misses_total counter")
            metrics.append(f"ml_recommendation_cache_misses_total {self.cache_misses}")
            
            return "\n".join(metrics)
            
        except Exception as e:
            logger.error(f"❌ Failed to export Prometheus metrics: {e}")
            return f"# ERROR: {str(e)}" 