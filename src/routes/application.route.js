const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getEmployeeIdFromCookie, getRestaurantIdFromCookie } = require('../helpers/cookies.js');
const { checkEmployee, checkCompany } = require('../helpers/authenticateToken.js');
const {
  validateApplicationInput,
  getJobPost,
  getExistingApplication,
  createApplication,
  getApplicationById,
  getJobOfferForRestaurant,
  getApplicationsForJobOffer
} = require('../helpers/applicationHelpers.js');
const { sendJobApplicationNotification } = require('../services/emailService.js');

const prisma = new PrismaClient();

const router = express.Router();

// POST /application - Create a new application
router.post('/application', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { jobPostId, answers } = req.body;
    const employeeId = req.employeeId;

    // Validate employee authentication
    if (!employeeId) {
      return res.status(401).json({ 
        success: false,
        message: 'Debes hacer log in para postular' 
      });
    }

    // Validate input data
    const validation = validateApplicationInput({ jobPostId, answers });
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false,
        message: 'Datos inválidos',
        errors: validation.errors 
      });
    }

    // Check if job post exists
    const jobPost = await getJobPost(jobPostId);
    if (!jobPost) {
      return res.status(404).json({ 
        success: false,
        message: 'Job post not found.' 
      });
    }

    // Check if employee has already applied
    const existingApplication = await getExistingApplication(jobPostId, employeeId);
    if (existingApplication) {
      return res.status(409).json({ 
        success: false,
        message: 'Ya postulaste a este trabajo.' 
      });
    }

    // Create application
    const application = await createApplication(jobPostId, employeeId, answers);

    // Send email notification to restaurant
    try {
      // Get restaurant and employee details for notification
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: jobPost.restaurantId },
        select: { name: true, user: { select: { email: true } } }
      });

      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { user: { select: { name: true, email: true } } }
      });

      if (restaurant && employee) {
        await sendJobApplicationNotification({
          applicantName: employee.user.name,
          applicantEmail: employee.user.email,
          jobTitle: jobPost.title,
          restaurantName: restaurant.name,
          restaurantEmail: restaurant.user.email,
          applicationId: application.id
        });
        console.log('📧 Job application notification sent');
      }
    } catch (emailError) {
      console.error('❌ Failed to send job application notification:', emailError);
      // Don't fail the application creation if email fails
    }

    res.status(201).json({ 
      success: true,
      message: 'Postulaste exitosamente.', 
      data: application
    });
  } catch (error) {
    console.error('Error creating application:', error);

    if (error.code === 'P2025') {
      return res.status(400).json({ 
        success: false,
        message: 'Este trabajo ya no está disponible.' 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Hemos tenido un error, intenta más tarde.' 
    });
  }
});

// GET /applications/:applicationId - Get application by ID
router.get('/applications/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;

    // Validate application ID
    const parsedId = parseInt(applicationId);
    if (!applicationId || isNaN(parsedId) || parsedId <= 0 || parsedId > Number.MAX_SAFE_INTEGER) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid application ID' 
      });
    }

    const application = await getApplicationById(parsedId);

    if (!application) {
      return res.status(404).json({ 
        success: false,
        message: 'Application not found' 
      });
    }

    res.status(200).json({ 
      success: true,
      data: application 
    });
  } catch (error) {
    console.error('🚨 Error in GET /applications/:applicationId:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /job-offers/:jobOfferId/applicants - Get applicants for a job offer
router.get('/job-offers/:jobOfferId/applicants', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const { jobOfferId } = req.params;
    const { restaurantId } = req;

    // Validate job offer ID
    const parsedJobOfferId = parseInt(jobOfferId);
    if (!jobOfferId || isNaN(parsedJobOfferId) || parsedJobOfferId <= 0 || parsedJobOfferId > Number.MAX_SAFE_INTEGER) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid job offer ID' 
      });
    }

    // Validate restaurant ID
    if (!restaurantId) {
      return res.status(401).json({ 
        success: false,
        message: 'Restaurant ID is required' 
      });
    }

    // Check if job offer exists and belongs to restaurant
    const jobOffer = await getJobOfferForRestaurant(parsedJobOfferId, restaurantId);
    if (!jobOffer) {
      return res.status(404).json({ 
        success: false,
        message: 'Job offer not found or you do not have permission to view the applicants.' 
      });
    }

    // Get applications for this job offer
    const applications = await getApplicationsForJobOffer(parsedJobOfferId);

    res.json({ 
      success: true,
      data: applications,
      count: applications.length
    });
  } catch (error) {
    console.error('Error getting applicants:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

module.exports = router;
