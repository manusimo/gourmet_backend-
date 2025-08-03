import { Router } from "express";
import { getEmployeeIdFromCookie, getRestaurantIdFromCookie } from "../helpers/cookies.js";
import { checkEmployee, checkCompany } from "../helpers/authenticateToken.js";
import {
  validateApplicationInput,
  getJobPost,
  getExistingApplication,
  createApplication,
  getApplicationById,
  getJobOfferForRestaurant,
  getApplicationsForJobOffer
} from "../helpers/applicationHelpers.js";

const router = Router();

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
    if (!applicationId || isNaN(parseInt(applicationId))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid application ID' 
      });
    }

    const application = await getApplicationById(applicationId);

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
    if (!jobOfferId || isNaN(parseInt(jobOfferId))) {
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
    const jobOffer = await getJobOfferForRestaurant(jobOfferId, restaurantId);
    if (!jobOffer) {
      return res.status(404).json({ 
        success: false,
        message: 'Job offer not found or you do not have permission to view the applicants.' 
      });
    }

    // Get applications for this job offer
    const applications = await getApplicationsForJobOffer(jobOfferId);

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

export default router;
