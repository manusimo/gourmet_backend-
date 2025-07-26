"""
Rate limiting middleware for ML Recommendation System

This module provides rate limiting functionality to prevent API abuse
and ensure fair usage of the recommendation system.
"""

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
from fastapi.responses import JSONResponse
import structlog

from ..exceptions.custom_exceptions import RateLimitError

logger = structlog.get_logger()

# Create rate limiter instance
limiter = Limiter(key_func=get_remote_address)


def setup_rate_limiting(app):
    """
    Set up rate limiting for the FastAPI application
    
    This function:
    1. Configures the rate limiter
    2. Adds rate limit exception handler
    3. Sets up default rate limits
    
    Args:
        app: FastAPI application instance
    """
    # Set up the limiter
    app.state.limiter = limiter
    
    # Add custom rate limit exception handler
    app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)
    
    logger.info("✅ Rate limiting middleware configured")


async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """
    Custom handler for rate limit exceeded exceptions
    
    This provides a more informative response when rate limits are exceeded.
    
    Args:
        request: The request that exceeded the rate limit
        exc: The rate limit exceeded exception
        
    Returns:
        JSON response with rate limit information
    """
    # Extract rate limit information
    retry_after = exc.retry_after
    limit = exc.retry_after
    
    # Log the rate limit violation
    client_ip = get_remote_address(request)
    endpoint = request.url.path
    logger.warning(
        f"Rate limit exceeded",
        client_ip=client_ip,
        endpoint=endpoint,
        retry_after=retry_after
    )
    
    # Create detailed error response
    error_details = {
        "error": "Rate limit exceeded",
        "message": "Too many requests. Please try again later.",
        "retry_after_seconds": retry_after,
        "limit": limit,
        "endpoint": endpoint
    }
    
    return JSONResponse(
        status_code=429,
        content=error_details,
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": str(retry_after)
        }
    )


def get_rate_limit_key(request: Request) -> str:
    """
    Get rate limit key for a request
    
    This function determines how to identify users for rate limiting.
    It can be customized based on authentication status.
    
    Args:
        request: The incoming request
        
    Returns:
        String key for rate limiting
    """
    # Try to get user ID from authentication
    try:
        # This would be set by authentication middleware
        user_id = request.state.user_id
        return f"user:{user_id}"
    except AttributeError:
        # Fall back to IP address if no user authentication
        return f"ip:{get_remote_address(request)}"


# Rate limit decorators for different endpoints
def recommendation_rate_limit():
    """Rate limit for recommendation endpoints"""
    return limiter.limit("10/minute", key_func=get_rate_limit_key)


def training_rate_limit():
    """Rate limit for model training endpoints"""
    return limiter.limit("2/hour", key_func=get_rate_limit_key)


def health_check_rate_limit():
    """Rate limit for health check endpoints"""
    return limiter.limit("60/minute", key_func=get_rate_limit_key)


def metrics_rate_limit():
    """Rate limit for metrics endpoints"""
    return limiter.limit("30/minute", key_func=get_rate_limit_key)


def admin_rate_limit():
    """Rate limit for admin endpoints"""
    return limiter.limit("100/hour", key_func=get_rate_limit_key)


# Dynamic rate limiting based on user tier
def get_dynamic_rate_limit(user_tier: str = "standard"):
    """
    Get dynamic rate limit based on user tier
    
    Args:
        user_tier: User tier (standard, premium, admin)
        
    Returns:
        Rate limit string
    """
    limits = {
        "standard": "10/minute",
        "premium": "50/minute", 
        "admin": "100/minute"
    }
    
    limit = limits.get(user_tier, limits["standard"])
    return limiter.limit(limit, key_func=get_rate_limit_key)


# Rate limit monitoring
class RateLimitMonitor:
    """Monitor rate limit usage and violations"""
    
    def __init__(self):
        self.violations = {}
        self.usage_stats = {}
    
    def record_violation(self, client_key: str, endpoint: str):
        """Record a rate limit violation"""
        if client_key not in self.violations:
            self.violations[client_key] = {}
        
        if endpoint not in self.violations[client_key]:
            self.violations[client_key][endpoint] = 0
        
        self.violations[client_key][endpoint] += 1
        
        logger.warning(
            f"Rate limit violation recorded",
            client_key=client_key,
            endpoint=endpoint,
            violation_count=self.violations[client_key][endpoint]
        )
    
    def record_usage(self, client_key: str, endpoint: str):
        """Record API usage for monitoring"""
        if client_key not in self.usage_stats:
            self.usage_stats[client_key] = {}
        
        if endpoint not in self.usage_stats[client_key]:
            self.usage_stats[client_key][endpoint] = 0
        
        self.usage_stats[client_key][endpoint] += 1
    
    def get_violation_stats(self) -> dict:
        """Get rate limit violation statistics"""
        return {
            "total_violations": sum(
                sum(endpoint_violations.values()) 
                for endpoint_violations in self.violations.values()
            ),
            "violations_by_client": self.violations,
            "usage_stats": self.usage_stats
        }


# Global rate limit monitor instance
rate_limit_monitor = RateLimitMonitor()


def monitor_rate_limit_usage(request: Request, response: Response):
    """
    Middleware to monitor rate limit usage
    
    This function should be called after each request to track usage patterns.
    
    Args:
        request: The incoming request
        response: The response sent back
    """
    client_key = get_rate_limit_key(request)
    endpoint = request.url.path
    
    # Record usage
    rate_limit_monitor.record_usage(client_key, endpoint)
    
    # Check if this was a rate limit violation
    if response.status_code == 429:
        rate_limit_monitor.record_violation(client_key, endpoint) 