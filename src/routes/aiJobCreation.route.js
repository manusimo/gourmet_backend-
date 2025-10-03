const express = require('express');
const router = express.Router();
const { prisma } = require('../db.js');
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const aiJobCreationService = require('../services/aiJobCreationService.js');


/**
 * POST /ai-job-creation/process - Process natural language job description and extract structured data
 */
router.post('/process', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI JOB CREATION] Processing job description');
    
    const { 
      userMessage, 
      conversationHistory = [], 
      restaurantId 
    } = req.body;

    if (!userMessage) {
      return res.status(400).json({
        success: false,
        error: 'userMessage is required'
      });
    }

    // Get restaurant context
    let restaurantContext = {};
    if (restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: parseInt(restaurantId) },
        select: { name: true, legalName: true }
      });
      restaurantContext = restaurant || {};
    }

    console.log('🤖 [AI JOB CREATION] Processing with context:', { restaurantContext });

    // Process job description with AI
    const result = await aiJobCreationService.processJobDescription(
      userMessage, 
      conversationHistory, 
      restaurantContext
    );

    console.log('🤖 [AI JOB CREATION] AI processing result:', result);

    res.status(200).json({
      success: true,
      data: {
        status: result.status,
        message: result.message,
        extractedData: result.extractedData,
        missingFields: result.missingFields,
        suggestions: result.suggestions,
        tokens: result.tokens
      }
    });

  } catch (error) {
    console.error('❌ [AI JOB CREATION] Error processing job description:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process job description'
    });
  }
});

/**
 * POST /ai-job-creation/validate - Validate extracted job data
 */
router.post('/validate', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI JOB CREATION] Validating job data');
    
    const { extractedData } = req.body;

    if (!extractedData) {
      return res.status(400).json({
        success: false,
        error: 'extractedData is required'
      });
    }

    // Validate job data
    const validation = aiJobCreationService.validateJobData(extractedData);

    console.log('🤖 [AI JOB CREATION] Validation result:', validation);

    res.status(200).json({
      success: true,
      data: {
        isValid: validation.isValid,
        missingFields: validation.missingFields,
        completeness: validation.completeness
      }
    });

  } catch (error) {
    console.error('❌ [AI JOB CREATION] Error validating job data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate job data'
    });
  }
});

/**
 * POST /ai-job-creation/create-job - Create job from AI extracted data
 */
router.post('/create-job', getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('🤖 [AI JOB CREATION] Creating job from AI data');
    
    const { 
      extractedData, 
      restaurantId,
      locationId 
    } = req.body;

    if (!extractedData || !restaurantId || !locationId) {
      return res.status(400).json({
        success: false,
        error: 'extractedData, restaurantId, and locationId are required'
      });
    }

    // Validate the data first
    const validation = aiJobCreationService.validateJobData(extractedData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Job data is incomplete',
        missingFields: validation.missingFields
      });
    }

    // Prepare job data for creation
    const jobData = {
      ...extractedData,
      restaurantId: parseInt(restaurantId),
      locationId: parseInt(locationId),
      restaurantUserId: req.restaurantUserId
    };

    console.log('🤖 [AI JOB CREATION] Creating job with data:', jobData);

    // Import the job creation helper
    const { createJobOffer } = require('../helpers/jobHelpers.js');

    // Create the job offer
    const jobOffer = await createJobOffer(jobData);

    console.log('✅ [AI JOB CREATION] Job created successfully:', jobOffer.id);

    res.status(201).json({
      success: true,
      message: 'Job created successfully with AI assistance',
      data: {
        jobOffer,
        aiAssisted: true
      }
    });

  } catch (error) {
    console.error('❌ [AI JOB CREATION] Error creating job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create job'
    });
  }
});


module.exports = router;
