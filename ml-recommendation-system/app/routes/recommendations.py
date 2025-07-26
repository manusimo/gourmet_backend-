"""
Recommendation API routes

This module contains all the API endpoints related to job recommendations.
It handles:
- Getting recommendations for users
- Training ML models
- Algorithm information

This separates the routing logic from the main application setup.
"""

import time
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
import structlog

from ..dependencies import get_recommendation_service, get_monitor
from ..services.recommendation_service import RecommendationService
from ..utils.monitoring import RecommendationMonitor

logger = structlog.get_logger()

# Create router for recommendation endpoints
router = APIRouter(prefix="/recommendations", tags=["recommendations"])


# ============================================================================
# DATA MODELS (Pydantic schemas)
# ============================================================================

class RecommendationRequest(BaseModel):
    """
    Request model for getting job recommendations
    
    This defines what data the frontend needs to send to get recommendations
    """
    user_id: int = Field(..., description="User ID to generate recommendations for")
    limit: int = Field(default=10, ge=1, le=50, description="Number of recommendations to return (1-50)")
    algorithm: str = Field(default="hybrid", description="Algorithm to use: collaborative, content, or hybrid")
    include_scores: bool = Field(default=False, description="Include recommendation scores in response")


class RecommendationResponse(BaseModel):
    """
    Response model for job recommendations
    
    This defines what data we send back to the frontend
    """
    user_id: int
    recommendations: List[int]  # List of job IDs that are recommended
    algorithm: str              # Which algorithm was used
    scores: Optional[List[float]] = None  # Optional confidence scores for each recommendation
    count: int                  # Number of recommendations returned
    timestamp: str              # When the recommendations were generated


class TrainingResponse(BaseModel):
    """
    Response model for model training requests
    """
    message: str
    models_trained: List[str]   # Which models were trained
    training_time: float        # How long training took


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/generate", response_model=RecommendationResponse)
async def generate_recommendations(
    request: RecommendationRequest,
    background_tasks: BackgroundTasks,
    rec_service: RecommendationService = Depends(get_recommendation_service),
    monitor_service: RecommendationMonitor = Depends(get_monitor)
):
    """
    Generate job recommendations for a user
    
    This is the main endpoint that:
    1. Takes a user ID and preferences
    2. Runs ML algorithms to find relevant jobs
    3. Returns a list of recommended job IDs
    4. Tracks performance metrics in the background
    
    The ML algorithms used:
    - Collaborative filtering: "Users like you also liked these jobs"
    - Content-based filtering: "Jobs similar to what you've liked before"
    - Hybrid: Combines both approaches for better results
    """
    start_time = time.time()  # Track how long this request takes
    
    try:
        logger.info(f"🎯 Generating recommendations for user {request.user_id}", 
                   algorithm=request.algorithm, limit=request.limit)
        
        # Call our ML service to get recommendations
        # This is where the magic happens - our ML models analyze the data
        recommendations, scores = await rec_service.get_recommendations(
            user_id=request.user_id,
            algorithm=request.algorithm,
            limit=request.limit
        )
        
        # Calculate how long this request took
        duration = time.time() - start_time
        
        # Log performance metrics in the background (doesn't slow down the response)
        background_tasks.add_task(
            monitor_service.log_recommendation_request,
            user_id=request.user_id,
            algorithm=request.algorithm,
            duration=duration,
            count=len(recommendations)
        )
        
        # Return the recommendations to the frontend
        return RecommendationResponse(
            user_id=request.user_id,
            recommendations=recommendations,  # List of job IDs
            algorithm=request.algorithm,      # Which algorithm was used
            scores=scores if request.include_scores else None,  # Optional confidence scores
            count=len(recommendations),       # How many recommendations we found
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S")  # When this was generated
        )
        
    except Exception as e:
        # If something goes wrong, log the error and return a helpful message
        duration = time.time() - start_time
        logger.error(f"❌ Recommendation generation failed for user {request.user_id}: {e}")
        
        # Log error metrics in the background
        background_tasks.add_task(
            monitor_service.log_recommendation_error,
            user_id=request.user_id,
            algorithm=request.algorithm,
            duration=duration,
            error=str(e)
        )
        
        # Return a proper error response to the frontend
        raise HTTPException(status_code=500, detail=f"Failed to generate recommendations: {str(e)}")


@router.post("/train", response_model=TrainingResponse)
async def train_models(
    background_tasks: BackgroundTasks,
    rec_service: RecommendationService = Depends(get_recommendation_service)
):
    """
    Retrain all recommendation models
    
    This endpoint allows us to:
    1. Update our ML models with new data
    2. Improve recommendation accuracy over time
    3. Adapt to changing user preferences
    
    Training happens in the background so the API stays responsive
    """
    start_time = time.time()
    
    try:
        logger.info("🔄 Starting model training")
        
        # Start training in the background (doesn't block the API)
        background_tasks.add_task(rec_service.train_models)
        
        training_time = time.time() - start_time
        
        return TrainingResponse(
            message="Model training started successfully",
            models_trained=["collaborative", "content", "hybrid"],
            training_time=training_time
        )
        
    except Exception as e:
        logger.error(f"❌ Model training failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start model training: {str(e)}")


@router.get("/algorithms")
async def get_available_algorithms():
    """
    Get list of available recommendation algorithms
    
    This helps the frontend know what options are available
    and what each algorithm does
    """
    return {
        "algorithms": [
            {
                "name": "collaborative",
                "description": "User-based collaborative filtering - finds jobs that similar users liked",
                "type": "collaborative"
            },
            {
                "name": "content",
                "description": "Content-based filtering - finds jobs similar to what you've liked before",
                "type": "content"
            },
            {
                "name": "hybrid",
                "description": "Combined approach - uses both collaborative and content-based filtering for better results",
                "type": "hybrid"
            }
        ]
    } 