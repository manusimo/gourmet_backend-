"""
Custom exception classes for ML Recommendation System

This module defines all custom exceptions used throughout the system.
It provides structured error handling and meaningful error messages.
"""

from typing import Optional, Dict, Any


class RecommendationSystemError(Exception):
    """
    Base exception for all recommendation system errors
    
    This is the parent class for all custom exceptions in the system.
    It provides a common interface for error handling.
    """
    
    def __init__(self, message: str, error_code: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        """
        Initialize the base exception
        
        Args:
            message: Human-readable error message
            error_code: Optional error code for programmatic handling
            details: Optional additional error details
        """
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses"""
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "error_code": self.error_code,
            "details": self.details
        }


class ModelTrainingError(RecommendationSystemError):
    """
    Raised when ML model training fails
    
    This exception is raised when:
    - Training data is insufficient
    - Model parameters are invalid
    - Training process encounters errors
    - Model validation fails
    """
    
    def __init__(self, message: str, model_name: Optional[str] = None, training_data_info: Optional[Dict[str, Any]] = None):
        """
        Initialize model training error
        
        Args:
            message: Error message
            model_name: Name of the model that failed to train
            training_data_info: Information about the training data
        """
        details = {
            "model_name": model_name,
            "training_data_info": training_data_info or {}
        }
        super().__init__(message, "MODEL_TRAINING_FAILED", details)


class PredictionError(RecommendationSystemError):
    """
    Raised when recommendation prediction fails
    
    This exception is raised when:
    - Models are not loaded
    - Input data is invalid
    - Prediction process fails
    - Algorithm is not supported
    """
    
    def __init__(self, message: str, algorithm: Optional[str] = None, user_id: Optional[int] = None):
        """
        Initialize prediction error
        
        Args:
            message: Error message
            algorithm: Algorithm that failed
            user_id: User ID for the failed prediction
        """
        details = {
            "algorithm": algorithm,
            "user_id": user_id
        }
        super().__init__(message, "PREDICTION_FAILED", details)


class DatabaseError(RecommendationSystemError):
    """
    Raised when database operations fail
    
    This exception is raised when:
    - Connection fails
    - Query execution fails
    - Data integrity issues occur
    - Transaction rollback is needed
    """
    
    def __init__(self, message: str, operation: Optional[str] = None, table: Optional[str] = None, sql_error: Optional[str] = None):
        """
        Initialize database error
        
        Args:
            message: Error message
            operation: Database operation that failed
            table: Table involved in the operation
            sql_error: Original SQL error message
        """
        details = {
            "operation": operation,
            "table": table,
            "sql_error": sql_error
        }
        super().__init__(message, "DATABASE_ERROR", details)


class CacheError(RecommendationSystemError):
    """
    Raised when cache operations fail
    
    This exception is raised when:
    - Redis connection fails
    - Cache read/write operations fail
    - Cache invalidation fails
    - Cache configuration issues
    """
    
    def __init__(self, message: str, operation: Optional[str] = None, key: Optional[str] = None, cache_type: Optional[str] = None):
        """
        Initialize cache error
        
        Args:
            message: Error message
            operation: Cache operation that failed
            key: Cache key involved
            cache_type: Type of cache (redis, memory, etc.)
        """
        details = {
            "operation": operation,
            "key": key,
            "cache_type": cache_type
        }
        super().__init__(message, "CACHE_ERROR", details)


class ValidationError(RecommendationSystemError):
    """
    Raised when input validation fails
    
    This exception is raised when:
    - Required fields are missing
    - Data types are incorrect
    - Values are out of range
    - Format validation fails
    """
    
    def __init__(self, message: str, field: Optional[str] = None, value: Optional[Any] = None, expected_type: Optional[str] = None):
        """
        Initialize validation error
        
        Args:
            message: Error message
            field: Field that failed validation
            value: Invalid value
            expected_type: Expected data type
        """
        details = {
            "field": field,
            "value": value,
            "expected_type": expected_type
        }
        super().__init__(message, "VALIDATION_ERROR", details)


class AuthenticationError(RecommendationSystemError):
    """
    Raised when authentication fails
    
    This exception is raised when:
    - Token is missing or invalid
    - Token has expired
    - User credentials are incorrect
    - Authorization is insufficient
    """
    
    def __init__(self, message: str, token_info: Optional[Dict[str, Any]] = None, user_id: Optional[int] = None):
        """
        Initialize authentication error
        
        Args:
            message: Error message
            token_info: Information about the failed token
            user_id: User ID if available
        """
        details = {
            "token_info": token_info or {},
            "user_id": user_id
        }
        super().__init__(message, "AUTHENTICATION_ERROR", details)


class RateLimitError(RecommendationSystemError):
    """
    Raised when rate limiting is exceeded
    
    This exception is raised when:
    - Too many requests are made
    - Rate limit is exceeded
    - User is temporarily blocked
    """
    
    def __init__(self, message: str, limit: Optional[int] = None, window: Optional[str] = None, retry_after: Optional[int] = None):
        """
        Initialize rate limit error
        
        Args:
            message: Error message
            limit: Rate limit that was exceeded
            window: Time window for the limit
            retry_after: Seconds to wait before retrying
        """
        details = {
            "limit": limit,
            "window": window,
            "retry_after": retry_after
        }
        super().__init__(message, "RATE_LIMIT_EXCEEDED", details)


class ConfigurationError(RecommendationSystemError):
    """
    Raised when configuration is invalid
    
    This exception is raised when:
    - Environment variables are missing
    - Configuration values are invalid
    - Required services are not configured
    """
    
    def __init__(self, message: str, config_key: Optional[str] = None, expected_value: Optional[str] = None):
        """
        Initialize configuration error
        
        Args:
            message: Error message
            config_key: Configuration key that caused the error
            expected_value: Expected configuration value
        """
        details = {
            "config_key": config_key,
            "expected_value": expected_value
        }
        super().__init__(message, "CONFIGURATION_ERROR", details)


class ServiceUnavailableError(RecommendationSystemError):
    """
    Raised when a required service is unavailable
    
    This exception is raised when:
    - Database is down
    - Redis is unavailable
    - External APIs are not responding
    - ML models are not loaded
    """
    
    def __init__(self, message: str, service_name: Optional[str] = None, retry_after: Optional[int] = None):
        """
        Initialize service unavailable error
        
        Args:
            message: Error message
            service_name: Name of the unavailable service
            retry_after: Seconds to wait before retrying
        """
        details = {
            "service_name": service_name,
            "retry_after": retry_after
        }
        super().__init__(message, "SERVICE_UNAVAILABLE", details)


class DataIntegrityError(RecommendationSystemError):
    """
    Raised when data integrity issues are detected
    
    This exception is raised when:
    - Data is corrupted
    - Foreign key constraints are violated
    - Data consistency checks fail
    - Duplicate data is detected
    """
    
    def __init__(self, message: str, data_type: Optional[str] = None, constraint: Optional[str] = None):
        """
        Initialize data integrity error
        
        Args:
            message: Error message
            data_type: Type of data with integrity issues
            constraint: Constraint that was violated
        """
        details = {
            "data_type": data_type,
            "constraint": constraint
        }
        super().__init__(message, "DATA_INTEGRITY_ERROR", details)


class PerformanceError(RecommendationSystemError):
    """
    Raised when performance thresholds are exceeded
    
    This exception is raised when:
    - Response time is too slow
    - Memory usage is too high
    - CPU usage is excessive
    - Resource limits are reached
    """
    
    def __init__(self, message: str, metric: Optional[str] = None, threshold: Optional[float] = None, actual: Optional[float] = None):
        """
        Initialize performance error
        
        Args:
            message: Error message
            metric: Performance metric that exceeded threshold
            threshold: Performance threshold
            actual: Actual performance value
        """
        details = {
            "metric": metric,
            "threshold": threshold,
            "actual": actual
        }
        super().__init__(message, "PERFORMANCE_ERROR", details)


# Convenience functions for common error scenarios
def raise_validation_error(message: str, field: str = None, value: Any = None) -> None:
    """Helper function to raise validation errors"""
    raise ValidationError(message, field, value)


def raise_database_error(message: str, operation: str = None, table: str = None) -> None:
    """Helper function to raise database errors"""
    raise DatabaseError(message, operation, table)


def raise_model_training_error(message: str, model_name: str = None) -> None:
    """Helper function to raise model training errors"""
    raise ModelTrainingError(message, model_name)


def raise_prediction_error(message: str, algorithm: str = None, user_id: int = None) -> None:
    """Helper function to raise prediction errors"""
    raise PredictionError(message, algorithm, user_id) 