"""
Core recommendation service for the ML Recommendation System

This module implements the machine learning algorithms for job recommendations:
1. Collaborative Filtering - "Users like you also liked these jobs"
2. Content-Based Filtering - "Jobs similar to what you've liked before"
3. Hybrid Approach - Combines both methods for better results

The service uses scikit-learn and pandas for data processing and ML operations.
"""

import asyncio
import time
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime

import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import StandardScaler
from surprise import SVD, Dataset, Reader
from surprise.model_selection import train_test_split
import structlog

from ..database import DatabaseService
from .cache_service import CacheService

logger = structlog.get_logger()


class RecommendationService:
    """
    Core recommendation service implementing ML algorithms
    
    This service provides:
    - Collaborative filtering using matrix factorization (SVD)
    - Content-based filtering using TF-IDF and cosine similarity
    - Hybrid recommendations combining both approaches
    - Model training and prediction
    - Caching for performance optimization
    
    The algorithms learn from user interactions and job features to provide
    personalized job recommendations.
    """
    
    def __init__(self, db_service: DatabaseService, cache_service: CacheService):
        """
        Initialize the recommendation service
        
        Args:
            db_service: Database service for loading data
            cache_service: Cache service for storing predictions
        """
        self.db_service = db_service
        self.cache_service = cache_service
        
        # ML Models
        self.collaborative_model: Optional[SVD] = None
        self.content_vectorizer: Optional[TfidfVectorizer] = None
        self.content_similarity_matrix: Optional[np.ndarray] = None
        
        # Data storage
        self.interactions_df: Optional[pd.DataFrame] = None
        self.jobs_df: Optional[pd.DataFrame] = None
        
        # Model status
        self.models_loaded = False
        self.last_training_time: Optional[datetime] = None
        
    async def train_models(self):
        """
        Train all recommendation models
        
        This method:
        1. Loads training data from the database
        2. Trains collaborative filtering model (SVD)
        3. Trains content-based filtering model (TF-IDF)
        4. Caches the trained models for fast predictions
        
        Training happens asynchronously to avoid blocking the API.
        """
        try:
            logger.info("🚀 Starting model training...")
            start_time = time.time()
            
            # Load training data
            await self._load_training_data()
            
            # Train collaborative filtering model
            await self._train_collaborative_model()
            
            # Train content-based filtering model
            await self._train_content_model()
            
            # Update status
            self.models_loaded = True
            self.last_training_time = datetime.now()
            
            training_time = time.time() - start_time
            logger.info(f"✅ Model training completed in {training_time:.2f} seconds")
            
        except Exception as e:
            logger.error(f"❌ Model training failed: {e}")
            self.models_loaded = False
            raise
    
    async def get_recommendations(
        self, 
        user_id: int, 
        algorithm: str = "hybrid", 
        limit: int = 10
    ) -> Tuple[List[int], List[float]]:
        """
        Get job recommendations for a user
        
        This is the main method that generates recommendations using the specified algorithm.
        
        Args:
            user_id: User ID to get recommendations for
            algorithm: Algorithm to use ("collaborative", "content", "hybrid")
            limit: Maximum number of recommendations to return
            
        Returns:
            Tuple of (job_ids, scores) where scores are confidence values (0-1)
        """
        try:
            # Check cache first
            cached_recommendations = await self.cache_service.get_recommendations(user_id, algorithm)
            if cached_recommendations:
                # Return cached recommendations with dummy scores
                scores = [0.8] * len(cached_recommendations)  # Default confidence
                return cached_recommendations[:limit], scores[:limit]
            
            # Ensure models are loaded
            if not self.models_loaded:
                await self.train_models()
            
            # Generate recommendations based on algorithm
            if algorithm == "collaborative":
                recommendations, scores = await self._get_collaborative_recommendations(user_id, limit)
            elif algorithm == "content":
                recommendations, scores = await self._get_content_recommendations(user_id, limit)
            elif algorithm == "hybrid":
                recommendations, scores = await self._get_hybrid_recommendations(user_id, limit)
            else:
                raise ValueError(f"Unknown algorithm: {algorithm}")
            
            # Cache the recommendations
            if recommendations:
                await self.cache_service.set_recommendations(user_id, algorithm, recommendations)
            
            logger.info(f"🎯 Generated {len(recommendations)} recommendations for user {user_id} using {algorithm}")
            return recommendations, scores
            
        except Exception as e:
            logger.error(f"❌ Failed to get recommendations for user {user_id}: {e}")
            return [], []
    
    async def _load_training_data(self):
        """
        Load training data from database
        
        This method loads the data needed to train our ML models:
        - User-job interactions (for collaborative filtering)
        - Job features (for content-based filtering)
        """
        try:
            logger.info("📊 Loading training data...")
            
            # Load interactions data (user_id, job_id, rating)
            self.interactions_df = await self.db_service.load_interactions_data()
            
            # Load jobs data (id, title, description, skills, etc.)
            self.jobs_df = await self.db_service.load_jobs_data()
            
            logger.info(f"✅ Loaded {len(self.interactions_df)} interactions and {len(self.jobs_df)} jobs")
            
        except Exception as e:
            logger.error(f"❌ Failed to load training data: {e}")
            raise
    
    async def _train_collaborative_model(self):
        """
        Train collaborative filtering model using SVD
        
        This method trains a matrix factorization model that learns:
        - User preferences (latent factors)
        - Job characteristics (latent factors)
        - How to predict user-job ratings
        
        The model finds patterns like "users who like frontend jobs also like UI/UX jobs"
        """
        try:
            logger.info("🤝 Training collaborative filtering model...")
            
            if self.interactions_df.empty:
                logger.warning("⚠️ No interaction data available for collaborative filtering")
                return
            
            # Prepare data for Surprise library
            reader = Reader(rating_scale=(1, 5))
            data = Dataset.load_from_df(
                self.interactions_df[['user_id', 'job_id', 'rating']], 
                reader
            )
            
            # Split data for training
            trainset, testset = train_test_split(data, test_size=0.2, random_state=42)
            
            # Train SVD model
            self.collaborative_model = SVD(
                n_factors=50,      # Number of latent factors
                n_epochs=20,       # Number of training iterations
                lr_all=0.005,      # Learning rate
                reg_all=0.02       # Regularization
            )
            
            self.collaborative_model.fit(trainset)
            
            # Evaluate model (optional)
            predictions = self.collaborative_model.test(testset)
            rmse = np.sqrt(np.mean([(pred.r_ui - pred.est) ** 2 for pred in predictions]))
            logger.info(f"✅ Collaborative model trained with RMSE: {rmse:.3f}")
            
        except Exception as e:
            logger.error(f"❌ Failed to train collaborative model: {e}")
            raise
    
    async def _train_content_model(self):
        """
        Train content-based filtering model using TF-IDF
        
        This method creates a model that learns job similarities based on:
        - Job titles and descriptions
        - Required skills
        - Job type and location
        - Salary range
        
        The model finds jobs similar to what the user has liked before.
        """
        try:
            logger.info("📝 Training content-based filtering model...")
            
            if self.jobs_df.empty:
                logger.warning("⚠️ No job data available for content-based filtering")
                return
            
            # Prepare job features for TF-IDF
            job_features = []
            for _, job in self.jobs_df.iterrows():
                # Combine all text features
                features = []
                features.append(job['title'].lower())
                features.append(job['description'].lower())
                
                # Add skills as features
                if isinstance(job['required_skills'], list):
                    features.extend([skill.lower() for skill in job['required_skills']])
                
                features.append(job['location'].lower())
                features.append(job['job_type'].lower())
                
                # Combine all features into one string
                job_features.append(' '.join(features))
            
            # Create TF-IDF vectorizer
            self.content_vectorizer = TfidfVectorizer(
                max_features=1000,     # Maximum number of features
                stop_words='english',  # Remove common words
                ngram_range=(1, 2),    # Use 1-2 word combinations
                min_df=2,              # Minimum document frequency
                max_df=0.8             # Maximum document frequency
            )
            
            # Fit and transform job features
            tfidf_matrix = self.content_vectorizer.fit_transform(job_features)
            
            # Calculate cosine similarity between all jobs
            self.content_similarity_matrix = cosine_similarity(tfidf_matrix)
            
            logger.info(f"✅ Content model trained with {tfidf_matrix.shape[1]} features")
            
        except Exception as e:
            logger.error(f"❌ Failed to train content model: {e}")
            raise
    
    async def _get_collaborative_recommendations(self, user_id: int, limit: int) -> Tuple[List[int], List[float]]:
        """
        Get recommendations using collaborative filtering
        
        This method uses the trained SVD model to predict how much a user
        would like each job based on similar users' preferences.
        
        Args:
            user_id: User ID to get recommendations for
            limit: Maximum number of recommendations
            
        Returns:
            Tuple of (job_ids, scores)
        """
        try:
            if not self.collaborative_model:
                logger.warning("⚠️ Collaborative model not trained")
                return [], []
            
            # Get all job IDs
            all_job_ids = self.jobs_df['id'].unique()
            
            # Predict ratings for all jobs
            predictions = []
            for job_id in all_job_ids:
                try:
                    predicted_rating = self.collaborative_model.predict(user_id, job_id).est
                    predictions.append((job_id, predicted_rating))
                except:
                    # Skip jobs the model can't predict for
                    continue
            
            # Sort by predicted rating (highest first)
            predictions.sort(key=lambda x: x[1], reverse=True)
            
            # Get top recommendations
            job_ids = [job_id for job_id, _ in predictions[:limit]]
            scores = [score for _, score in predictions[:limit]]
            
            # Normalize scores to 0-1 range
            if scores:
                max_score = max(scores)
                scores = [score / max_score for score in scores]
            
            return job_ids, scores
            
        except Exception as e:
            logger.error(f"❌ Collaborative filtering failed: {e}")
            return [], []
    
    async def _get_content_recommendations(self, user_id: int, limit: int) -> Tuple[List[int], List[float]]:
        """
        Get recommendations using content-based filtering
        
        This method finds jobs similar to what the user has liked before
        based on job features like skills, location, and job type.
        
        Args:
            user_id: User ID to get recommendations for
            limit: Maximum number of recommendations
            
        Returns:
            Tuple of (job_ids, scores)
        """
        try:
            if self.content_similarity_matrix is None:
                logger.warning("⚠️ Content model not trained")
                return [], []
            
            # Get user's liked jobs
            user_interactions = self.interactions_df[
                (self.interactions_df['user_id'] == user_id) & 
                (self.interactions_df['rating'] >= 4)  # Only consider positive interactions
            ]
            
            if user_interactions.empty:
                logger.info(f"ℹ️ No positive interactions found for user {user_id}")
                return [], []
            
            # Get job IDs the user liked
            liked_job_ids = user_interactions['job_id'].tolist()
            
            # Find jobs similar to liked jobs
            job_scores = {}
            for liked_job_id in liked_job_ids:
                # Find this job's index in the similarity matrix
                job_idx = self.jobs_df[self.jobs_df['id'] == liked_job_id].index
                if len(job_idx) == 0:
                    continue
                
                job_idx = job_idx[0]
                
                # Get similarity scores for this job
                similarities = self.content_similarity_matrix[job_idx]
                
                # Add scores to our running total
                for i, similarity in enumerate(similarities):
                    job_id = self.jobs_df.iloc[i]['id']
                    if job_id not in job_scores:
                        job_scores[job_id] = 0
                    job_scores[job_id] += similarity
            
            # Remove jobs the user already interacted with
            for job_id in liked_job_ids:
                job_scores.pop(job_id, None)
            
            # Sort by similarity score
            sorted_jobs = sorted(job_scores.items(), key=lambda x: x[1], reverse=True)
            
            # Get top recommendations
            job_ids = [job_id for job_id, _ in sorted_jobs[:limit]]
            scores = [score for _, score in sorted_jobs[:limit]]
            
            # Normalize scores
            if scores:
                max_score = max(scores)
                scores = [score / max_score for score in scores]
            
            return job_ids, scores
            
        except Exception as e:
            logger.error(f"❌ Content-based filtering failed: {e}")
            return [], []
    
    async def _get_hybrid_recommendations(self, user_id: int, limit: int) -> Tuple[List[int], List[float]]:
        """
        Get recommendations using hybrid approach
        
        This method combines collaborative and content-based filtering:
        1. Gets recommendations from both algorithms
        2. Combines scores using weighted average
        3. Returns the best combined recommendations
        
        Args:
            user_id: User ID to get recommendations for
            limit: Maximum number of recommendations
            
        Returns:
            Tuple of (job_ids, scores)
        """
        try:
            # Get recommendations from both algorithms
            collab_jobs, collab_scores = await self._get_collaborative_recommendations(user_id, limit * 2)
            content_jobs, content_scores = await self._get_content_recommendations(user_id, limit * 2)
            
            # Combine recommendations
            combined_scores = {}
            
            # Add collaborative scores
            for job_id, score in zip(collab_jobs, collab_scores):
                combined_scores[job_id] = score * 0.6  # 60% weight
            
            # Add content scores
            for job_id, score in zip(content_jobs, content_scores):
                if job_id in combined_scores:
                    combined_scores[job_id] += score * 0.4  # 40% weight
                else:
                    combined_scores[job_id] = score * 0.4
            
            # Sort by combined score
            sorted_jobs = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
            
            # Get top recommendations
            job_ids = [job_id for job_id, _ in sorted_jobs[:limit]]
            scores = [score for _, score in sorted_jobs[:limit]]
            
            return job_ids, scores
            
        except Exception as e:
            logger.error(f"❌ Hybrid filtering failed: {e}")
            return [], []
    
    async def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about the trained models
        
        This method returns metadata about the models for monitoring and debugging.
        
        Returns:
            Dictionary with model information
        """
        return {
            "models_loaded": self.models_loaded,
            "last_training_time": self.last_training_time.isoformat() if self.last_training_time else None,
            "collaborative_model": self.collaborative_model is not None,
            "content_model": self.content_vectorizer is not None,
            "interactions_count": len(self.interactions_df) if self.interactions_df is not None else 0,
            "jobs_count": len(self.jobs_df) if self.jobs_df is not None else 0,
            "unique_users": self.interactions_df['user_id'].nunique() if self.interactions_df is not None else 0,
            "unique_jobs": self.interactions_df['job_id'].nunique() if self.interactions_df is not None else 0
        } 