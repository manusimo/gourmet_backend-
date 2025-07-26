"""
Routes package for the ML Recommendation System

This package contains all the API route modules:
- recommendations: Job recommendation endpoints
- health: Health check and monitoring endpoints
"""

from . import recommendations
from . import health

__all__ = ["recommendations", "health"] 