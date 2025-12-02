const express = require('express');
const multer = require('multer');
const { prisma } = require('../db.js');
const { checkEmployee, checkCompany, setUserRole } = require('../helpers/authenticateToken.js');
const { getEmployeeIdFromCookie, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, getUserIdFromCookie } = require('../helpers/cookies.js');
const { requirePlan } = require('../middleware/checkPlan.js');
const { findApplicationDetails } = require('../helpers/employee/findApplication.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const { setSecureAuthCookie } = require('../helpers/secureCookie.js');
const {
  getEmployeeById,
  getEmployeeByUserId,
  createEmployeeProfile,
  generateEmployeeToken,
  getEmployeeProfile,
  updateEmployeeProfile,
  createExperience,
  createEducation,
  getEmployeeWithDetails,
  synchronizeExperiences,
  synchronizeEducations,
  searchEmployees,
  getJobOfferById,
  getEmployeeByEmployeeId,
  checkFavoriteJobExists,
  createFavoriteJob,
  getFavoriteJobById,
  deleteFavoriteJob,
  getFavoriteJobs,
  checkTalentPoolRecord,
  createTalentPoolRecord
} = require('../helpers/employeeHelpers.js');

const router = express.Router();

// Import upload service
const { uploadFile, extractKeyFromUrl } = require('../services/uploadService.js');

// Use shared normalization helper from uploadService

// Multer is configured globally in index.js

// GET /employee/:id - Get employee by ID
router.get('/employee/:id', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id, 10);

    if (isNaN(employeeId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid employee ID' 
      });
    }

    const employeeProfile = await getEmployeeById(employeeId);

    if (!employeeProfile) {
      return res.status(404).json({ 
        success: false,
        error: 'Employee profile not found' 
      });
    }

    
    // Convert image keys to actual signed URLs
    const employeeWithSignedUrls = await convertImageUrls(employeeProfile, ['profileImageUrl']);
    
    res.status(200).json({ 
      success: true,
      data: employeeWithSignedUrls 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// Middleware for employee creation (multer is handled globally)
const createEmployeeMiddleware = [
  checkEmployee,
  getUserIdFromCookie
];

// POST /employee - Create employee profile
router.post('/employee', ...createEmployeeMiddleware, async (req, res) => {
  try {
    const {
      name,
      position,
      experiences: experiencesRaw,
      surname,
      skills: skillsRaw,
      educations: educationsRaw,
      aboutMe,
      birthDate,
      country,
      phoneNumber,
      comuna,
      region,
      genre,
      civilState,
      available,
      schedule,
      profileImageUrl
    } = req.body;

    // Parse JSON strings from FormData
    const experiences = typeof experiencesRaw === 'string' ? JSON.parse(experiencesRaw) : experiencesRaw;
    const educations = typeof educationsRaw === 'string' ? JSON.parse(educationsRaw) : educationsRaw;
    const skills = typeof skillsRaw === 'string' ? JSON.parse(skillsRaw) : skillsRaw;

    const userId = req.userId;

    // Handle file upload
    let finalProfileImageUrl = (() => {
      if (!profileImageUrl) return 'No photo';
      if (typeof profileImageUrl === 'string' && profileImageUrl.includes('/api/company/signed-url/')) {
        return profileImageUrl.split('/api/company/signed-url/')[1];
      }
      const maybeKey = extractKeyFromUrl(profileImageUrl);
      return maybeKey || profileImageUrl;
    })();
    
    // Find profile image from global multer files array
    const profileImageFile = req.files && req.files.find(file => file.fieldname === 'profileImage');
    if (profileImageFile) {
    
      const profileImageResult = await uploadFile(profileImageFile, 'employee-profiles');
      if (profileImageResult.success) {
        // Store the key (not full URL), same as company route
        finalProfileImageUrl = profileImageResult.key;
      } else {
        console.error('❌ Employee profile image upload failed:', profileImageResult.error);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload profile image',
          error: profileImageResult.error
        });
      }
    }

    const existingEmployee = await getEmployeeByUserId(userId);

    if (existingEmployee) {
      return res.status(400).json({ 
        success: false,
        message: 'Employee profile already exists' 
      });
    }

    const employeeProfile = await createEmployeeProfile({
      name,
      position,
      experiences,
      surname,
      skills,
      educations,
      aboutMe,
      birthDate,
      country,
      phoneNumber,
      comuna,
      region,
      genre,
      civilState,
      available,
      schedule,
      profileImageUrl: finalProfileImageUrl,
      userId
    });

    const newToken = generateEmployeeToken({
      userId: req.userId,
      employeeId: employeeProfile.id,
    });

    // Set secure authentication cookie (subdomain support)
    setSecureAuthCookie(res, newToken);

    // Convert image keys to actual signed URLs
    const employeeWithSignedUrls = await convertImageUrls(employeeProfile, ['profileImageUrl']);

    res.status(201).json({ 
      success: true,
      message: 'Employee created successfully', 
      data: {
        ...employeeWithSignedUrls,
        token: newToken // Include token for mobile browsers that can't use cookies
      }
    });
  } catch (error) {
    console.error('Error in employee route:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /employee - Get current employee profile
router.get('/employee', getEmployeeIdFromCookie, async (req, res) => {
  try {
    const employeeId = req.employeeId;
    const employeeProfile = await getEmployeeProfile(employeeId);

    if (!employeeProfile) {
      return res.status(404).json({ 
        success: false,
        error: 'Employee profile not found' 
      });
    }

    // Convert image keys to actual signed URLs
    const employeeWithSignedUrls = await convertImageUrls(employeeProfile, ['profileImageUrl']);

    res.status(200).json({ 
      success: true,
      data: employeeWithSignedUrls 
    });
  } catch (error) {
    console.error('Error fetching employee profile:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// Middleware for employee update with file uploads
const updateEmployeeMiddleware = [
  checkEmployee,
  getEmployeeIdFromCookie
];

// PATCH /employee - Update employee profile
router.patch('/employee', ...updateEmployeeMiddleware, async (req, res) => {
  try {
    const {
      name,
      position,
      experiences: experiencesRaw,
      surname,
      period,
      yearsOfExperience,
      educations: educationsRaw,
      skills: skillsRaw,
      aboutMe,
      birthDate,
      region,
      comuna,
      country,
      phoneNumber,
      genre,
      civilState,
      available,
      schedule,
      profileImageUrl
    } = req.body;

    // Parse JSON strings from FormData and ensure arrays are never undefined
    const experiences = typeof experiencesRaw === 'string' 
      ? (JSON.parse(experiencesRaw) || []) 
      : (experiencesRaw || []);
    const educations = typeof educationsRaw === 'string' 
      ? (JSON.parse(educationsRaw) || []) 
      : (educationsRaw || []);
    const skills = typeof skillsRaw === 'string' ? JSON.parse(skillsRaw) : skillsRaw;

    const employeeId = req.employeeId;

    // Handle file upload
    let finalProfileImageUrl = (() => {
      if (!profileImageUrl) return profileImageUrl;
      if (typeof profileImageUrl === 'string' && profileImageUrl.includes('/api/company/signed-url/')) {
        return profileImageUrl.split('/api/company/signed-url/')[1];
      }
      const maybeKey = extractKeyFromUrl(profileImageUrl);
      return maybeKey || profileImageUrl;
    })();
    
    // Find profile image from global multer files array
    const profileImageFile = req.files && req.files.find(file => file.fieldname === 'profileImage');
    if (profileImageFile) {
      console.log('📤 Uploading updated employee profile image...');
      const profileImageResult = await uploadFile(profileImageFile, 'employee-profiles');
      if (profileImageResult.success) {
        // Store the key (not full URL), same as company route
        finalProfileImageUrl = profileImageResult.key;
        console.log('✅ Employee profile image updated, key stored:', finalProfileImageUrl);
      } else {
        console.error('❌ Employee profile image upload failed:', profileImageResult.error);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload profile image',
          error: profileImageResult.error
        });
      }
    }

    // Get current employee data once (used for synchronization)
    const currentEmployee = await getEmployeeWithDetails(employeeId);

    // Update employee profile (this handles updating existing experiences/educations)
    await updateEmployeeProfile(employeeId, {
      name,
      position,
      experiences: experiences || [],
      surname,
      period,
      yearsOfExperience,
      educations: educations || [],
      skills,
      aboutMe,
      birthDate,
      region,
      comuna,
      country,
      phoneNumber,
      genre,
      civilState,
      available,
      schedule,
      profileImageUrl: finalProfileImageUrl
    });

    // Synchronize experiences: delete removed, create new (updates handled by updateEmployeeProfile)
    await synchronizeExperiences(employeeId, experiences || [], currentEmployee);

    // Synchronize educations: delete removed, create new (updates handled by updateEmployeeProfile)
    await synchronizeEducations(employeeId, educations || [], currentEmployee);

    const thisNewEmployee = await getEmployeeWithDetails(employeeId);
    
    // Convert image keys to actual signed URLs
    const employeeWithSignedUrls = await convertImageUrls(thisNewEmployee, ['profileImageUrl']);

    res.status(200).json({ 
      success: true,
      message: 'Employee profile updated successfully.', 
      data: employeeWithSignedUrls 
    });
  } catch (error) {
    console.error('Error in employee patch route:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error.' 
    });
  }
});

// GET /employees/:employeeId/applications - Get employee applications
router.get('/employees/:employeeId/applications', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await prisma.jobOffer.findMany({
      where: {
        id: parseInt(employeeId),
        deletedAt: null,
      },
      include: {
        experiences: true,
        educations: true,
        applications: {
          where: { deletedAt: null },
        },
      },
    });

    if (employee) {
      res.json({ 
        success: true,
        data: employee 
      });
    } else {
      res.status(404).json({ 
        success: false,
        error: 'Employee not found' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// GET /employees/:employeeId/job-posts/:jobPostId/application - Get specific application
router.get('/employees/:employeeId/job-posts/:jobPostId/application', async (req, res) => {
  try {
    const { employeeId, jobPostId } = req.params;

    const employeeIdInt = parseInt(employeeId, 10);
    const jobPostIdInt = parseInt(jobPostId, 10);

    if (isNaN(employeeIdInt) || isNaN(jobPostIdInt)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid employee or job post ID.' 
      });
    }

    const application = await findApplicationDetails(employeeIdInt, jobPostIdInt);

    if (!application) {
      return res.status(404).json({ 
        success: false,
        message: 'Application not found.' 
      });
    }

    // Convert image URLs to signed URLs
    const applicationWithSignedUrls = { ...application };
    if (application.employee) {
      applicationWithSignedUrls.employee = await convertImageUrls(application.employee, ['profileImageUrl']);
    }
    if (application.jobPost?.restaurant) {
      applicationWithSignedUrls.jobPost.restaurant = await convertImageUrls(
        application.jobPost.restaurant, 
        ['profileImageUrl', 'profileCarouselUrls']
      );
    }

    res.json({ 
      success: true,
      data: applicationWithSignedUrls 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /employees/search - Search employees
router.get('/employees/search', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, async (req, res) => {
  try {

    const { position, experience, region, comuna, available, schedule } = req.query;

    const userId = req.userId;
    const restaurantUserId = req.restaurantUserId;
    console.log('this is the query ', req.query);

    const employees = await searchEmployees({
      position,
      experience,
      region,
      comuna,
      available,
      schedule
    });

    
    // Convert image keys to actual signed URLs for each employee
    const employeesWithSignedUrls = await convertImageUrls(employees, ['profileImageUrl']);
    
    res.status(200).json({ 
      success: true,
      data: employeesWithSignedUrls 
    });
  } catch (error) {
    console.error('Error in employee search:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// POST /employees/favorite-jobs/:jobPostId - Add favorite job
router.post('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    console.log('adding favourite job');
    const { jobPostId } = req.params;
    const employeeId = req.employeeId;

    const jobPost = await getJobOfferById(jobPostId);

    if (!jobPost) {
      return res.status(404).json({ 
        success: false,
        message: 'Job post not found' 
      });
    }

    const employee = await getEmployeeByEmployeeId(employeeId);

    if (!employee) {
      return res.status(404).json({ 
        success: false,
        message: 'Employee not found' 
      });
    }

    const existingFavorite = await checkFavoriteJobExists(employeeId, jobPostId);

    if (existingFavorite) {
      return res.status(400).json({ 
        success: false,
        message: 'Job post is already a favorite' 
      });
    }

    const newFavorite = await createFavoriteJob(employeeId, jobPostId);

    console.log('this is the new favourite', newFavorite);
    res.status(201).json({ 
      success: true,
      message: 'Job post added to favorites', 
      data: newFavorite 
    });
  } catch (error) {
    console.error('Error in saving favorite job post:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// DELETE /employees/favorite-jobs/:jobPostId - Remove favorite job
router.delete('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { jobPostId } = req.params;
    const employeeId = req.employeeId;

    if (!employeeId) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized access.' 
      });
    }

    const favoriteJob = await getFavoriteJobById(employeeId, jobPostId);

    if (!favoriteJob) {
      return res.status(404).json({ 
        success: false,
        error: 'Favorite job not found.' 
      });
    }

    await deleteFavoriteJob(favoriteJob.id);

    console.log('Favourite job deleted', favoriteJob);

    res.status(200).json({ 
      success: true,
      message: 'Favourite Job deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting favorite job:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete favorite job.' 
    });
  }
});

// GET /employees/favorite-jobs - Get all favorite jobs
router.get('/employees/favorite-jobs', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    console.log('fetching the jobs saved as favouritess');
    const employeeId = req.employeeId;

    if (!employeeId) {
      return res.status(404).json({ 
        success: false,
        error: 'Employee not found' 
      });
    }

    const favoriteJobs = await getFavoriteJobs(employeeId);

    // Normalize image URLs for favorites (jobPost/jobOffer -> restaurant images)
    // Convert image keys to actual signed URLs for favorite jobs' restaurants
    const favoriteJobsWithSignedUrls = await Promise.all(
      (favoriteJobs || []).map(async (favoriteJob) => {
        const convertedJob = { ...favoriteJob };
        if (favoriteJob.jobOffer && favoriteJob.jobOffer.restaurant) {
          convertedJob.jobOffer.restaurant = await convertImageUrls(favoriteJob.jobOffer.restaurant, ['profileImageUrl', 'profileCarouselUrls']);
        }
        return convertedJob;
      })
    );

    if (favoriteJobsWithSignedUrls && favoriteJobsWithSignedUrls.length > 0) {
      return res.status(200).json({ 
        success: true,
        data: favoriteJobsWithSignedUrls 
      });
    }

    return res.status(404).json({ 
      success: false,
      message: 'jobs where not found' 
    });
  } catch (error) {
    console.error('Error fetching favorite jobs:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// GET /employees/favorite-jobs/:jobPostId - Check if job is favorite
router.get('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    console.log('Fetching the jobs saved as favorites');
    const employeeId = req.employeeId;
    const jobPostId = parseInt(req.params.jobPostId, 10);

    if (!employeeId) {
      return res.status(404).json({ 
        success: false,
        error: 'Employee not found' 
      });
    }

    const favoriteJob = await checkFavoriteJobExists(employeeId, jobPostId);

    if (favoriteJob) {
      return res.status(200).json({ 
        success: true,
        message: "You have already saved this job", 
        isSaved: true 
      });
    }

    return res.status(404).json({ 
      success: false,
      message: 'Job not found', 
      isSaved: false 
    });
  } catch (error) {
    console.error('Error fetching favorite jobs:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// POST /employee/talent-pool - Add to talent pool
router.post('/employee/talent-pool', getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { restaurantId } = req.body;
    const employeeId = req.employeeId;

    const existingRecord = await checkTalentPoolRecord(employeeId, restaurantId);

    if (existingRecord) {
      return res.status(409).json({ 
        success: false,
        message: 'You have already applied to this company.' 
      });
    }

    const newTalentPoolRecord = await createTalentPoolRecord(employeeId, restaurantId);

    if (!newTalentPoolRecord) {
      return res.status(404).json({ 
        success: false,
        message: 'We were not able to send the cv to this company', 
        data: newTalentPoolRecord 
      });
    }

    res.status(201).json({ 
      success: true,
      message: 'Talent pool record created successfully', 
      data: newTalentPoolRecord 
    });
  } catch (error) {
    console.error('Error creating talent pool record:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /employee/talent-pool/check - Check talent pool status
router.get('/employee/talent-pool/check', getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const employeeId = req.employeeId;

    if (!restaurantId || isNaN(parseInt(restaurantId))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid restaurant ID' 
      });
    }

    const existingRecord = await checkTalentPoolRecord(employeeId, restaurantId);

    if (existingRecord) {
      return res.status(200).json({ 
        success: true,
        isCvSent: true, 
        message: 'Application already exists for this company.' 
      });
    } else {
      return res.status(200).json({ 
        success: true,
        isCvSent: false, 
        message: 'No application found for this company.' 
      });
    }
  } catch (error) {
    console.error('Error checking talent pool record:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

module.exports = router;