"""
Input validation schemas for ML Recommendation System

This module provides Pydantic models for validating all API inputs.
It ensures data integrity and prevents security vulnerabilities.
"""

from pydantic import BaseModel, Field, validator, root_validator
from typing import List, Optional, Dict, Any
from enum import Enum
import re

from ..exceptions.custom_exceptions import ValidationError


class AlgorithmType(str, Enum):
    """Valid recommendation algorithms"""
    COLLABORATIVE = "collaborative"
    CONTENT = "content"
    HYBRID = "hybrid"


class InteractionType(str, Enum):
    """Valid user interaction types"""
    VIEW = "view"
    LIKE = "like"
    APPLY = "apply"
    SAVE = "save"
    SHARE = "share"


class RecommendationRequest(BaseModel):
    """
    Validated request model for getting job recommendations
    
    This model ensures:
    - User ID is valid and positive
    - Limit is within acceptable range
    - Algorithm is one of the supported types
    - All inputs are properly sanitized
    """
    user_id: int = Field(..., gt=0, le=999999, description="Valid user ID (1-999999)")
    limit: int = Field(default=10, ge=1, le=50, description="Number of recommendations (1-50)")
    algorithm: AlgorithmType = Field(default=AlgorithmType.HYBRID, description="Recommendation algorithm")
    include_scores: bool = Field(default=False, description="Include confidence scores in response")
    
    @validator('user_id')
    def validate_user_id(cls, v):
        """Validate user ID is positive and reasonable"""
        if v <= 0:
            raise ValidationError('User ID must be positive')
        if v > 999999:
            raise ValidationError('User ID is too large')
        # Reserved IDs for system use
        if v in [0, 1, 999999]:
            raise ValidationError('User ID is reserved for system use')
        return v
    
    @validator('limit')
    def validate_limit(cls, v):
        """Validate recommendation limit"""
        if v < 1:
            raise ValidationError('Limit must be at least 1')
        if v > 50:
            raise ValidationError('Limit cannot exceed 50')
        return v
    
    @root_validator
    def validate_request_size(cls, values):
        """Validate total request size to prevent large payload attacks"""
        total_size = sum(len(str(v)) for v in values.values())
        if total_size > 1000:  # 1KB limit
            raise ValidationError('Request payload too large')
        return values
    
    class Config:
        """Pydantic configuration"""
        use_enum_values = True
        validate_assignment = True
        extra = "forbid"  # Reject extra fields


class TrainingRequest(BaseModel):
    """
    Validated request model for model training
    
    This model ensures:
    - Force retrain flag is boolean
    - Algorithm is valid if specified
    - No extra fields are allowed
    """
    force_retrain: bool = Field(default=False, description="Force retrain even if models are recent")
    algorithm: Optional[AlgorithmType] = Field(default=None, description="Specific algorithm to train")
    
    @validator('algorithm')
    def validate_algorithm(cls, v):
        """Validate algorithm if provided"""
        if v is not None and v not in AlgorithmType:
            raise ValidationError(f'Invalid algorithm: {v}')
        return v
    
    class Config:
        use_enum_values = True
        validate_assignment = True
        extra = "forbid"


class InteractionRequest(BaseModel):
    """
    Validated request model for recording user interactions
    
    This model ensures:
    - User ID is valid
    - Job ID is valid
    - Interaction type is supported
    - Score is within valid range
    """
    user_id: int = Field(..., gt=0, le=999999, description="User ID")
    job_id: int = Field(..., gt=0, le=999999, description="Job ID")
    interaction_type: InteractionType = Field(..., description="Type of interaction")
    score: Optional[int] = Field(default=1, ge=1, le=5, description="Interaction score (1-5)")
    
    @validator('user_id', 'job_id')
    def validate_ids(cls, v):
        """Validate user and job IDs"""
        if v <= 0:
            raise ValidationError('ID must be positive')
        if v > 999999:
            raise ValidationError('ID is too large')
        return v
    
    @validator('score')
    def validate_score(cls, v):
        """Validate interaction score"""
        if v is not None and (v < 1 or v > 5):
            raise ValidationError('Score must be between 1 and 5')
        return v
    
    class Config:
        use_enum_values = True
        validate_assignment = True
        extra = "forbid"


class UserPreferencesRequest(BaseModel):
    """
    Validated request model for user preferences
    
    This model ensures:
    - User ID is valid
    - Preferences are properly formatted
    - No malicious data is included
    """
    user_id: int = Field(..., gt=0, le=999999, description="User ID")
    preferences: Dict[str, Any] = Field(..., description="User preferences dictionary")
    
    @validator('user_id')
    def validate_user_id(cls, v):
        """Validate user ID"""
        if v <= 0:
            raise ValidationError('User ID must be positive')
        if v > 999999:
            raise ValidationError('User ID is too large')
        return v
    
    @validator('preferences')
    def validate_preferences(cls, v):
        """Validate preferences structure"""
        if not isinstance(v, dict):
            raise ValidationError('Preferences must be a dictionary')
        
        # Check for reasonable size (5KB limit for 5000 users)
        if len(str(v)) > 5000:
            raise ValidationError('Preferences too large (max 5KB)')
        
        # Check for potentially malicious content
        preferences_str = str(v).lower()
        dangerous_patterns = [
            'script', 'javascript', 'eval', 'exec', 'import', 
            'system', 'os.', 'subprocess', 'open(', 'file(',
            'http://', 'https://', 'ftp://', 'data:', 'vbscript:'
        ]
        
        for pattern in dangerous_patterns:
            if pattern in preferences_str:
                raise ValidationError(f'Preferences contain potentially dangerous content: {pattern}')
        
        # Validate preference keys
        allowed_keys = {'skills', 'location', 'job_type', 'salary_range', 'experience_level', 'remote_preference'}
        invalid_keys = set(v.keys()) - allowed_keys
        if invalid_keys:
            raise ValidationError(f'Invalid preference keys: {invalid_keys}')
        
        return v
    
    class Config:
        validate_assignment = True
        extra = "forbid"


class JobDataRequest(BaseModel):
    """
    Validated request model for job data
    
    This model ensures:
    - Job data is properly formatted
    - Required fields are present
    - Data is sanitized
    """
    job_id: int = Field(..., gt=0, le=999999, description="Job ID")
    title: str = Field(..., min_length=1, max_length=200, description="Job title")
    description: str = Field(..., min_length=10, max_length=5000, description="Job description")
    required_skills: List[str] = Field(default=[], description="Required skills")
    location: str = Field(..., min_length=1, max_length=100, description="Job location")
    job_type: str = Field(..., min_length=1, max_length=50, description="Job type")
    salary_min: Optional[int] = Field(default=None, ge=0, le=1000000, description="Minimum salary")
    salary_max: Optional[int] = Field(default=None, ge=0, le=1000000, description="Maximum salary")
    
    @validator('job_id')
    def validate_job_id(cls, v):
        """Validate job ID"""
        if v <= 0:
            raise ValidationError('Job ID must be positive')
        if v > 999999:
            raise ValidationError('Job ID is too large')
        return v
    
    @validator('title', 'description', 'location', 'job_type')
    def validate_text_fields(cls, v):
        """Validate and sanitize text fields"""
        if not v or not v.strip():
            raise ValidationError('Text field cannot be empty')
        
        # Remove potentially dangerous characters
        sanitized = re.sub(r'[<>"\']', '', v.strip())
        if sanitized != v.strip():
            raise ValidationError('Text contains invalid characters')
        
        # Check for reasonable content
        if len(sanitized) < 1:
            raise ValidationError('Text field too short')
        
        return sanitized
    
    @validator('required_skills')
    def validate_skills(cls, v):
        """Validate skills list"""
        if not isinstance(v, list):
            raise ValidationError('Skills must be a list')
        
        if len(v) > 20:  # Reasonable limit for 5000 users
            raise ValidationError('Too many skills specified (max 20)')
        
        # Validate each skill
        for skill in v:
            if not isinstance(skill, str) or not skill.strip():
                raise ValidationError('Invalid skill format')
            if len(skill) > 50:
                raise ValidationError('Skill name too long (max 50 chars)')
            
            # Sanitize skill names
            sanitized_skill = re.sub(r'[<>"\']', '', skill.strip())
            if sanitized_skill != skill.strip():
                raise ValidationError('Skill contains invalid characters')
        
        return [skill.strip() for skill in v]
    
    @root_validator
    def validate_salary_range(cls, values):
        """Validate salary range makes sense"""
        salary_min = values.get('salary_min')
        salary_max = values.get('salary_max')
        
        if salary_min is not None and salary_max is not None:
            if salary_min > salary_max:
                raise ValidationError('Minimum salary cannot be greater than maximum salary')
            
            # Validate reasonable salary range
            if salary_max - salary_min > 500000:
                raise ValidationError('Salary range too wide (max $500k difference)')
        
        return values
    
    class Config:
        validate_assignment = True
        extra = "forbid"


class HealthCheckRequest(BaseModel):
    """
    Validated request model for health checks
    
    This model ensures:
    - Health check parameters are valid
    - No unnecessary data is included
    """
    include_details: bool = Field(default=False, description="Include detailed health information")
    check_cache: bool = Field(default=True, description="Check cache health")
    check_database: bool = Field(default=True, description="Check database health")
    check_models: bool = Field(default=True, description="Check ML models health")
    
    class Config:
        validate_assignment = True
        extra = "forbid"


class MetricsRequest(BaseModel):
    """
    Validated request model for metrics requests
    
    This model ensures:
    - Time range is reasonable
    - Metrics type is valid
    """
    time_range: str = Field(default="1h", regex=r"^\d+[hmd]$", description="Time range (e.g., 1h, 24h, 7d)")
    include_cache_metrics: bool = Field(default=True, description="Include cache metrics")
    include_model_metrics: bool = Field(default=True, description="Include model metrics")
    
    @validator('time_range')
    def validate_time_range(cls, v):
        """Validate time range format"""
        if not re.match(r'^\d+[hmd]$', v):
            raise ValidationError('Time range must be in format: <number>[h|m|d]')
        
        # Parse and validate reasonable limits
        number = int(v[:-1])
        unit = v[-1]
        
        if unit == 'h' and (number < 1 or number > 168):  # 1 hour to 1 week
            raise ValidationError('Hours must be between 1 and 168')
        elif unit == 'm' and (number < 1 or number > 10080):  # 1 minute to 1 week
            raise ValidationError('Minutes must be between 1 and 10080')
        elif unit == 'd' and (number < 1 or number > 30):  # 1 day to 1 month
            raise ValidationError('Days must be between 1 and 30')
        
        return v
    
    class Config:
        validate_assignment = True
        extra = "forbid" 