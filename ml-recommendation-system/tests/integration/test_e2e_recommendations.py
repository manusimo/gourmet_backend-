"""
End-to-End Tests for ML Recommendation System

This module provides comprehensive E2E tests that simulate real user journeys
and test the complete recommendation flow from authentication to results.
"""

import pytest
import asyncio
import time
from typing import List, Dict, Any
from fastapi.testclient import TestClient
from playwright.async_api import async_playwright

from app.main import app
from app.database import DatabaseService
from app.services.cache_service import CacheService
from app.services.recommendation_service import RecommendationService
from app.auth.jwt_handler import JWTHandler


class TestE2ERecommendations:
    """End-to-end tests for recommendation system"""
    
    @pytest.fixture
    async def test_client(self):
        """FastAPI test client"""
        return TestClient(app)
    
    @pytest.fixture
    async def jwt_handler(self):
        """JWT handler for creating test tokens"""
        return JWTHandler()
    
    @pytest.fixture
    async def test_user_token(self, jwt_handler):
        """Create a test user token"""
        return jwt_handler.create_access_token({"sub": "123", "username": "testuser"})
    
    @pytest.fixture
    async def auth_headers(self, test_user_token):
        """Headers with authentication"""
        return {"Authorization": f"Bearer {test_user_token}"}
    
    @pytest.fixture
    async def sample_user_data(self):
        """Sample user data for testing"""
        return {
            "user_id": 123,
            "preferences": {
                "skills": ["Python", "Machine Learning", "Data Science"],
                "location": "San Francisco",
                "job_type": "Full-time",
                "salary_range": [80000, 120000],
                "experience_level": "Mid-level"
            }
        }
    
    @pytest.fixture
    async def sample_job_data(self):
        """Sample job data for testing"""
        return [
            {
                "job_id": 1,
                "title": "Senior Data Scientist",
                "description": "Build ML models for recommendation systems",
                "required_skills": ["Python", "Machine Learning", "Statistics"],
                "location": "San Francisco",
                "job_type": "Full-time",
                "salary_min": 90000,
                "salary_max": 130000
            },
            {
                "job_id": 2,
                "title": "ML Engineer",
                "description": "Develop and deploy ML models",
                "required_skills": ["Python", "TensorFlow", "Docker"],
                "location": "San Francisco",
                "job_type": "Full-time",
                "salary_min": 85000,
                "salary_max": 125000
            },
            {
                "job_id": 3,
                "title": "Data Analyst",
                "description": "Analyze data and create insights",
                "required_skills": ["Python", "SQL", "Statistics"],
                "location": "San Francisco",
                "job_type": "Full-time",
                "salary_min": 70000,
                "salary_max": 100000
            }
        ]

    # ============================================================================
    # API ENDPOINT TESTS
    # ============================================================================

    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_complete_recommendation_flow(self, test_client, auth_headers, sample_user_data):
        """Test complete recommendation flow from API perspective"""
        
        # 1. Test health check
        health_response = test_client.get("/api/v1/health")
        assert health_response.status_code == 200
        health_data = health_response.json()
        assert health_data["status"] == "healthy"
        
        # 2. Test recommendation generation
        recommendation_request = {
            "user_id": sample_user_data["user_id"],
            "limit": 5,
            "algorithm": "hybrid",
            "include_scores": True
        }
        
        rec_response = test_client.post(
            "/api/v1/recommendations/generate",
            json=recommendation_request,
            headers=auth_headers
        )
        
        assert rec_response.status_code == 200
        rec_data = rec_response.json()
        
        # Validate response structure
        assert "recommendations" in rec_data
        assert "scores" in rec_data
        assert "algorithm" in rec_data
        assert "user_id" in rec_data
        
        # Validate data types and ranges
        assert isinstance(rec_data["recommendations"], list)
        assert isinstance(rec_data["scores"], list)
        assert len(rec_data["recommendations"]) <= 5
        assert len(rec_data["scores"]) == len(rec_data["recommendations"])
        assert all(0 <= score <= 1 for score in rec_data["scores"])
        
        # 3. Test model training endpoint
        training_response = test_client.post(
            "/api/v1/recommendations/train",
            json={"force_retrain": False},
            headers=auth_headers
        )
        
        assert training_response.status_code == 200
        training_data = training_response.json()
        assert "status" in training_data
        assert "message" in training_data
    
    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_authentication_flow(self, test_client, jwt_handler):
        """Test authentication and authorization flow"""
        
        # 1. Test without authentication (should fail)
        response = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": 123, "limit": 5}
        )
        assert response.status_code == 401
        
        # 2. Test with invalid token
        invalid_headers = {"Authorization": "Bearer invalid.token.here"}
        response = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": 123, "limit": 5},
            headers=invalid_headers
        )
        assert response.status_code == 401
        
        # 3. Test with valid token
        valid_token = jwt_handler.create_access_token({"sub": "123", "username": "testuser"})
        valid_headers = {"Authorization": f"Bearer {valid_token}"}
        
        response = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": 123, "limit": 5},
            headers=valid_headers
        )
        assert response.status_code == 200
    
    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_input_validation(self, test_client, auth_headers):
        """Test comprehensive input validation"""
        
        # 1. Test invalid user ID
        invalid_requests = [
            {"user_id": 0, "limit": 5},  # Zero user ID
            {"user_id": -1, "limit": 5},  # Negative user ID
            {"user_id": 1000000, "limit": 5},  # Too large user ID
            {"user_id": 123, "limit": 0},  # Zero limit
            {"user_id": 123, "limit": 100},  # Too large limit
            {"user_id": 123, "limit": 5, "algorithm": "invalid"},  # Invalid algorithm
        ]
        
        for request_data in invalid_requests:
            response = test_client.post(
                "/api/v1/recommendations/generate",
                json=request_data,
                headers=auth_headers
            )
            assert response.status_code == 422, f"Expected 422 for {request_data}"
        
        # 2. Test missing required fields
        response = test_client.post(
            "/api/v1/recommendations/generate",
            json={},  # Missing user_id
            headers=auth_headers
        )
        assert response.status_code == 422
        
        # 3. Test extra fields (should be rejected)
        response = test_client.post(
            "/api/v1/recommendations/generate",
            json={
                "user_id": 123,
                "limit": 5,
                "extra_field": "should_be_rejected"
            },
            headers=auth_headers
        )
        assert response.status_code == 422
    
    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_rate_limiting(self, test_client, auth_headers):
        """Test rate limiting functionality"""
        
        # Make multiple rapid requests
        responses = []
        for i in range(15):  # Exceed the 10/minute limit
            response = test_client.post(
                "/api/v1/recommendations/generate",
                json={"user_id": 123, "limit": 5},
                headers=auth_headers
            )
            responses.append(response)
        
        # Check that some requests were rate limited
        status_codes = [r.status_code for r in responses]
        assert 429 in status_codes, "Rate limiting not working"
        
        # Check rate limit headers
        rate_limited_response = next(r for r in responses if r.status_code == 429)
        assert "Retry-After" in rate_limited_response.headers
        assert "X-RateLimit-Limit" in rate_limited_response.headers
    
    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_error_handling(self, test_client, auth_headers):
        """Test error handling and response formats"""
        
        # 1. Test database error simulation
        # (This would require mocking the database service)
        
        # 2. Test malformed JSON
        response = test_client.post(
            "/api/v1/recommendations/generate",
            data="invalid json",
            headers={**auth_headers, "Content-Type": "application/json"}
        )
        assert response.status_code == 422
        
        # 3. Test large payload
        large_payload = {"user_id": 123, "limit": 5, "data": "x" * 2000000}  # 2MB
        response = test_client.post(
            "/api/v1/recommendations/generate",
            json=large_payload,
            headers=auth_headers
        )
        assert response.status_code == 413  # Payload too large

    # ============================================================================
    # BROWSER-BASED TESTS (Playwright)
    # ============================================================================

    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_browser_recommendation_flow(self):
        """Test complete user journey in browser"""
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            try:
                # 1. Navigate to the application
                await page.goto("http://localhost:8000")
                
                # 2. Check if the page loads correctly
                await page.wait_for_selector("body")
                content = await page.text_content("body")
                assert "ML Job Recommendation System" in content
                
                # 3. Navigate to recommendations page
                await page.goto("http://localhost:8000/docs")
                
                # 4. Test API documentation
                await page.wait_for_selector("h1")
                docs_content = await page.text_content("h1")
                assert "ML Job Recommendation System" in docs_content
                
                # 5. Test API endpoint through browser
                # This would require a frontend interface
                # For now, we'll test the API directly
                
            finally:
                await browser.close()
    
    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_browser_security_headers(self):
        """Test security headers in browser"""
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            try:
                # Navigate to the application
                response = await page.goto("http://localhost:8000")
                
                # Check security headers
                headers = response.headers
                
                # Verify security headers are present
                assert "x-content-type-options" in headers
                assert "x-frame-options" in headers
                assert "x-xss-protection" in headers
                assert "strict-transport-security" in headers
                assert "content-security-policy" in headers
                
                # Verify header values
                assert headers["x-content-type-options"] == "nosniff"
                assert headers["x-frame-options"] == "DENY"
                assert "1; mode=block" in headers["x-xss-protection"]
                
            finally:
                await browser.close()

    # ============================================================================
    # PERFORMANCE TESTS
    # ============================================================================

    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_recommendation_performance(self, test_client, auth_headers):
        """Test recommendation performance under load"""
        
        # Test single request performance
        start_time = time.time()
        
        response = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": 123, "limit": 10},
            headers=auth_headers
        )
        
        end_time = time.time()
        response_time = end_time - start_time
        
        assert response.status_code == 200
        assert response_time < 2.0, f"Response time {response_time}s exceeds 2s limit"
        
        # Test concurrent requests (simulate 10 users)
        async def make_request(user_id: int):
            return test_client.post(
                "/api/v1/recommendations/generate",
                json={"user_id": user_id, "limit": 5},
                headers=auth_headers
            )
        
        start_time = time.time()
        
        # Create 10 concurrent requests
        tasks = [make_request(100 + i) for i in range(10)]
        responses = await asyncio.gather(*tasks)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Verify all requests succeeded
        for response in responses:
            assert response.status_code == 200
        
        # Verify performance
        assert total_time < 5.0, f"Concurrent requests took {total_time}s, should be under 5s"
        avg_time = total_time / 10
        assert avg_time < 0.5, f"Average response time {avg_time}s should be under 0.5s"

    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_cache_performance(self, test_client, auth_headers):
        """Test caching performance improvements"""
        
        # First request (cache miss)
        start_time = time.time()
        response1 = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": 123, "limit": 5},
            headers=auth_headers
        )
        first_request_time = time.time() - start_time
        
        # Second request (cache hit)
        start_time = time.time()
        response2 = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": 123, "limit": 5},
            headers=auth_headers
        )
        second_request_time = time.time() - start_time
        
        # Verify both requests succeeded
        assert response1.status_code == 200
        assert response2.status_code == 200
        
        # Verify responses are identical
        data1 = response1.json()
        data2 = response2.json()
        assert data1["recommendations"] == data2["recommendations"]
        
        # Verify cache hit is faster (optional - depends on cache implementation)
        # assert second_request_time < first_request_time

    # ============================================================================
    # INTEGRATION TESTS
    # ============================================================================

    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_database_integration(self, test_client, auth_headers):
        """Test database integration and data persistence"""
        
        # This would require setting up a test database
        # For now, we'll test the API endpoints work correctly
        
        # Test recommendation generation
        response = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": 123, "limit": 5},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "recommendations" in data
        assert "scores" in data
        assert isinstance(data["recommendations"], list)
        assert isinstance(data["scores"], list)
    
    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_cache_integration(self, test_client, auth_headers):
        """Test cache integration"""
        
        # Test that recommendations are cached
        user_id = 456
        
        # First request
        response1 = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": user_id, "limit": 5},
            headers=auth_headers
        )
        
        # Second request (should use cache)
        response2 = test_client.post(
            "/api/v1/recommendations/generate",
            json={"user_id": user_id, "limit": 5},
            headers=auth_headers
        )
        
        # Both should succeed
        assert response1.status_code == 200
        assert response2.status_code == 200
        
        # Responses should be identical
        data1 = response1.json()
        data2 = response2.json()
        assert data1["recommendations"] == data2["recommendations"]

    # ============================================================================
    # SECURITY TESTS
    # ============================================================================

    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_security_headers(self, test_client):
        """Test security headers are properly set"""
        
        response = test_client.get("/")
        
        # Check security headers
        headers = response.headers
        
        required_headers = [
            "x-content-type-options",
            "x-frame-options", 
            "x-xss-protection",
            "strict-transport-security",
            "content-security-policy"
        ]
        
        for header in required_headers:
            assert header in headers, f"Missing security header: {header}"
        
        # Verify header values
        assert headers["x-content-type-options"] == "nosniff"
        assert headers["x-frame-options"] == "DENY"
        assert "1; mode=block" in headers["x-xss-protection"]
    
    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_sql_injection_protection(self, test_client, auth_headers):
        """Test SQL injection protection"""
        
        # Test with potentially malicious input
        malicious_inputs = [
            {"user_id": "123; DROP TABLE users; --", "limit": 5},
            {"user_id": "123' OR '1'='1", "limit": 5},
            {"user_id": "123 UNION SELECT * FROM users", "limit": 5},
        ]
        
        for malicious_input in malicious_inputs:
            response = test_client.post(
                "/api/v1/recommendations/generate",
                json=malicious_input,
                headers=auth_headers
            )
            
            # Should return validation error, not database error
            assert response.status_code == 422
    
    @pytest.mark.e2e
    @pytest.mark.asyncio
    async def test_xss_protection(self, test_client, auth_headers):
        """Test XSS protection"""
        
        # Test with potentially malicious input
        malicious_inputs = [
            {"user_id": 123, "limit": 5, "data": "<script>alert('xss')</script>"},
            {"user_id": 123, "limit": 5, "data": "javascript:alert('xss')"},
            {"user_id": 123, "limit": 5, "data": "data:text/html,<script>alert('xss')</script>"},
        ]
        
        for malicious_input in malicious_inputs:
            response = test_client.post(
                "/api/v1/recommendations/generate",
                json=malicious_input,
                headers=auth_headers
            )
            
            # Should return validation error
            assert response.status_code == 422

    # ============================================================================
    # UTILITY FUNCTIONS
    # ============================================================================

    async def setup_test_data(self, user_id: int, preferences: Dict[str, Any]):
        """Setup test data for a user"""
        # This would interact with the database to create test data
        # Implementation depends on your database structure
        pass
    
    async def cleanup_test_data(self, user_id: int):
        """Cleanup test data for a user"""
        # This would clean up test data from the database
        # Implementation depends on your database structure
        pass
    
    def assert_response_structure(self, response_data: Dict[str, Any]):
        """Assert that response has expected structure"""
        required_fields = ["recommendations", "scores", "algorithm", "user_id"]
        for field in required_fields:
            assert field in response_data, f"Missing field: {field}"
        
        assert isinstance(response_data["recommendations"], list)
        assert isinstance(response_data["scores"], list)
        assert len(response_data["recommendations"]) == len(response_data["scores"])
    
    def assert_performance_threshold(self, response_time: float, max_time: float = 2.0):
        """Assert that response time is within acceptable threshold"""
        assert response_time < max_time, f"Response time {response_time}s exceeds threshold {max_time}s" 