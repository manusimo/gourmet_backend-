"""
Test configuration and fixtures for ML Recommendation System

This module provides:
1. Test configuration and setup
2. Database and cache fixtures
3. Mock services for testing
4. Test utilities and helpers
"""

import pytest
import asyncio
import tempfile
import os
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import redis.asyncio as redis

# Import our application modules
from app.main import app
from app.database import DatabaseService
from app.services.cache_service import CacheService
from app.services.recommendation_service import RecommendationService
from app.services.app_service import AppService
from app.utils.monitoring import RecommendationMonitor
from app.utils.config import Settings
from app.auth.jwt_handler import JWTHandler


# ============================================================================
# TEST CONFIGURATION
# ============================================================================

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_settings():
    """Test settings with safe defaults"""
    return Settings(
        database_url="postgresql://test:test@localhost:5432/test_db",
        redis_url="redis://localhost:6379/1",
        secret_key="test-secret-key-for-testing-only-32-chars",
        debug=True,
        log_level="DEBUG"
    )


@pytest.fixture
def client():
    """FastAPI test client"""
    return TestClient(app)


# ============================================================================
# DATABASE FIXTURES
# ============================================================================

@pytest.fixture
async def test_database():
    """Test database service with temporary database"""
    # Use a temporary database for testing
    database_url = "postgresql://test:test@localhost:5432/test_db"
    
    db_service = DatabaseService(
        database_url=database_url,
        pool_size=5,
        max_overflow=10
    )
    
    try:
        await db_service.connect()
        yield db_service
    finally:
        await db_service.close()


@pytest.fixture
async def mock_database():
    """Mock database service for unit testing"""
    mock_db = AsyncMock(spec=DatabaseService)
    
    # Mock successful operations
    mock_db.is_healthy.return_value = True
    mock_db.load_interactions_data.return_value = create_sample_interactions()
    mock_db.load_jobs_data.return_value = create_sample_jobs()
    mock_db.load_user_preferences.return_value = create_sample_preferences()
    mock_db.get_job_details.return_value = create_sample_job_details()
    
    # Mock async context manager
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=None)
    
    return mock_db


# ============================================================================
# CACHE FIXTURES
# ============================================================================

@pytest.fixture
async def test_cache():
    """Test cache service with temporary Redis database"""
    cache_service = CacheService(
        redis_url="redis://localhost:6379/1",
        db=1
    )
    
    try:
        await cache_service.connect()
        yield cache_service
    finally:
        await cache_service.close()


@pytest.fixture
async def mock_cache():
    """Mock cache service for unit testing"""
    mock_cache = AsyncMock(spec=CacheService)
    
    # Mock successful operations
    mock_cache.is_healthy.return_value = True
    mock_cache.get_recommendations.return_value = None  # Cache miss
    mock_cache.set_recommendations.return_value = True
    mock_cache.get_job_similarity.return_value = None
    mock_cache.set_job_similarity.return_value = True
    
    # Mock async context manager
    mock_cache.__aenter__ = AsyncMock(return_value=mock_cache)
    mock_cache.__aexit__ = AsyncMock(return_value=None)
    
    return mock_cache


# ============================================================================
# ML SERVICE FIXTURES
# ============================================================================

@pytest.fixture
async def mock_recommendation_service(mock_database, mock_cache):
    """Mock recommendation service for testing"""
    service = RecommendationService(mock_database, mock_cache)
    
    # Mock successful operations
    service.models_loaded = True
    service.last_training_time = "2024-01-01T00:00:00"
    
    # Mock recommendation generation
    async def mock_get_recommendations(user_id, algorithm="hybrid", limit=10):
        return ([1, 2, 3, 4, 5], [0.9, 0.8, 0.7, 0.6, 0.5])
    
    service.get_recommendations = mock_get_recommendations
    
    return service


@pytest.fixture
async def test_recommendation_service(test_database, test_cache):
    """Real recommendation service for integration testing"""
    service = RecommendationService(test_database, test_cache)
    
    # Train models with test data
    try:
        await service.train_models()
        yield service
    finally:
        # Cleanup
        pass


# ============================================================================
# APPLICATION SERVICE FIXTURES
# ============================================================================

@pytest.fixture
async def test_app_service(test_settings):
    """Test application service"""
    app_service = AppService(test_settings)
    
    try:
        await app_service.startup()
        yield app_service
    finally:
        await app_service.shutdown()


@pytest.fixture
async def mock_app_service(test_settings):
    """Mock application service for testing"""
    mock_service = MagicMock(spec=AppService)
    
    # Mock successful startup
    mock_service.startup = AsyncMock()
    mock_service.shutdown = AsyncMock()
    mock_service.is_healthy.return_value = True
    mock_service.is_running = True
    mock_service.startup_complete = True
    
    return mock_service


# ============================================================================
# MONITORING FIXTURES
# ============================================================================

@pytest.fixture
def test_monitor():
    """Test monitoring service"""
    return RecommendationMonitor()


@pytest.fixture
def mock_monitor():
    """Mock monitoring service"""
    mock_monitor = MagicMock(spec=RecommendationMonitor)
    
    # Mock metrics
    mock_monitor.get_metrics.return_value = {
        "total_requests": 100,
        "average_response_time": 0.15,
        "error_rate": 0.02,
        "cache_hit_rate": 0.75
    }
    
    mock_monitor.get_health_status.return_value = {
        "status": "healthy",
        "services": {
            "database": "healthy",
            "cache": "healthy",
            "models": "healthy"
        }
    }
    
    return mock_monitor


# ============================================================================
# AUTHENTICATION FIXTURES
# ============================================================================

@pytest.fixture
def test_jwt_handler():
    """Test JWT handler"""
    return JWTHandler()


@pytest.fixture
def valid_token():
    """Generate a valid JWT token for testing"""
    return JWTHandler.create_access_token({"sub": "123", "username": "testuser"})


@pytest.fixture
def invalid_token():
    """Invalid JWT token for testing"""
    return "invalid.token.here"


@pytest.fixture
def auth_headers(valid_token):
    """Headers with valid authentication"""
    return {"Authorization": f"Bearer {valid_token}"}


@pytest.fixture
def invalid_auth_headers(invalid_token):
    """Headers with invalid authentication"""
    return {"Authorization": f"Bearer {invalid_token}"}


# ============================================================================
# SAMPLE DATA GENERATORS
# ============================================================================

def create_sample_interactions():
    """Create sample user interactions for testing"""
    import pandas as pd
    
    data = {
        'user_id': [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
        'job_id': [1, 2, 1, 3, 2, 4, 1, 5, 3, 6],
        'rating': [5, 4, 3, 5, 4, 3, 5, 4, 3, 5],
        'created_at': pd.date_range('2024-01-01', periods=10, freq='D')
    }
    
    return pd.DataFrame(data)


def create_sample_jobs():
    """Create sample job data for testing"""
    import pandas as pd
    
    data = {
        'job_id': [1, 2, 3, 4, 5, 6],
        'title': ['Software Engineer', 'Data Scientist', 'Product Manager', 'DevOps Engineer', 'UX Designer', 'QA Engineer'],
        'description': [
            'Build scalable web applications',
            'Analyze data and create ML models',
            'Lead product development',
            'Manage infrastructure and deployment',
            'Design user interfaces',
            'Test software quality'
        ],
        'required_skills': [
            ['Python', 'JavaScript', 'React'],
            ['Python', 'Machine Learning', 'Statistics'],
            ['Product Management', 'Agile', 'User Research'],
            ['Docker', 'Kubernetes', 'AWS'],
            ['Figma', 'User Research', 'Prototyping'],
            ['Testing', 'Automation', 'Quality Assurance']
        ],
        'location': ['San Francisco', 'New York', 'Seattle', 'Austin', 'Boston', 'Chicago'],
        'job_type': ['Full-time', 'Full-time', 'Full-time', 'Full-time', 'Full-time', 'Full-time'],
        'salary_min': [80000, 90000, 100000, 85000, 75000, 70000],
        'salary_max': [120000, 130000, 150000, 120000, 110000, 100000]
    }
    
    return pd.DataFrame(data)


def create_sample_preferences():
    """Create sample user preferences for testing"""
    return {
        'user_id': 1,
        'preferences': {
            'skills': ['Python', 'Machine Learning'],
            'location': 'San Francisco',
            'job_type': 'Full-time',
            'salary_range': [80000, 120000],
            'experience_level': 'Mid-level'
        }
    }


def create_sample_job_details():
    """Create sample job details for testing"""
    import pandas as pd
    
    data = {
        'job_id': [1, 2, 3, 4, 5, 6],
        'title': ['Software Engineer', 'Data Scientist', 'Product Manager', 'DevOps Engineer', 'UX Designer', 'QA Engineer'],
        'description': [
            'Build scalable web applications',
            'Analyze data and create ML models',
            'Lead product development',
            'Manage infrastructure and deployment',
            'Design user interfaces',
            'Test software quality'
        ],
        'required_skills': [
            ['Python', 'JavaScript', 'React'],
            ['Python', 'Machine Learning', 'Statistics'],
            ['Product Management', 'Agile', 'User Research'],
            ['Docker', 'Kubernetes', 'AWS'],
            ['Figma', 'User Research', 'Prototyping'],
            ['Testing', 'Automation', 'Quality Assurance']
        ],
        'location': ['San Francisco', 'New York', 'Seattle', 'Austin', 'Boston', 'Chicago'],
        'job_type': ['Full-time', 'Full-time', 'Full-time', 'Full-time', 'Full-time', 'Full-time'],
        'salary_min': [80000, 90000, 100000, 85000, 75000, 70000],
        'salary_max': [120000, 130000, 150000, 120000, 110000, 100000]
    }
    
    return pd.DataFrame(data)


# ============================================================================
# TEST UTILITIES
# ============================================================================

def assert_response_structure(response_data, expected_fields):
    """Assert that response has expected structure"""
    for field in expected_fields:
        assert field in response_data, f"Missing field: {field}"


def assert_error_response(response, status_code, error_type=None):
    """Assert that response is an error response"""
    assert response.status_code == status_code
    data = response.json()
    assert "error" in data or "detail" in data
    
    if error_type:
        assert data.get("error") == error_type or data.get("type") == error_type


def assert_success_response(response, status_code=200):
    """Assert that response is successful"""
    assert response.status_code == status_code
    data = response.json()
    assert "error" not in data


# ============================================================================
# PERFORMANCE TESTING UTILITIES
# ============================================================================

async def measure_response_time(client, method, url, **kwargs):
    """Measure response time for performance testing"""
    import time
    
    start_time = time.time()
    response = getattr(client, method.lower())(url, **kwargs)
    end_time = time.time()
    
    return {
        "response_time": end_time - start_time,
        "status_code": response.status_code,
        "response": response
    }


def assert_performance_threshold(response_time, max_time=1.0):
    """Assert that response time is within acceptable threshold"""
    assert response_time < max_time, f"Response time {response_time}s exceeds threshold {max_time}s"


# ============================================================================
# CONCURRENT TESTING UTILITIES
# ============================================================================

async def run_concurrent_requests(client, method, url, num_requests=10, **kwargs):
    """Run multiple concurrent requests for load testing"""
    import asyncio
    import httpx
    
    async def make_request():
        async with httpx.AsyncClient(app=app, base_url="http://test") as ac:
            return await getattr(ac, method.lower())(url, **kwargs)
    
    tasks = [make_request() for _ in range(num_requests)]
    return await asyncio.gather(*tasks, return_exceptions=True)


# ============================================================================
# DATABASE TESTING UTILITIES
# ============================================================================

async def clean_test_database(db_service):
    """Clean test database between tests"""
    # This would clean all test data
    # Implementation depends on your database structure
    pass


async def setup_test_data(db_service):
    """Set up test data in database"""
    # This would insert test data
    # Implementation depends on your database structure
    pass


# ============================================================================
# CACHE TESTING UTILITIES
# ============================================================================

async def clean_test_cache(cache_service):
    """Clean test cache between tests"""
    await cache_service.clear_all_cache()


async def setup_test_cache_data(cache_service):
    """Set up test data in cache"""
    # Add some test cache entries
    await cache_service.set_recommendations("test_user_1", [1, 2, 3], 3600)
    await cache_service.set_job_similarity("job_1", {"job_2": 0.8, "job_3": 0.6}, 3600)


# ============================================================================
# MARKERS AND CONFIGURATION
# ============================================================================

def pytest_configure(config):
    """Configure pytest with custom markers"""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "performance: mark test as a performance test"
    )
    config.addinivalue_line(
        "markers", "security: mark test as a security test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers based on test names"""
    for item in items:
        # Add markers based on test file names
        if "test_unit" in item.nodeid:
            item.add_marker(pytest.mark.unit)
        elif "test_integration" in item.nodeid:
            item.add_marker(pytest.mark.integration)
        elif "test_performance" in item.nodeid:
            item.add_marker(pytest.mark.performance)
        elif "test_security" in item.nodeid:
            item.add_marker(pytest.mark.security)
        
        # Add slow marker for tests that take longer
        if "test_train_models" in item.nodeid or "test_full_pipeline" in item.nodeid:
            item.add_marker(pytest.mark.slow) 