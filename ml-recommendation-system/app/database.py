"""
Database service for the ML Recommendation System

This module handles all database operations for our recommendation system.
It provides a clean interface to:
1. Load user-job interactions (for collaborative filtering)
2. Load job data (for content-based filtering)
3. Load user preferences (for personalized recommendations)
4. Save recommendations and interactions (for tracking and analysis)

The service uses asyncpg for efficient PostgreSQL connections and pandas for data manipulation.
"""

import asyncio
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta

import asyncpg
import pandas as pd
import structlog

logger = structlog.get_logger()


class DatabaseService:
    """
    Database service for handling all database operations
    
    This class manages:
    - Database connection pooling for efficiency
    - Loading training data for ML models
    - Saving recommendation results
    - Recording user interactions
    - Health monitoring
    
    It provides both real database operations and fallback sample data for testing.
    """
    
    def __init__(self, database_url: str, pool_size: int = 10, max_overflow: int = 20):
        """
        Initialize the database service
        
        Args:
            database_url: PostgreSQL connection string
            pool_size: Maximum number of database connections to maintain
            max_overflow: Additional connections that can be created temporarily
        """
        self.database_url = database_url
        self.pool_size = pool_size
        self.max_overflow = max_overflow
        self.pool: Optional[asyncpg.Pool] = None  # Connection pool
        
    async def connect(self):
        """
        Create database connection pool
        
        This method:
        1. Creates a pool of database connections for efficient reuse
        2. Tests the connection to ensure it's working
        3. Sets up connection parameters for optimal performance
        
        The connection pool allows multiple API requests to use database connections
        without creating new connections for each request (which is expensive).
        """
        try:
            # Create a connection pool with optimized settings
            self.pool = await asyncpg.create_pool(
                self.database_url,
                min_size=5,                    # Keep at least 5 connections ready
                max_size=self.pool_size,       # Maximum connections in pool
                command_timeout=60,            # Timeout for database commands
                server_settings={
                    'application_name': 'ml_recommendation_system'  # Identify our app in database logs
                }
            )
            logger.info("✅ Database connection pool created successfully")
            
            # Test the connection to make sure it works
            async with self.pool.acquire() as conn:
                await conn.execute("SELECT 1")
            logger.info("✅ Database connection test successful")
            
        except Exception as e:
            logger.error(f"❌ Failed to create database connection pool: {e}")
            raise
    
    async def close(self):
        """
        Close database connection pool
        
        This method properly closes all database connections when the app shuts down.
        It's important to clean up resources to prevent memory leaks.
        """
        if self.pool:
            await self.pool.close()
            logger.info("✅ Database connection pool closed")
    
    async def is_healthy(self) -> bool:
        """
        Check if database is healthy
        
        This method tests if we can still connect to the database.
        It's used by the health check endpoint to monitor system status.
        
        Returns:
            True if database is accessible, False otherwise
        """
        try:
            if not self.pool:
                return False
            
            # Try to execute a simple query
            async with self.pool.acquire() as conn:
                await conn.execute("SELECT 1")
            return True
        except Exception as e:
            logger.error(f"❌ Database health check failed: {e}")
            return False
    
    async def load_interactions_data(self, days_back: int = 180) -> pd.DataFrame:
        """
        Load user-job interactions from database
        
        This method loads the data that our collaborative filtering algorithm needs.
        It gets user interactions (views, applications, likes) from the database.
        
        Args:
            days_back: Number of days to look back for interactions (default: 6 months)
            
        Returns:
            DataFrame with columns: user_id, job_id, rating, created_at
            
        The data structure:
        - user_id: Which user performed the action
        - job_id: Which job they interacted with
        - rating: How much they liked it (1-5 scale)
        - created_at: When the interaction happened
        
        If no data is found, it creates sample data for testing.
        """
        try:
            async with self.pool.acquire() as conn:
                # Load interactions from the last N days
                # We limit to recent data to keep models current and fast
                query = """
                    SELECT 
                        user_id,
                        job_id,
                        interaction_score as rating,
                        created_at
                    FROM user_job_interactions
                    WHERE created_at >= $1
                    ORDER BY created_at DESC
                """
                
                # Calculate the cutoff date (e.g., 180 days ago)
                cutoff_date = datetime.now() - timedelta(days=days_back)
                rows = await conn.fetch(query, cutoff_date)
                
                if not rows:
                    logger.warning("⚠️ No interaction data found, creating sample data")
                    return self._create_sample_interactions()
                
                # Convert database rows to pandas DataFrame for ML processing
                df = pd.DataFrame(rows, columns=['user_id', 'job_id', 'rating', 'created_at'])
                logger.info(f"✅ Loaded {len(df)} interactions from database")
                
                return df
                
        except Exception as e:
            logger.error(f"❌ Failed to load interactions data: {e}")
            # Return sample data if database fails - this ensures the system still works
            return self._create_sample_interactions()
    
    async def load_jobs_data(self) -> pd.DataFrame:
        """
        Load job data from database
        
        This method loads job information that our content-based filtering algorithm needs.
        It gets job details like title, description, required skills, location, etc.
        
        Returns:
            DataFrame with job information including:
            - id: Job ID
            - title: Job title
            - description: Job description
            - required_skills: List of skills needed
            - location: Job location
            - job_type: Full-time, part-time, etc.
            - salary: Job salary
            - company_id: Which company posted the job
            - is_active: Whether the job is still available
            - created_at: When the job was posted
            
        If no data is found, it creates sample data for testing.
        """
        try:
            async with self.pool.acquire() as conn:
                # Only load active jobs (not expired or filled)
                query = """
                    SELECT 
                        id,
                        title,
                        description,
                        required_skills,
                        location,
                        job_type,
                        salary,
                        company_id,
                        is_active,
                        created_at
                    FROM job_offers
                    WHERE is_active = true
                    ORDER BY created_at DESC
                """
                
                rows = await conn.fetch(query)
                
                if not rows:
                    logger.warning("⚠️ No job data found, creating sample data")
                    return self._create_sample_jobs()
                
                # Convert to DataFrame with proper column names
                df = pd.DataFrame(rows, columns=[
                    'id', 'title', 'description', 'required_skills', 
                    'location', 'job_type', 'salary', 'company_id', 
                    'is_active', 'created_at'
                ])
                logger.info(f"✅ Loaded {len(df)} jobs from database")
                
                return df
                
        except Exception as e:
            logger.error(f"❌ Failed to load jobs data: {e}")
            # Return sample data if database fails
            return self._create_sample_jobs()
    
    async def load_user_preferences(self, user_id: int) -> Optional[Dict[str, Any]]:
        """
        Load user preferences from database
        
        This method gets a user's preferences to help personalize recommendations.
        It loads information like preferred locations, salary range, job types, skills, etc.
        
        Args:
            user_id: User ID to load preferences for
            
        Returns:
            Dictionary with user preferences or None if not found:
            - preferred_locations: List of preferred cities/regions
            - preferred_salary_range: Min/max salary preferences
            - preferred_job_types: Full-time, remote, etc.
            - skills: User's skills and experience
            - experience_level: Junior, senior, etc.
            
        This data is used for content-based filtering and personalization.
        """
        try:
            async with self.pool.acquire() as conn:
                query = """
                    SELECT 
                        preferred_locations,
                        preferred_salary_range,
                        preferred_job_types,
                        skills,
                        experience_level
                    FROM user_preferences
                    WHERE user_id = $1
                """
                
                row = await conn.fetchrow(query, user_id)
                
                if row:
                    return {
                        'preferred_locations': row['preferred_locations'] or [],
                        'preferred_salary_range': row['preferred_salary_range'] or [],
                        'preferred_job_types': row['preferred_job_types'] or [],
                        'skills': row['skills'] or [],
                        'experience_level': row['experience_level']
                    }
                else:
                    return None  # User has no preferences set
                    
        except Exception as e:
            logger.error(f"❌ Failed to load preferences for user {user_id}: {e}")
            return None
    
    async def save_recommendation(self, user_id: int, job_id: int, score: float, algorithm: str):
        """
        Save a recommendation for tracking and analysis
        
        This method stores each recommendation we make so we can:
        1. Track which recommendations were made
        2. Analyze recommendation performance
        3. Improve our algorithms over time
        4. Avoid showing the same recommendations repeatedly
        
        Args:
            user_id: User ID who received the recommendation
            job_id: Job ID that was recommended
            score: How confident we are in this recommendation (0-1)
            algorithm: Which algorithm made this recommendation
        """
        try:
            async with self.pool.acquire() as conn:
                # Use UPSERT to avoid duplicates and update existing recommendations
                query = """
                    INSERT INTO job_recommendations 
                    (user_id, job_id, score, algorithm, created_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (user_id, job_id, algorithm) 
                    DO UPDATE SET 
                        score = $3,
                        created_at = NOW()
                """
                
                await conn.execute(query, user_id, job_id, score, algorithm)
                
        except Exception as e:
            logger.error(f"❌ Failed to save recommendation: {e}")
    
    async def record_interaction(self, user_id: int, job_id: int, interaction_type: str, score: int = 1):
        """
        Record a user interaction with a job
        
        This method tracks when users interact with jobs (view, apply, save, like).
        This data is crucial for our ML models to learn user preferences.
        
        Args:
            user_id: User ID who performed the action
            job_id: Job ID they interacted with
            interaction_type: Type of interaction (view, apply, save, like)
            score: Interaction score (1-5 scale, where 5 is most positive)
            
        Different interaction types have different weights:
        - view: 1 (basic interest)
        - save: 3 (stronger interest)
        - apply: 5 (very strong interest)
        - like: 4 (positive feedback)
        """
        try:
            async with self.pool.acquire() as conn:
                # Use UPSERT to update existing interactions
                query = """
                    INSERT INTO user_job_interactions 
                    (user_id, job_id, interaction_type, interaction_score, created_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (user_id, job_id) 
                    DO UPDATE SET 
                        interaction_type = $3,
                        interaction_score = $4,
                        created_at = NOW()
                """
                
                await conn.execute(query, user_id, job_id, interaction_type, score)
                
        except Exception as e:
            logger.error(f"❌ Failed to record interaction: {e}")
    
    async def get_job_details(self, job_ids: List[int]) -> pd.DataFrame:
        """
        Get detailed job information for given job IDs
        
        This method is used to get full job details after we've made recommendations.
        It's called by the frontend to display job information to users.
        
        Args:
            job_ids: List of job IDs to get details for
            
        Returns:
            DataFrame with job details including:
            - id: Job ID
            - title: Job title
            - description: Job description
            - required_skills: Skills needed
            - location: Job location
            - job_type: Employment type
            - salary: Job salary
            - company_id: Company that posted the job
        """
        try:
            if not job_ids:
                return pd.DataFrame()  # Return empty DataFrame if no job IDs
            
            async with self.pool.acquire() as conn:
                # Create placeholders for the IN clause (e.g., $1, $2, $3)
                placeholders = ','.join(f'${i+1}' for i in range(len(job_ids)))
                
                query = f"""
                    SELECT 
                        id,
                        title,
                        description,
                        required_skills,
                        location,
                        job_type,
                        salary,
                        company_id
                    FROM job_offers
                    WHERE id IN ({placeholders})
                    AND is_active = true
                """
                
                rows = await conn.fetch(query, *job_ids)
                
                if rows:
                    df = pd.DataFrame(rows, columns=[
                        'id', 'title', 'description', 'required_skills',
                        'location', 'job_type', 'salary', 'company_id'
                    ])
                    return df
                else:
                    return pd.DataFrame()  # No jobs found
                    
        except Exception as e:
            logger.error(f"❌ Failed to get job details: {e}")
            return pd.DataFrame()
    
    # ============================================================================
    # SAMPLE DATA GENERATION (for testing and development)
    # ============================================================================
    
    def _create_sample_interactions(self) -> pd.DataFrame:
        """
        Create sample interaction data for testing
        
        This method creates fake user-job interactions when no real data exists.
        It's useful for:
        - Development and testing
        - Demonstrating the system
        - Learning how the algorithms work
        
        Returns:
            DataFrame with sample interaction data
        """
        sample_data = [
            # User 1 likes frontend and data science jobs
            {'user_id': 1, 'job_id': 1, 'rating': 5, 'created_at': datetime.now()},  # Frontend Developer
            {'user_id': 1, 'job_id': 2, 'rating': 3, 'created_at': datetime.now()},  # Backend Developer
            {'user_id': 1, 'job_id': 3, 'rating': 5, 'created_at': datetime.now()},  # Data Scientist
            
            # User 2 likes backend and DevOps jobs
            {'user_id': 2, 'job_id': 1, 'rating': 4, 'created_at': datetime.now()},  # Frontend Developer
            {'user_id': 2, 'job_id': 2, 'rating': 5, 'created_at': datetime.now()},  # Backend Developer
            {'user_id': 2, 'job_id': 4, 'rating': 5, 'created_at': datetime.now()},  # DevOps Engineer
            
            # User 3 likes data science and design jobs
            {'user_id': 3, 'job_id': 1, 'rating': 3, 'created_at': datetime.now()},  # Frontend Developer
            {'user_id': 3, 'job_id': 3, 'rating': 5, 'created_at': datetime.now()},  # Data Scientist
            {'user_id': 3, 'job_id': 5, 'rating': 5, 'created_at': datetime.now()},  # UI/UX Designer
            
            # User 4 likes backend and design jobs
            {'user_id': 4, 'job_id': 2, 'rating': 4, 'created_at': datetime.now()},  # Backend Developer
            {'user_id': 4, 'job_id': 5, 'rating': 5, 'created_at': datetime.now()},  # UI/UX Designer
        ]
        
        df = pd.DataFrame(sample_data)
        logger.info("✅ Created sample interaction data")
        return df
    
    def _create_sample_jobs(self) -> pd.DataFrame:
        """
        Create sample job data for testing
        
        This method creates fake job postings when no real data exists.
        The jobs are designed to demonstrate different types of roles and skills.
        
        Returns:
            DataFrame with sample job data
        """
        sample_data = [
            {
                'id': 1,
                'title': 'Frontend Developer',
                'description': 'We are looking for a skilled frontend developer to join our team and build amazing user interfaces...',
                'required_skills': ['javascript', 'react', 'html', 'css'],
                'location': 'Barcelona',
                'job_type': 'full-time',
                'salary': 45000,
                'company_id': 1,
                'is_active': True,
                'created_at': datetime.now()
            },
            {
                'id': 2,
                'title': 'Backend Developer',
                'description': 'Join our backend team to build scalable APIs and microservices that power our platform...',
                'required_skills': ['python', 'node.js', 'postgresql', 'docker'],
                'location': 'Madrid',
                'job_type': 'full-time',
                'salary': 50000,
                'company_id': 2,
                'is_active': True,
                'created_at': datetime.now()
            },
            {
                'id': 3,
                'title': 'Data Scientist',
                'description': 'Help us build machine learning models and analyze data to drive business decisions...',
                'required_skills': ['python', 'pandas', 'scikit-learn', 'sql'],
                'location': 'Barcelona',
                'job_type': 'full-time',
                'salary': 55000,
                'company_id': 1,
                'is_active': True,
                'created_at': datetime.now()
            },
            {
                'id': 4,
                'title': 'DevOps Engineer',
                'description': 'Manage our cloud infrastructure and deployment pipelines to ensure reliable and scalable systems...',
                'required_skills': ['docker', 'kubernetes', 'aws', 'terraform'],
                'location': 'Remote',
                'job_type': 'full-time',
                'salary': 60000,
                'company_id': 3,
                'is_active': True,
                'created_at': datetime.now()
            },
            {
                'id': 5,
                'title': 'UI/UX Designer',
                'description': 'Create beautiful and intuitive user interfaces that provide exceptional user experiences...',
                'required_skills': ['figma', 'sketch', 'adobe', 'user-research'],
                'location': 'Barcelona',
                'job_type': 'full-time',
                'salary': 40000,
                'company_id': 1,
                'is_active': True,
                'created_at': datetime.now()
            }
        ]
        
        df = pd.DataFrame(sample_data)
        logger.info("✅ Created sample job data")
        return df 