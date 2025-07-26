"""
Application service for managing the ML Recommendation System lifecycle

This service handles:
1. Application startup and initialization
2. ML model training and management
3. Service lifecycle management
4. Graceful shutdown

This separates the application logic from the FastAPI setup.
"""

import asyncio
from typing import Optional
from contextlib import asynccontextmanager
import structlog

from ..database import DatabaseService
from ..services.cache_service import CacheService
from ..services.recommendation_service import RecommendationService
from ..utils.monitoring import RecommendationMonitor
from ..utils.config import Settings

logger = structlog.get_logger()


class AppService:
    """
    Application service for managing the ML Recommendation System
    
    This service coordinates all the components:
    - Database connections
    - Cache connections
    - ML model training
    - Monitoring setup
    - Graceful shutdown
    """
    
    def __init__(self, settings: Settings):
        """
        Initialize the application service
        
        Args:
            settings: Application configuration
        """
        self.settings = settings
        
        # Service instances
        self.db_service: Optional[DatabaseService] = None
        self.cache_service: Optional[CacheService] = None
        self.recommendation_service: Optional[RecommendationService] = None
        self.monitor: Optional[RecommendationMonitor] = None
        
        # Application state
        self.is_running = False
        self.startup_complete = False
    
    async def startup(self):
        """
        Start up the application and all services
        
        This method:
        1. Initializes database connections
        2. Sets up Redis cache
        3. Creates ML services
        4. Trains initial models
        5. Sets up monitoring
        """
        try:
            logger.info("🚀 Starting ML Recommendation System")
            
            # Initialize database service
            self.db_service = DatabaseService(
                self.settings.database_url,
                pool_size=self.settings.database_pool_size,
                max_overflow=self.settings.database_max_overflow
            )
            await self.db_service.connect()
            logger.info("✅ Database connection established")
            
            # Initialize cache service
            self.cache_service = CacheService(
                self.settings.redis_url,
                db=self.settings.redis_db
            )
            await self.cache_service.connect()
            logger.info("✅ Cache connection established")
            
            # Initialize recommendation service
            self.recommendation_service = RecommendationService(
                self.db_service,
                self.cache_service
            )
            logger.info("✅ Recommendation service initialized")
            
            # Initialize monitoring service
            self.monitor = RecommendationMonitor()
            logger.info("✅ Monitoring service initialized")
            
            # Train initial ML models
            await self._train_initial_models()
            
            # Mark startup as complete
            self.startup_complete = True
            self.is_running = True
            
            logger.info("🎉 Application startup completed successfully")
            
        except Exception as e:
            logger.error(f"❌ Application startup failed: {e}")
            await self.shutdown()
            raise
    
    async def shutdown(self):
        """
        Shut down the application gracefully
        
        This method:
        1. Stops accepting new requests
        2. Closes database connections
        3. Closes cache connections
        4. Cleans up resources
        """
        try:
            logger.info("🛑 Shutting down ML Recommendation System")
            
            # Mark as not running
            self.is_running = False
            
            # Close database connections
            if self.db_service:
                await self.db_service.close()
                logger.info("✅ Database connections closed")
            
            # Close cache connections
            if self.cache_service:
                await self.cache_service.close()
                logger.info("✅ Cache connections closed")
            
            logger.info("✅ Application shutdown completed")
            
        except Exception as e:
            logger.error(f"❌ Error during shutdown: {e}")
    
    async def _train_initial_models(self):
        """
        Train initial ML models with existing data
        
        This ensures we have working models when the API starts.
        If training fails, the app will still start but without ML capabilities.
        """
        try:
            logger.info("🎯 Training initial ML models...")
            
            if self.recommendation_service:
                await self.recommendation_service.train_models()
                logger.info("✅ Initial model training completed")
            else:
                logger.warning("⚠️ Recommendation service not available for training")
                
        except Exception as e:
            logger.error(f"❌ Initial model training failed: {e}")
            logger.info("ℹ️ Application will start without trained models - they can be trained later")
    
    async def retrain_models(self):
        """
        Retrain all ML models with fresh data
        
        This method can be called to update models with new data.
        It runs in the background to avoid blocking the API.
        """
        try:
            logger.info("🔄 Starting model retraining...")
            
            if self.recommendation_service:
                await self.recommendation_service.train_models()
                logger.info("✅ Model retraining completed")
            else:
                logger.error("❌ Recommendation service not available for retraining")
                
        except Exception as e:
            logger.error(f"❌ Model retraining failed: {e}")
            raise
    
    def get_db_service(self) -> Optional[DatabaseService]:
        """Get the database service instance"""
        return self.db_service
    
    def get_cache_service(self) -> Optional[CacheService]:
        """Get the cache service instance"""
        return self.cache_service
    
    def get_recommendation_service(self) -> Optional[RecommendationService]:
        """Get the recommendation service instance"""
        return self.recommendation_service
    
    def get_monitor(self) -> Optional[RecommendationMonitor]:
        """Get the monitoring service instance"""
        return self.monitor
    
    def is_healthy(self) -> bool:
        """
        Check if the application is healthy
        
        Returns:
            True if all services are running and healthy
        """
        return (
            self.is_running and
            self.startup_complete and
            self.db_service is not None and
            self.cache_service is not None and
            self.recommendation_service is not None and
            self.monitor is not None
        )


# Global application service instance
_app_service: Optional[AppService] = None


def get_app_service() -> Optional[AppService]:
    """
    Get the global application service instance
    
    Returns:
        The application service instance or None if not initialized
    """
    return _app_service


def set_app_service(app_service: AppService):
    """
    Set the global application service instance
    
    Args:
        app_service: The application service instance
    """
    global _app_service
    _app_service = app_service


@asynccontextmanager
async def lifespan_manager(settings: Settings):
    """
    FastAPI lifespan manager
    
    This function manages the application lifecycle for FastAPI.
    It's used in the main.py file to handle startup and shutdown.
    
    Args:
        settings: Application configuration
        
    Yields:
        The application service instance
    """
    # Create and start the application service
    app_service = AppService(settings)
    set_app_service(app_service)
    
    try:
        # Start up the application
        await app_service.startup()
        
        # Yield the service for use during the application lifetime
        yield app_service
        
    finally:
        # Shut down the application
        await app_service.shutdown()
        set_app_service(None) 