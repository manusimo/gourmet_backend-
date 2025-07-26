"""
Health and monitoring API routes

This module contains endpoints for:
- Health checks
- System metrics
- Monitoring data

This separates health/monitoring logic from the main application.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import structlog

from ..dependencies import get_db_service, get_cache_service, get_recommendation_service, get_monitor
from ..utils.monitoring import RecommendationMonitor
from ..database import DatabaseService
from ..services.cache_service import CacheService
from ..services.recommendation_service import RecommendationService

logger = structlog.get_logger()

# Create router for health and monitoring endpoints
router = APIRouter(tags=["health"])


# ============================================================================
# DATA MODELS (Pydantic schemas)
# ============================================================================

class HealthResponse(BaseModel):
    """
    Response model for health check endpoint
    """
    status: str                 # Overall system status
    version: str                # API version
    database: str               # Database connection status
    cache: str                  # Cache connection status
    models: str                 # ML models status


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.get("/health", response_model=HealthResponse)
async def health_check(
    db_service: DatabaseService = Depends(get_db_service),
    cache_service: CacheService = Depends(get_cache_service),
    rec_service: RecommendationService = Depends(get_recommendation_service)
):
    """
    Health check endpoint
    
    This endpoint tells us if all parts of our system are working:
    - Database connection
    - Cache connection  
    - ML models loaded
    - Overall system status
    
    Frontend can call this to check if the recommendation service is available
    """
    try:
        # Check each service individually
        db_status = "healthy" if await db_service.is_healthy() else "unhealthy"
        cache_status = "healthy" if await cache_service.is_healthy() else "unhealthy"
        models_status = "healthy" if rec_service.models_loaded else "unhealthy"
        
        return HealthResponse(
            status="healthy",
            version="1.0.0",
            database=db_status,
            cache=cache_status,
            models=models_status
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            version="1.0.0",
            database="unknown",
            cache="unknown",
            models="unknown"
        )


@router.get("/metrics")
async def get_metrics(monitor_service: RecommendationMonitor = Depends(get_monitor)):
    """
    Get system metrics
    
    This endpoint provides performance data like:
    - Average response times
    - Number of requests per algorithm
    - Error rates
    - Model accuracy metrics
    
    Useful for monitoring and debugging the system
    """
    try:
        metrics = await monitor_service.get_metrics()
        return metrics
    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get metrics")


@router.get("/prometheus")
async def get_prometheus_metrics(monitor_service: RecommendationMonitor = Depends(get_monitor)):
    """
    Get metrics in Prometheus format
    
    This endpoint returns metrics in the standard Prometheus text format
    for integration with monitoring systems like Grafana.
    """
    try:
        from fastapi.responses import PlainTextResponse
        metrics = await monitor_service.export_prometheus_metrics()
        return PlainTextResponse(content=metrics, media_type="text/plain")
    except Exception as e:
        logger.error(f"Failed to get Prometheus metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get Prometheus metrics") 