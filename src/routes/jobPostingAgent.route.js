const express = require('express');
const router = express.Router();
const { prisma } = require('../db.js');
const { getUserIdFromCookie } = require('../middleware/auth.js');
const jobPostingAgent = require('../services/jobPostingAgent.js');

/**
 * POST /generate-job-posting - Generate AI-powered job posting
 */
router.post('/generate-job-posting', getUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [JOB POSTING AGENT] Starting job posting generation');
    
    const { 
      position, 
      requirements, 
      restaurantId,
      locationId,
      preferences = {}
    } = req.body;
    const userId = req.userId;

    if (!position || !restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'position and restaurantId are required'
      });
    }

    console.log('🤖 [JOB POSTING AGENT] Parameters:', { 
      position, 
      restaurantId, 
      locationId,
      userId 
    });

    // Get restaurant details for context
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: parseInt(restaurantId) },
      include: {
        user: true,
        locations: true
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    // Get location details if provided
    let location = null;
    if (locationId) {
      location = await prisma.location.findUnique({
        where: { id: parseInt(locationId) }
      });
    }

    // Get similar job postings for reference
    const similarJobs = await prisma.jobPost.findMany({
      where: {
        restaurantId: parseInt(restaurantId),
        position: {
          contains: position,
          mode: 'insensitive'
        }
      },
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    // Generate job posting with AI
    const generatedJobPost = await jobPostingAgent.generateJobPosting({
      position,
      requirements,
      restaurant: {
        name: restaurant.name,
        description: restaurant.description || '',
        type: restaurant.type || ''
      },
      location: location ? {
        address: location.address,
        city: location.city || '',
        region: location.region || ''
      } : null,
      similarJobs: similarJobs.map(job => ({
        position: job.position,
        description: job.description,
        functions: job.functions,
        schedule: job.schedule,
        salary: job.salary
      })),
      preferences
    });

    if (generatedJobPost.success) {
      res.status(200).json({
        success: true,
        data: {
          jobPost: generatedJobPost.data,
          suggestions: generatedJobPost.suggestions,
          confidence: generatedJobPost.confidence
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: generatedJobPost.error
      });
    }

  } catch (error) {
    console.error('❌ [JOB POSTING AGENT] Error generating job posting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate job posting'
    });
  }
});

/**
 * POST /optimize-job-posting - Optimize existing job posting
 */
router.post('/optimize-job-posting', getUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [JOB POSTING AGENT] Optimizing existing job posting');
    
    const { jobPostId, optimizationType = 'all' } = req.body;
    const userId = req.userId;

    if (!jobPostId) {
      return res.status(400).json({
        success: false,
        error: 'jobPostId is required'
      });
    }

    // Get existing job post
    const existingJobPost = await prisma.jobPost.findUnique({
      where: { id: parseInt(jobPostId) },
      include: {
        restaurant: true,
        location: true,
        applications: {
          include: {
            employee: {
              include: { user: true }
            }
          }
        }
      }
    });

    if (!existingJobPost) {
      return res.status(404).json({
        success: false,
        error: 'Job post not found'
      });
    }

    // Optimize job posting
    const optimizedJobPost = await jobPostingAgent.optimizeJobPosting({
      existingJobPost,
      optimizationType, // 'description', 'functions', 'requirements', 'all'
      applicationData: existingJobPost.applications.map(app => ({
        candidateName: app.employee.user.name,
        applicationDate: app.createdAt,
        status: app.status
      }))
    });

    if (optimizedJobPost.success) {
      res.status(200).json({
        success: true,
        data: {
          originalJobPost: existingJobPost,
          optimizedJobPost: optimizedJobPost.data,
          improvements: optimizedJobPost.improvements,
          confidence: optimizedJobPost.confidence
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: optimizedJobPost.error
      });
    }

  } catch (error) {
    console.error('❌ [JOB POSTING AGENT] Error optimizing job posting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize job posting'
    });
  }
});

/**
 * GET /job-posting-suggestions/:restaurantId - Get job posting suggestions for restaurant
 */
router.get('/job-posting-suggestions/:restaurantId', getUserIdFromCookie, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { position } = req.query;
    
    console.log('🤖 [JOB POSTING AGENT] Getting suggestions for restaurant:', restaurantId);

    // Get restaurant details
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: parseInt(restaurantId) },
      include: {
        user: true,
        jobPosts: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    // Get market insights and suggestions
    const suggestions = await jobPostingAgent.getJobPostingSuggestions({
      restaurant: {
        name: restaurant.name,
        type: restaurant.type || '',
        existingJobs: restaurant.jobPosts.map(job => ({
          position: job.position,
          description: job.description,
          salary: job.salary,
          schedule: job.schedule
        }))
      },
      targetPosition: position
    });

    if (suggestions.success) {
      res.status(200).json({
        success: true,
        data: {
          suggestions: suggestions.data,
          marketInsights: suggestions.marketInsights,
          recommendations: suggestions.recommendations
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: suggestions.error
      });
    }

  } catch (error) {
    console.error('❌ [JOB POSTING AGENT] Error getting suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job posting suggestions'
    });
  }
});

/**
 * POST /validate-job-posting - Validate job posting against platform constraints
 */
router.post('/validate-job-posting', getUserIdFromCookie, async (req, res) => {
  try {
    const jobPostData = req.body;
    
    console.log('🤖 [JOB POSTING AGENT] Validating job posting data');

    // Validate against platform constraints
    const validation = await jobPostingAgent.validateJobPosting(jobPostData);

    res.status(200).json({
      success: true,
      data: {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        suggestions: validation.suggestions
      }
    });

  } catch (error) {
    console.error('❌ [JOB POSTING AGENT] Error validating job posting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate job posting'
    });
  }
});

module.exports = router;
