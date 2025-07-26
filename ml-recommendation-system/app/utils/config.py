"""
Configuration settings for the ML Recommendation System

This module provides centralized configuration management using Pydantic.
It loads settings from environment variables and validates them for security and correctness.
"""

import os
import re
from typing import Optional, List
from pydantic import BaseSettings, Field, validator, root_validator
from pydantic.types import SecretStr

from ..exceptions.custom_exceptions import ConfigurationError


class Settings(BaseSettings):
    """
    Application settings with validation and security
    
    This class:
    1. Loads configuration from environment variables
    2. Validates all settings for correctness
    3. Provides secure defaults
    4. Ensures production-ready configuration
    """
    
    # ============================================================================
    # APPLICATION CONFIGURATION
    # ============================================================================
    
    # Basic app settings
    app_name: str = Field(default="ML Recommendation System", description="Application name")
    version: str = Field(default="1.0.0", description="Application version")
    debug: bool = Field(default=False, description="Debug mode (disable in production)")
    log_level: str = Field(default="INFO", description="Logging level")
    
    # Server configuration
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8000, ge=1, le=65535, description="Server port")
    
    # Frontend URL for CORS
    frontend_url: str = Field(default="http://localhost:3000", description="Frontend URL for CORS")
    
    # ============================================================================
    # DATABASE CONFIGURATION
    # ============================================================================
    
    # PostgreSQL connection
    database_url: str = Field(..., description="PostgreSQL connection string")
    database_pool_size: int = Field(default=10, ge=1, le=50, description="Database connection pool size")
    database_max_overflow: int = Field(default=20, ge=0, le=100, description="Database max overflow connections")
    database_timeout: int = Field(default=30, ge=5, le=300, description="Database connection timeout (seconds)")
    
    # ============================================================================
    # REDIS CONFIGURATION
    # ============================================================================
    
    # Redis connection
    redis_url: str = Field(..., description="Redis connection string")
    redis_db: int = Field(default=0, ge=0, le=15, description="Redis database number")
    redis_pool_size: int = Field(default=10, ge=1, le=50, description="Redis connection pool size")
    redis_timeout: int = Field(default=5, ge=1, le=60, description="Redis connection timeout (seconds)")
    
    # ============================================================================
    # SECURITY CONFIGURATION (CRITICAL)
    # ============================================================================
    
    # JWT settings
    secret_key: SecretStr = Field(..., min_length=32, description="JWT secret key (min 32 chars)")
    access_token_expire_minutes: int = Field(default=30, ge=5, le=1440, description="JWT token expiration (minutes)")
    algorithm: str = Field(default="HS256", description="JWT algorithm")
    
    # Rate limiting
    rate_limit_per_minute: int = Field(default=10, ge=1, le=1000, description="Default rate limit per minute")
    rate_limit_per_hour: int = Field(default=100, ge=10, le=10000, description="Default rate limit per hour")
    
    # Security headers
    enable_cors: bool = Field(default=True, description="Enable CORS")
    enable_trusted_hosts: bool = Field(default=True, description="Enable trusted host validation")
    allowed_hosts: List[str] = Field(default=["localhost", "127.0.0.1"], description="Allowed hosts")
    
    # ============================================================================
    # ML MODEL CONFIGURATION
    # ============================================================================
    
    # Model settings
    model_cache_ttl: int = Field(default=1800, ge=60, le=86400, description="Model cache TTL (seconds)")
    recommendation_limit: int = Field(default=10, ge=1, le=100, description="Default recommendation limit")
    training_batch_size: int = Field(default=1000, ge=100, le=10000, description="Training batch size")
    
    # Algorithm settings
    collaborative_filtering_enabled: bool = Field(default=True, description="Enable collaborative filtering")
    content_based_filtering_enabled: bool = Field(default=True, description="Enable content-based filtering")
    hybrid_filtering_enabled: bool = Field(default=True, description="Enable hybrid filtering")
    
    # ============================================================================
    # MONITORING AND METRICS
    # ============================================================================
    
    # Monitoring settings
    enable_metrics: bool = Field(default=True, description="Enable metrics collection")
    metrics_port: int = Field(default=9090, ge=1024, le=65535, description="Metrics server port")
    health_check_interval: int = Field(default=30, ge=5, le=300, description="Health check interval (seconds)")
    
    # ============================================================================
    # PERFORMANCE CONFIGURATION
    # ============================================================================
    
    # Thread pool settings
    max_workers: int = Field(default=4, ge=1, le=16, description="Maximum worker threads for ML operations")
    thread_pool_timeout: int = Field(default=300, ge=30, le=1800, description="Thread pool timeout (seconds)")
    
    # Cache settings
    enable_caching: bool = Field(default=True, description="Enable caching")
    cache_ttl: int = Field(default=3600, ge=60, le=86400, description="Default cache TTL (seconds)")
    
    # ============================================================================
    # VALIDATION METHODS
    # ============================================================================
    
    @validator('database_url')
    def validate_database_url(cls, v):
        """Validate database URL format and security"""
        if not v:
            raise ConfigurationError("Database URL is required")
        
        # Check for valid PostgreSQL URL
        if not re.match(r'^postgresql://[^:]+:[^@]+@[^:]+:\d+/\w+$', v):
            raise ConfigurationError("Invalid database URL format")
        
        # Check for common security issues
        if 'password' in v.lower() and 'password' not in v:
            raise ConfigurationError("Database URL should not contain 'password' in plain text")
        
        return v
    
    @validator('redis_url')
    def validate_redis_url(cls, v):
        """Validate Redis URL format"""
        if not v:
            raise ConfigurationError("Redis URL is required")
        
        # Check for valid Redis URL
        if not re.match(r'^redis://[^:]+:\d+$', v):
            raise ConfigurationError("Invalid Redis URL format")
        
        return v
    
    @validator('secret_key')
    def validate_secret_key(cls, v):
        """Validate JWT secret key security"""
        if len(v.get_secret_value()) < 32:
            raise ConfigurationError("Secret key must be at least 32 characters long")
        
        # Check for weak secret keys
        secret = v.get_secret_value()
        if secret.lower() in ['secret', 'key', 'password', 'admin', 'test']:
            raise ConfigurationError("Secret key is too weak")
        
        if len(set(secret)) < 10:
            raise ConfigurationError("Secret key must contain at least 10 unique characters")
        
        return v
    
    @validator('log_level')
    def validate_log_level(cls, v):
        """Validate log level"""
        valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
        if v.upper() not in valid_levels:
            raise ConfigurationError(f"Invalid log level. Must be one of: {valid_levels}")
        return v.upper()
    
    @validator('frontend_url')
    def validate_frontend_url(cls, v):
        """Validate frontend URL"""
        if not v:
            raise ConfigurationError("Frontend URL is required")
        
        # Basic URL validation
        if not re.match(r'^https?://[^/]+', v):
            raise ConfigurationError("Invalid frontend URL format")
        
        return v
    
    @root_validator
    def validate_production_settings(cls, values):
        """Validate production-specific settings"""
        debug = values.get('debug', False)
        
        if not debug:  # Production mode
            # Ensure secret key is not default
            secret_key = values.get('secret_key')
            if secret_key and secret_key.get_secret_value() == 'your-super-secret-key-change-this-in-production':
                raise ConfigurationError("Must change default secret key in production")
            
            # Ensure database URL is not localhost in production
            database_url = values.get('database_url', '')
            if 'localhost' in database_url or '127.0.0.1' in database_url:
                raise ConfigurationError("Database URL should not use localhost in production")
            
            # Ensure Redis URL is not localhost in production
            redis_url = values.get('redis_url', '')
            if 'localhost' in redis_url or '127.0.0.1' in redis_url:
                raise ConfigurationError("Redis URL should not use localhost in production")
        
        return values
    
    # ============================================================================
    # CONFIGURATION METHODS
    # ============================================================================
    
    def get_database_config(self) -> dict:
        """Get database configuration as dictionary"""
        return {
            "url": self.database_url,
            "pool_size": self.database_pool_size,
            "max_overflow": self.database_max_overflow,
            "timeout": self.database_timeout
        }
    
    def get_redis_config(self) -> dict:
        """Get Redis configuration as dictionary"""
        return {
            "url": self.redis_url,
            "db": self.redis_db,
            "pool_size": self.redis_pool_size,
            "timeout": self.redis_timeout
        }
    
    def get_security_config(self) -> dict:
        """Get security configuration as dictionary"""
        return {
            "secret_key": self.secret_key.get_secret_value(),
            "access_token_expire_minutes": self.access_token_expire_minutes,
            "algorithm": self.algorithm,
            "rate_limit_per_minute": self.rate_limit_per_minute,
            "rate_limit_per_hour": self.rate_limit_per_hour
        }
    
    def get_ml_config(self) -> dict:
        """Get ML configuration as dictionary"""
        return {
            "model_cache_ttl": self.model_cache_ttl,
            "recommendation_limit": self.recommendation_limit,
            "training_batch_size": self.training_batch_size,
            "collaborative_filtering_enabled": self.collaborative_filtering_enabled,
            "content_based_filtering_enabled": self.content_based_filtering_enabled,
            "hybrid_filtering_enabled": self.hybrid_filtering_enabled
        }
    
    def is_production(self) -> bool:
        """Check if running in production mode"""
        return not self.debug
    
    def is_development(self) -> bool:
        """Check if running in development mode"""
        return self.debug
    
    class Config:
        """Pydantic configuration"""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        validate_assignment = True


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get settings instance (for dependency injection)"""
    return settings


def validate_environment() -> None:
    """Validate the entire environment configuration"""
    try:
        # This will raise an exception if validation fails
        _ = Settings()
        print("✅ Environment configuration is valid")
    except Exception as e:
        print(f"❌ Environment configuration error: {e}")
        raise


if __name__ == "__main__":
    # Validate configuration when run directly
    validate_environment() 