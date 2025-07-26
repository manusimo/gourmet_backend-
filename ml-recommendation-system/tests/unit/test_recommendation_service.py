"""
Unit tests for Recommendation Service

This module tests the core ML recommendation functionality:
- Model training
- Recommendation generation
- Error handling
- Performance optimization
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pandas as pd
import numpy as np

from app.services.recommendation_service import RecommendationService
from app.exceptions.custom_exceptions import (
    ModelTrainingError, PredictionError, ValidationError,
    DatabaseError, CacheError
)


class TestRecommendationService:
    """Test cases for RecommendationService"""
    
    @pytest.fixture
    def mock_db_service(self):
        """Mock database service"""
        mock_db = AsyncMock()
        mock_db.is_healthy.return_value = True
        return mock_db
    
    @pytest.fixture
    def mock_cache_service(self):
        """Mock cache service"""
        mock_cache = AsyncMock()
        mock_cache.is_healthy.return_value = True
        return mock_cache
    
    @pytest.fixture
    def recommendation_service(self, mock_db_service, mock_cache_service):
        """Recommendation service with mocked dependencies"""
        return RecommendationService(mock_db_service, mock_cache_service)
    
    @pytest.fixture
    def sample_interactions_data(self):
        """Sample user interactions data"""
        return pd.DataFrame({
            'user_id': [1, 1, 2, 2, 3, 3],
            'job_id': [1, 2, 1, 3, 2, 4],
            'rating': [5, 4, 3, 5, 4, 3],
            'created_at': pd.date_range('2024-01-01', periods=6, freq='D')
        })
    
    @pytest.fixture
    def sample_jobs_data(self):
        """Sample jobs data"""
        return pd.DataFrame({
            'job_id': [1, 2, 3, 4],
            'title': ['Software Engineer', 'Data Scientist', 'Product Manager', 'DevOps Engineer'],
            'description': [
                'Build scalable applications',
                'Analyze data and create models',
                'Lead product development',
                'Manage infrastructure'
            ],
            'required_skills': [
                ['Python', 'JavaScript'],
                ['Python', 'Machine Learning'],
                ['Product Management', 'Agile'],
                ['Docker', 'Kubernetes']
            ],
            'location': ['San Francisco', 'New York', 'Seattle', 'Austin'],
            'job_type': ['Full-time', 'Full-time', 'Full-time', 'Full-time']
        })
    
    # ============================================================================
    # INITIALIZATION TESTS
    # ============================================================================
    
    @pytest.mark.unit
    def test_initialization(self, recommendation_service):
        """Test service initialization"""
        assert recommendation_service.db_service is not None
        assert recommendation_service.cache_service is not None
        assert recommendation_service.models_loaded is False
        assert recommendation_service.last_training_time is None
    
    @pytest.mark.unit
    def test_initialization_with_invalid_dependencies(self):
        """Test initialization with invalid dependencies"""
        with pytest.raises(TypeError):
            RecommendationService(None, None)
    
    # ============================================================================
    # MODEL TRAINING TESTS
    # ============================================================================
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_train_models_success(self, recommendation_service, sample_interactions_data, sample_jobs_data):
        """Test successful model training"""
        # Mock database responses
        recommendation_service.db_service.load_interactions_data.return_value = sample_interactions_data
        recommendation_service.db_service.load_jobs_data.return_value = sample_jobs_data
        
        # Train models
        await recommendation_service.train_models()
        
        # Verify models are loaded
        assert recommendation_service.models_loaded is True
        assert recommendation_service.last_training_time is not None
        assert recommendation_service.collaborative_model is not None
        assert recommendation_service.content_vectorizer is not None
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_train_models_database_error(self, recommendation_service):
        """Test model training with database error"""
        # Mock database error
        recommendation_service.db_service.load_interactions_data.side_effect = DatabaseError("Database connection failed")
        
        with pytest.raises(ModelTrainingError):
            await recommendation_service.train_models()
        
        assert recommendation_service.models_loaded is False
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_train_models_insufficient_data(self, recommendation_service):
        """Test model training with insufficient data"""
        # Mock empty data
        recommendation_service.db_service.load_interactions_data.return_value = pd.DataFrame()
        recommendation_service.db_service.load_jobs_data.return_value = pd.DataFrame()
        
        with pytest.raises(ModelTrainingError, match="Insufficient training data"):
            await recommendation_service.train_models()
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_train_models_cache_error(self, recommendation_service, sample_interactions_data, sample_jobs_data):
        """Test model training with cache error"""
        # Mock database responses
        recommendation_service.db_service.load_interactions_data.return_value = sample_interactions_data
        recommendation_service.db_service.load_jobs_data.return_value = sample_jobs_data
        
        # Mock cache error
        recommendation_service.cache_service.set_recommendations.side_effect = CacheError("Cache connection failed")
        
        # Training should still succeed (cache is optional)
        await recommendation_service.train_models()
        assert recommendation_service.models_loaded is True
    
    # ============================================================================
    # RECOMMENDATION GENERATION TESTS
    # ============================================================================
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_recommendations_hybrid_success(self, recommendation_service):
        """Test successful hybrid recommendation generation"""
        # Mock trained models
        recommendation_service.models_loaded = True
        recommendation_service.collaborative_model = MagicMock()
        recommendation_service.content_vectorizer = MagicMock()
        recommendation_service.content_similarity_matrix = np.array([[1, 0.5], [0.5, 1]])
        
        # Mock cache miss
        recommendation_service.cache_service.get_recommendations.return_value = None
        
        # Mock recommendation results
        recommendation_service._get_collaborative_recommendations = AsyncMock(return_value=([1, 2], [0.9, 0.8]))
        recommendation_service._get_content_recommendations = AsyncMock(return_value=([2, 3], [0.8, 0.7]))
        
        # Get recommendations
        recommendations, scores = await recommendation_service.get_recommendations(
            user_id=1, algorithm="hybrid", limit=5
        )
        
        # Verify results
        assert len(recommendations) > 0
        assert len(scores) > 0
        assert len(recommendations) == len(scores)
        assert all(0 <= score <= 1 for score in scores)
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_recommendations_collaborative_success(self, recommendation_service):
        """Test successful collaborative recommendation generation"""
        # Mock trained models
        recommendation_service.models_loaded = True
        recommendation_service.collaborative_model = MagicMock()
        
        # Mock cache miss
        recommendation_service.cache_service.get_recommendations.return_value = None
        
        # Mock recommendation results
        recommendation_service._get_collaborative_recommendations = AsyncMock(return_value=([1, 2, 3], [0.9, 0.8, 0.7]))
        
        # Get recommendations
        recommendations, scores = await recommendation_service.get_recommendations(
            user_id=1, algorithm="collaborative", limit=3
        )
        
        # Verify results
        assert len(recommendations) == 3
        assert len(scores) == 3
        assert recommendations == [1, 2, 3]
        assert scores == [0.9, 0.8, 0.7]
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_recommendations_content_success(self, recommendation_service):
        """Test successful content-based recommendation generation"""
        # Mock trained models
        recommendation_service.models_loaded = True
        recommendation_service.content_vectorizer = MagicMock()
        recommendation_service.content_similarity_matrix = np.array([[1, 0.5], [0.5, 1]])
        
        # Mock cache miss
        recommendation_service.cache_service.get_recommendations.return_value = None
        
        # Mock recommendation results
        recommendation_service._get_content_recommendations = AsyncMock(return_value=([2, 4, 6], [0.8, 0.7, 0.6]))
        
        # Get recommendations
        recommendations, scores = await recommendation_service.get_recommendations(
            user_id=1, algorithm="content", limit=3
        )
        
        # Verify results
        assert len(recommendations) == 3
        assert len(scores) == 3
        assert recommendations == [2, 4, 6]
        assert scores == [0.8, 0.7, 0.6]
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_recommendations_cache_hit(self, recommendation_service):
        """Test recommendation generation with cache hit"""
        # Mock cache hit
        cached_recommendations = [1, 2, 3, 4, 5]
        cached_scores = [0.9, 0.8, 0.7, 0.6, 0.5]
        recommendation_service.cache_service.get_recommendations.return_value = {
            'recommendations': cached_recommendations,
            'scores': cached_scores
        }
        
        # Get recommendations
        recommendations, scores = await recommendation_service.get_recommendations(
            user_id=1, algorithm="hybrid", limit=5
        )
        
        # Verify cached results are returned
        assert recommendations == cached_recommendations
        assert scores == cached_scores
        
        # Verify no model training was called
        recommendation_service._get_collaborative_recommendations.assert_not_called()
        recommendation_service._get_content_recommendations.assert_not_called()
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_recommendations_models_not_loaded(self, recommendation_service):
        """Test recommendation generation when models are not loaded"""
        recommendation_service.models_loaded = False
        
        with pytest.raises(PredictionError, match="Models not loaded"):
            await recommendation_service.get_recommendations(user_id=1)
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_recommendations_invalid_algorithm(self, recommendation_service):
        """Test recommendation generation with invalid algorithm"""
        recommendation_service.models_loaded = True
        
        with pytest.raises(ValidationError, match="Invalid algorithm"):
            await recommendation_service.get_recommendations(user_id=1, algorithm="invalid")
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_recommendations_invalid_user_id(self, recommendation_service):
        """Test recommendation generation with invalid user ID"""
        recommendation_service.models_loaded = True
        
        with pytest.raises(ValidationError, match="Invalid user ID"):
            await recommendation_service.get_recommendations(user_id=-1)
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_recommendations_invalid_limit(self, recommendation_service):
        """Test recommendation generation with invalid limit"""
        recommendation_service.models_loaded = True
        
        with pytest.raises(ValidationError, match="Invalid limit"):
            await recommendation_service.get_recommendations(user_id=1, limit=0)
        
        with pytest.raises(ValidationError, match="Invalid limit"):
            await recommendation_service.get_recommendations(user_id=1, limit=101)
    
    # ============================================================================
    # COLLABORATIVE FILTERING TESTS
    # ============================================================================
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_collaborative_recommendations_success(self, recommendation_service):
        """Test successful collaborative filtering"""
        # Mock trained model
        mock_model = MagicMock()
        mock_model.predict.return_value = 4.5
        recommendation_service.collaborative_model = mock_model
        
        # Mock user interactions
        recommendation_service.interactions_df = pd.DataFrame({
            'user_id': [1, 1, 2, 2],
            'job_id': [1, 2, 1, 3],
            'rating': [5, 4, 3, 5]
        })
        
        # Mock jobs data
        recommendation_service.jobs_df = pd.DataFrame({
            'job_id': [1, 2, 3, 4, 5],
            'title': ['Job 1', 'Job 2', 'Job 3', 'Job 4', 'Job 5']
        })
        
        # Get recommendations
        recommendations, scores = await recommendation_service._get_collaborative_recommendations(
            user_id=1, limit=3
        )
        
        # Verify results
        assert len(recommendations) <= 3
        assert len(scores) == len(recommendations)
        assert all(isinstance(rec, int) for rec in recommendations)
        assert all(0 <= score <= 5 for score in scores)
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_collaborative_recommendations_no_interactions(self, recommendation_service):
        """Test collaborative filtering with no user interactions"""
        # Mock trained model
        recommendation_service.collaborative_model = MagicMock()
        
        # Mock empty interactions
        recommendation_service.interactions_df = pd.DataFrame()
        
        with pytest.raises(PredictionError, match="No user interactions found"):
            await recommendation_service._get_collaborative_recommendations(user_id=1, limit=3)
    
    # ============================================================================
    # CONTENT-BASED FILTERING TESTS
    # ============================================================================
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_content_recommendations_success(self, recommendation_service):
        """Test successful content-based filtering"""
        # Mock trained vectorizer and similarity matrix
        recommendation_service.content_vectorizer = MagicMock()
        recommendation_service.content_similarity_matrix = np.array([
            [1.0, 0.8, 0.6, 0.4],
            [0.8, 1.0, 0.7, 0.5],
            [0.6, 0.7, 1.0, 0.8],
            [0.4, 0.5, 0.8, 1.0]
        ])
        
        # Mock jobs data
        recommendation_service.jobs_df = pd.DataFrame({
            'job_id': [1, 2, 3, 4],
            'title': ['Job 1', 'Job 2', 'Job 3', 'Job 4']
        })
        
        # Mock user interactions
        recommendation_service.interactions_df = pd.DataFrame({
            'user_id': [1, 1],
            'job_id': [1, 2],
            'rating': [5, 4]
        })
        
        # Get recommendations
        recommendations, scores = await recommendation_service._get_content_recommendations(
            user_id=1, limit=2
        )
        
        # Verify results
        assert len(recommendations) <= 2
        assert len(scores) == len(recommendations)
        assert all(isinstance(rec, int) for rec in recommendations)
        assert all(0 <= score <= 1 for score in scores)
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_content_recommendations_no_user_history(self, recommendation_service):
        """Test content-based filtering with no user history"""
        # Mock trained vectorizer
        recommendation_service.content_vectorizer = MagicMock()
        recommendation_service.content_similarity_matrix = np.array([[1, 0.5], [0.5, 1]])
        
        # Mock empty user interactions
        recommendation_service.interactions_df = pd.DataFrame()
        
        with pytest.raises(PredictionError, match="No user history found"):
            await recommendation_service._get_content_recommendations(user_id=1, limit=3)
    
    # ============================================================================
    # HYBRID RECOMMENDATION TESTS
    # ============================================================================
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_hybrid_recommendations_success(self, recommendation_service):
        """Test successful hybrid recommendation generation"""
        # Mock individual recommendation methods
        recommendation_service._get_collaborative_recommendations = AsyncMock(
            return_value=([1, 2, 3], [0.9, 0.8, 0.7])
        )
        recommendation_service._get_content_recommendations = AsyncMock(
            return_value=([2, 4, 6], [0.8, 0.7, 0.6])
        )
        
        # Get hybrid recommendations
        recommendations, scores = await recommendation_service._get_hybrid_recommendations(
            user_id=1, limit=5
        )
        
        # Verify results
        assert len(recommendations) <= 5
        assert len(scores) == len(recommendations)
        assert all(isinstance(rec, int) for rec in recommendations)
        assert all(0 <= score <= 1 for score in scores)
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_hybrid_recommendations_one_algorithm_fails(self, recommendation_service):
        """Test hybrid recommendations when one algorithm fails"""
        # Mock collaborative filtering to fail
        recommendation_service._get_collaborative_recommendations = AsyncMock(
            side_effect=PredictionError("Collaborative filtering failed")
        )
        
        # Mock content-based filtering to succeed
        recommendation_service._get_content_recommendations = AsyncMock(
            return_value=([2, 4, 6], [0.8, 0.7, 0.6])
        )
        
        # Get hybrid recommendations (should fall back to content-based)
        recommendations, scores = await recommendation_service._get_hybrid_recommendations(
            user_id=1, limit=3
        )
        
        # Verify content-based results are returned
        assert recommendations == [2, 4, 6]
        assert scores == [0.8, 0.7, 0.6]
    
    # ============================================================================
    # MODEL INFO TESTS
    # ============================================================================
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_model_info(self, recommendation_service):
        """Test getting model information"""
        # Set up model state
        recommendation_service.models_loaded = True
        recommendation_service.last_training_time = "2024-01-01T00:00:00"
        recommendation_service.collaborative_model = MagicMock()
        recommendation_service.content_vectorizer = MagicMock()
        
        # Get model info
        info = await recommendation_service.get_model_info()
        
        # Verify info structure
        assert "models_loaded" in info
        assert "last_training_time" in info
        assert "collaborative_model" in info
        assert "content_model" in info
        assert info["models_loaded"] is True
        assert info["last_training_time"] == "2024-01-01T00:00:00"
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_model_info_not_trained(self, recommendation_service):
        """Test getting model info when models are not trained"""
        recommendation_service.models_loaded = False
        
        info = await recommendation_service.get_model_info()
        
        assert info["models_loaded"] is False
        assert info["last_training_time"] is None
    
    # ============================================================================
    # ERROR HANDLING TESTS
    # ============================================================================
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_handle_database_connection_error(self, recommendation_service):
        """Test handling database connection errors"""
        recommendation_service.db_service.load_interactions_data.side_effect = DatabaseError("Connection failed")
        
        with pytest.raises(ModelTrainingError):
            await recommendation_service.train_models()
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_handle_cache_connection_error(self, recommendation_service):
        """Test handling cache connection errors"""
        recommendation_service.cache_service.get_recommendations.side_effect = CacheError("Cache failed")
        
        # Should not raise error, just log warning
        recommendation_service.models_loaded = True
        await recommendation_service.get_recommendations(user_id=1)
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_handle_ml_model_error(self, recommendation_service):
        """Test handling ML model errors"""
        recommendation_service.models_loaded = True
        recommendation_service.collaborative_model = MagicMock()
        recommendation_service.collaborative_model.predict.side_effect = Exception("Model error")
        
        with pytest.raises(PredictionError):
            await recommendation_service._get_collaborative_recommendations(user_id=1, limit=3)
    
    # ============================================================================
    # PERFORMANCE TESTS
    # ============================================================================
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_recommendation_generation_performance(self, recommendation_service):
        """Test recommendation generation performance"""
        import time
        
        # Mock trained models
        recommendation_service.models_loaded = True
        recommendation_service._get_hybrid_recommendations = AsyncMock(
            return_value=([1, 2, 3, 4, 5], [0.9, 0.8, 0.7, 0.6, 0.5])
        )
        
        # Measure performance
        start_time = time.time()
        await recommendation_service.get_recommendations(user_id=1, limit=5)
        end_time = time.time()
        
        # Should complete within 1 second
        assert (end_time - start_time) < 1.0
    
    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_concurrent_recommendation_requests(self, recommendation_service):
        """Test concurrent recommendation requests"""
        # Mock trained models
        recommendation_service.models_loaded = True
        recommendation_service._get_hybrid_recommendations = AsyncMock(
            return_value=([1, 2, 3], [0.9, 0.8, 0.7])
        )
        
        # Create concurrent requests
        async def make_request(user_id):
            return await recommendation_service.get_recommendations(user_id=user_id, limit=3)
        
        # Run concurrent requests
        tasks = [make_request(i) for i in range(5)]
        results = await asyncio.gather(*tasks)
        
        # Verify all requests completed successfully
        assert len(results) == 5
        for recommendations, scores in results:
            assert len(recommendations) == 3
            assert len(scores) == 3 