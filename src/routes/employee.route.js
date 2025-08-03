import Router from "express";
import { checkEmployee, checkCompany } from "../helpers/authenticateToken.js";
import { getEmployeeIdFromCookie, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, getUserIdFromCookie } from "../helpers/cookies.js";
import { requirePlan } from "../middleware/checkPlan.js";
import { findApplicationDetails } from '../helpers/employee/findApplication.js';
import {
  getEmployeeById,
  getEmployeeByUserId,
  createEmployeeProfile,
  generateEmployeeToken,
  getEmployeeProfile,
  updateEmployeeProfile,
  createExperience,
  createEducation,
  getEmployeeWithDetails,
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
} from '../helpers/employeeHelpers.js';

const router = Router();

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

    res.status(200).json({ 
      success: true,
      data: employeeProfile 
    });
  } catch (error) {
    console.error('Error fetching employee profile:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// POST /employee - Create employee profile
router.post('/employee', checkEmployee, getUserIdFromCookie, async (req, res) => {
  try {
    const {
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
      profileImageUrl
    } = req.body;

    const userId = req.userId;

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
      profileImageUrl,
      userId
    });

    const newToken = generateEmployeeToken({
      userId: req.userId,
      employeeId: employeeProfile.id,
    });

    res.cookie('manu', newToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
    });

    res.status(201).json({ 
      success: true,
      message: 'Employee created successfully', 
      data: employeeProfile 
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

    res.status(200).json({ 
      success: true,
      data: employeeProfile 
    });
  } catch (error) {
    console.error('Error fetching employee profile:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error' 
    });
  }
});

// PATCH /employee - Update employee profile
router.patch('/employee', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const {
      name,
      position,
      experiences,
      surname,
      period,
      yearsOfExperience,
      educations,
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
      profileImageUrl
    } = req.body;

    const employeeId = req.employeeId;

    const updatedEmployee = await updateEmployeeProfile(employeeId, {
      name,
      position,
      experiences,
      surname,
      period,
      yearsOfExperience,
      educations,
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
      profileImageUrl
    });

    // Create new experiences
    const newExperiences = experiences.filter(experience => !experience.id);
    for (const experience of newExperiences) {
      await createExperience({
        ...experience,
        employeeId
      });
    }

    // Create new educations
    const newEducations = educations.filter(education => !education.id);
    for (const education of newEducations) {
      await createEducation({
        ...education,
        employeeId
      });
    }

    const thisNewEmployee = await getEmployeeWithDetails(employeeId);

    res.status(200).json({ 
      success: true,
      message: 'Employee profile updated successfully.', 
      data: thisNewEmployee 
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

    res.json({ 
      success: true,
      data: application 
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
router.get('/employees/search', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, requirePlan(['plus', 'premium']), async (req, res) => {
  try {
    console.log('Here we start the search');
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

    console.log('These are the results', employees);
    res.status(200).json({ 
      success: true,
      data: employees 
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

    if (favoriteJobs) {
      return res.status(200).json({ 
        success: true,
        data: favoriteJobs 
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

export default router;
