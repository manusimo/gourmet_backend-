"""
Dependency injection for the ML Recommendation System

This module provides dependency injection functions that make services
available to FastAPI route handlers. It acts as a bridge between the
application service and the route modules.
"""

from typing import Optional
from fastapi import HTTPException, Depends

from .services.app_service import get_app_service
from .database import DatabaseService
from .services.cache_service import CacheService
from .services.recommendation_service import RecommendationService
from .utils.monitoring import RecommendationMonitor


async def get_db_service() -> DatabaseService:
    """
    Dependency to get database service
    
    This ensures the database is available before processing requests
    """
    app_service = get_app_service()
    if not app_service:
        raise HTTPException(status_code=503, detail="Application service not available")
    
    db_service = app_service.get_db_service()
    if not db_service:
        raise HTTPException(status_code=503, detail="Database service not available")
    
    return db_service


async def get_cache_service() -> CacheService:
    """
    Dependency to get cache service
    
    This ensures Redis cache is available before processing requests
    """
    app_service = get_app_service()
    if not app_service:
        raise HTTPException(status_code=503, detail="Application service not available")
    
    cache_service = app_service.get_cache_service()
    if not cache_service:
        raise HTTPException(status_code=503, detail="Cache service not available")
    
    return cache_service


async def get_recommendation_service() -> RecommendationService:
    """
    Dependency to get recommendation service
    
    This ensures our ML models are loaded before processing requests
    """
    app_service = get_app_service()
    if not app_service:
        raise HTTPException(status_code=503, detail="Application service not available")
    
    rec_service = app_service.get_recommendation_service()
    if not rec_service:
        raise HTTPException(status_code=503, detail="Recommendation service not available")
    
    return rec_service


async def get_monitor() -> RecommendationMonitor:
    """
    Dependency to get monitoring service
    
    This ensures we can track performance metrics
    """
    app_service = get_app_service()
    if not app_service:
        raise HTTPException(status_code=503, detail="Application service not available")
    
    monitor = app_service.get_monitor()
    if not monitor:
        raise HTTPException(status_code=503, detail="Monitor service not available")
    
    return monitor


async def get_app_service_health() -> bool:
    """
    Dependency to check if the application service is healthy
    
    This can be used by health check endpoints
    """
    app_service = get_app_service()
    if not app_service:
        return False
    
    return app_service.is_healthy() 