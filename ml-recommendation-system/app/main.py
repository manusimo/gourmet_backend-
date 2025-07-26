"""
Main FastAPI application for the ML Recommendation System

This is the entry point that sets up the FastAPI application and connects all the modules.
It focuses only on:
1. FastAPI application setup
2. Middleware configuration
3. Route registration
4. Application lifecycle management
5. Security and performance optimizations

All business logic is handled by separate modules.
"""

import structlog
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
import time

# Import our modules
from .utils.config import Settings
from .services.app_service import lifespan_manager
from .routes import recommendations, health
from .auth.jwt_handler import get_current_user, get_current_user_optional
from .middleware.rate_limiter import setup_rate_limiting, recommendation_rate_limit, training_rate_limit
from .exceptions.custom_exceptions import (
    RecommendationSystemError, ValidationError, AuthenticationError,
    RateLimitError, DatabaseError, CacheError, ModelTrainingError,
    PredictionError, ServiceUnavailableError
)

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# ============================================================================
# CONFIGURATION
# ============================================================================
settings = Settings()

# ============================================================================
# FASTAPI APPLICATION SETUP
# ============================================================================
app = FastAPI(
    title="ML Job Recommendation System",
    description="A secure, scalable machine learning-powered job recommendation system",
    version="1.0.0",
    lifespan=lambda app: lifespan_manager(settings),
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None
)

# ============================================================================
# SECURITY MIDDLEWARE
# ============================================================================

# Trusted Host middleware (only allow requests from trusted hosts)
if not settings.debug:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["localhost", "127.0.0.1", "your-domain.com"]  # Configure for production
    )

# CORS middleware with security headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url] if not settings.debug else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]
)

# ============================================================================
# RATE LIMITING
# ============================================================================
setup_rate_limiting(app)

# ============================================================================
# ROUTE REGISTRATION WITH SECURITY
# ============================================================================

# Health endpoints (no authentication required)
app.include_router(health.router, prefix="/api/v1")

# Recommendation endpoints (with authentication and rate limiting)
recommendations_router = recommendations.router
recommendations_router.dependencies = [get_current_user]  # Require authentication
app.include_router(recommendations_router, prefix="/api/v1")

# ============================================================================
# GLOBAL MIDDLEWARE
# ============================================================================

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add comprehensive security headers to all responses"""
    response = await call_next(request)
    
    # Security headers for 5000 users scale
    response.headers.update({
        # Content Security Policy - Prevent XSS attacks
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:; frame-ancestors 'none';",
        
        # XSS Protection
        "X-XSS-Protection": "1; mode=block",
        
        # Content Type Options - Prevent MIME type sniffing
        "X-Content-Type-Options": "nosniff",
        
        # Frame Options - Prevent clickjacking
        "X-Frame-Options": "DENY",
        
        # Referrer Policy - Control referrer information
        "Referrer-Policy": "strict-origin-when-cross-origin",
        
        # Permissions Policy - Control browser features
        "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
        
        # Strict Transport Security - Force HTTPS
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        
        # Cache Control - Prevent caching of sensitive data
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        
        # Additional security headers
        "X-Download-Options": "noopen",
        "X-Permitted-Cross-Domain-Policies": "none",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin"
    })
    
    # Remove server information
    response.headers.pop("Server", None)
    
    return response


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add request ID for tracking"""
    request_id = str(time.time())
    request.state.request_id = request_id
    
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests for monitoring with enhanced security"""
    start_time = time.time()
    
    # Sanitize sensitive information
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    # Log request with security context
    logger.info(
        "Request started",
        method=request.method,
        url=str(request.url),
        client_ip=client_ip,
        user_agent=user_agent[:100],  # Limit user agent length
        content_length=request.headers.get("content-length", "0")
    )
    
    try:
        response = await call_next(request)
        
        # Log response with performance metrics
        process_time = time.time() - start_time
        logger.info(
            "Request completed",
            method=request.method,
            url=str(request.url),
            status_code=response.status_code,
            process_time=f"{process_time:.3f}s",
            content_length=response.headers.get("content-length", "0")
        )
        
        return response
        
    except Exception as e:
        # Log errors with security context
        process_time = time.time() - start_time
        logger.error(
            "Request failed",
            method=request.method,
            url=str(request.url),
            error=str(e),
            process_time=f"{process_time:.3f}s",
            client_ip=client_ip
        )
        raise


@app.middleware("http")
async def validate_request_size(request: Request, call_next):
    """Validate request size to prevent large payload attacks"""
    content_length = request.headers.get("content-length")
    if content_length:
        size = int(content_length)
        if size > 1024 * 1024:  # 1MB limit for 5000 users
            logger.warning(
                "Large request blocked",
                size=size,
                client_ip=request.client.host if request.client else "unknown"
            )
            return JSONResponse(
                status_code=413,
                content={"error": "Request too large", "message": "Request size exceeds 1MB limit"}
            )
    
    return await call_next(request)


@app.middleware("http")
async def rate_limit_by_ip(request: Request, call_next):
    """Additional rate limiting by IP address"""
    client_ip = request.client.host if request.client else "unknown"
    
    # Simple in-memory rate limiting (for 5000 users, Redis would be better)
    # This is a basic implementation - in production, use Redis
    current_time = time.time()
    request_key = f"rate_limit:{client_ip}"
    
    # Get current request count (simplified - use Redis in production)
    # For now, we'll rely on the slowapi rate limiter
    
    return await call_next(request)

# ============================================================================
# ERROR HANDLING
# ============================================================================

@app.exception_handler(RecommendationSystemError)
async def recommendation_exception_handler(request: Request, exc: RecommendationSystemError):
    """Handle custom recommendation system errors"""
    logger.error(
        f"Recommendation system error: {exc}",
        error_type=exc.__class__.__name__,
        error_code=exc.error_code,
        details=exc.details,
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=500,
        content=exc.to_dict()
    )


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    """Handle validation errors"""
    logger.warning(
        f"Validation error: {exc}",
        field=exc.details.get("field"),
        value=exc.details.get("value"),
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=422,
        content=exc.to_dict()
    )


@app.exception_handler(AuthenticationError)
async def authentication_exception_handler(request: Request, exc: AuthenticationError):
    """Handle authentication errors"""
    logger.warning(
        f"Authentication error: {exc}",
        user_id=exc.details.get("user_id"),
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=401,
        content=exc.to_dict(),
        headers={"WWW-Authenticate": "Bearer"}
    )


@app.exception_handler(RateLimitError)
async def rate_limit_exception_handler(request: Request, exc: RateLimitError):
    """Handle rate limit errors"""
    logger.warning(
        f"Rate limit exceeded: {exc}",
        limit=exc.details.get("limit"),
        retry_after=exc.details.get("retry_after"),
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=429,
        content=exc.to_dict(),
        headers={"Retry-After": str(exc.details.get("retry_after", 60))}
    )


@app.exception_handler(DatabaseError)
async def database_exception_handler(request: Request, exc: DatabaseError):
    """Handle database errors"""
    logger.error(
        f"Database error: {exc}",
        operation=exc.details.get("operation"),
        table=exc.details.get("table"),
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=503,
        content=exc.to_dict()
    )


@app.exception_handler(CacheError)
async def cache_exception_handler(request: Request, exc: CacheError):
    """Handle cache errors"""
    logger.error(
        f"Cache error: {exc}",
        operation=exc.details.get("operation"),
        key=exc.details.get("key"),
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=503,
        content=exc.to_dict()
    )


@app.exception_handler(ModelTrainingError)
async def model_training_exception_handler(request: Request, exc: ModelTrainingError):
    """Handle model training errors"""
    logger.error(
        f"Model training error: {exc}",
        model_name=exc.details.get("model_name"),
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=500,
        content=exc.to_dict()
    )


@app.exception_handler(PredictionError)
async def prediction_exception_handler(request: Request, exc: PredictionError):
    """Handle prediction errors"""
    logger.error(
        f"Prediction error: {exc}",
        algorithm=exc.details.get("algorithm"),
        user_id=exc.details.get("user_id"),
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=500,
        content=exc.to_dict()
    )


@app.exception_handler(ServiceUnavailableError)
async def service_unavailable_exception_handler(request: Request, exc: ServiceUnavailableError):
    """Handle service unavailable errors"""
    logger.error(
        f"Service unavailable: {exc}",
        service_name=exc.details.get("service_name"),
        retry_after=exc.details.get("retry_after"),
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown"
    )
    
    return JSONResponse(
        status_code=503,
        content=exc.to_dict(),
        headers={"Retry-After": str(exc.details.get("retry_after", 60))}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors"""
    logger.error(
        f"Unhandled exception: {exc}",
        exception_type=exc.__class__.__name__,
        url=str(request.url),
        method=request.method,
        client_ip=request.client.host if request.client else "unknown",
        exc_info=True
    )
    
    # Don't expose internal errors in production
    if settings.debug:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "message": str(exc),
                "type": exc.__class__.__name__
            }
        )
    else:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "message": "An unexpected error occurred"
            }
        )

# ============================================================================
# ROOT ENDPOINT
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint with system information"""
    return {
        "message": "ML Job Recommendation System",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs" if settings.debug else "Documentation disabled in production"
    }

# ============================================================================
# APPLICATION ENTRY POINT
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
        access_log=True
    ) 