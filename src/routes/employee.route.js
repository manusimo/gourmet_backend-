import Router from "express";
import { prisma } from "../db.js";
import  { checkEmployee, checkCompany }  from '../helpers/authenticateToken.js';
import { getUserIdFromCookie, getEmployeeIdFromCookie, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie } from '../helpers/cookies.js';
import jwt from 'jsonwebtoken';

const router = Router();


router.get('/employee/:id', async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);

  if (isNaN(employeeId)) {
    return res.status(400).json({ error: 'Invalid employee ID' });
  }

  try {
    const employeeProfile = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        experiences: true,
        educations: true,
        user: true,
      },
    });
    
    if (!employeeProfile) {
      return res.status(404).json({ error: 'Employee profile not found' });
    } else {
      res.status(200).json({ profile: employeeProfile });
    }

    
  } catch (error) {
    console.error('Error fetching employee profile:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/employee', checkEmployee, getUserIdFromCookie, async (req, res) => {
  try {
    const {
      name,
      position,
      experiences,
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
      location,
      available,
      schedule,
      profileImageUrl
    } = req.body;

    const userId = req.userId; 

    const skillsArray = Object.keys(skills).filter(skill => skills[skill]);

    const existingEmployee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (existingEmployee) {
      return res.status(400).json({ message: 'Employee profile already exists' });
    }

    const employeeProfile = await prisma.employee.create({
      data: {
        name,
        country,
        location,
        birthDate,
        phoneNumber,
        position,
        aboutMe,
        region,
        comuna,
        schedule,
        available,
        experiences: { create: experiences },
        educations: { create: educations },
        skills: skillsArray,
        userId,
        profileImageUrl
      },
    });

    const newToken = jwt.sign(
      {
        userId: req.userId, 
        userType: 'profesionales', 
        employeeId: employeeProfile.id,
      },
      process.env.JWT_SECRET
    );

    res.cookie('manu', newToken, { httpOnly: true });

    res.status(201).json({ message: 'Employee created successfully', employeeProfile });
  } catch (error) {
    console.error('Error in employee route:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/employee', getEmployeeIdFromCookie, async (req, res) => {
  console.log('Fetching the employee profile');
  try {
    const employeeId = req.employeeId;

    const employeeProfile = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        experiences: true,
        educations: true,
        user:true,
      },
    });

    if (!employeeProfile) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }

    res.status(200).json({ profile: employeeProfile });
  } catch (error) {
    console.error('Error fetching employee profile:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.patch('/employee', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const {
      name,
      position,
      experiences,
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
      location,
      available,
      schedule,
      profileImageUrl
    } = req.body;


    const employeeId = req.employeeId;

    const newExperiences = experiences.filter(experience => !experience.id);
    const existingExperiences = experiences.filter(experience => experience.id);
       
    const newEducations = educations.filter(education => !education.id);
    const existingEducations = educations.filter(education => education.id);

    const updatedEmployee = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        name,
        country,
        location,
        birthDate: new Date(birthDate), 
        phoneNumber,
        position,
        aboutMe,
        period,
        yearsOfExperience,
        region,
        comuna,
        schedule,
        available,
        genre,
        civilState,
        profileImageUrl,
        experiences: {
          updateMany: existingExperiences.map(exp => ({
            where: { id: exp.id },
            data: {
              companyName: exp.companyName,
              description: exp.description,
              startDate: new Date(exp.startDate), 
              endDate: new Date(exp.endDate), 
              role: exp.role,
            },
          })),
        },
        educations: {
          updateMany: existingEducations.map(edu => ({
            where: { id: edu.id },
            data: {
              institution: edu.institution,
              startDate: new Date(edu.startDate), // Parse date
              study: edu.study,
              endDate: new Date(edu.endDate), // Parse date
              description: edu.description,
            },
          })),
        },
        skills: Object.keys(skills).filter(skill => skills[skill]),
      },
    });

    for (const experience of newExperiences) {
      const createExperience = await prisma.experience.create({
        data: {
          companyName: experience.companyName,
          description: experience.description,
          startDate: new Date(experience.startDate), 
          endDate: new Date(experience.endDate),
          role: experience.role,
          employeeId,
        },
      });
      console.log('Creating new experience:', createExperience);
    }

    // Create new educations
    for (const education of newEducations) {
      const createEducation = await prisma.education.create({
        data: {
          study: education.study,
          institution: education.institution,
          startDate: new Date(education.startDate), // Parse date
          endDate: new Date(education.endDate), // Parse date
          description: education.description,
          employeeId,
        },
      });
      console.log('Creating new education:', createEducation);
    }

    const thisNewEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        experiences: true,
        educations: true,
      },
    });


    res.status(200).json({ message: 'Employee profile updated successfully.', updatedEmployee: thisNewEmployee });
  } catch (error) {
    console.error('Error in employee patch route:', error);
    res.status(500).json({ message: 'Internal Server Error.' });
  }
});

router.get('/employees/:employeeId/applications', async (req, res) => {
  const { employeeId } = req.params;
  try {
    const employee = await prisma.jobOffer.findMany({
      where: {
        id: parseInt(employeeId),
      },
      include: {
        experiences: true,
        educations: true,
        applications: true,
      },
    });

    if (employee) {
      res.json(employee);
    } else {
      res.status(404).send('Employee not found');
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function findApplicationDetails(employeeIdInt, jobPostIdInt) {
  return await prisma.application.findFirst({
    where: {
      employeeId: employeeIdInt,
      jobPostId: jobPostIdInt,
    },
    include: {
      jobPost: {
        include: {
          restaurant: true,
        },
      },
      employee: true,
    },
  });
}

router.get('/employees/:employeeId/job-posts/:jobPostId/application', async (req, res) => {
  const { employeeId, jobPostId } = req.params;

  try {
    const employeeIdInt = parseInt(employeeId, 10);
    const jobPostIdInt = parseInt(jobPostId, 10);

    if (isNaN(employeeIdInt) || isNaN(jobPostIdInt)) {
      return res.status(400).json({ message: 'Invalid employee or job post ID.' });
    }

    const application = await findApplicationDetails(employeeIdInt, jobPostIdInt);

    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    res.json(application);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/employees/search', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('Here we start the search');
    const { position, experience, location, available, schedule } = req.query;

    const userId = req.userId; 
    const restaurantUserId = req.restaurantUserId; 
    console.log('this is the query ', req.query)

    const employees = await prisma.employee.findMany({
      where: {
        position: {
          contains: position,
          mode: 'insensitive',
        },
        location: {
          contains: location,
          mode: 'insensitive',
        },
        available: {
          contains: available,
          mode: 'insensitive',
        },
        schedule: {
          contains: schedule,
          mode: 'insensitive',
        },
      },
      include: {
        user: true,
        experiences: true,
        educations: true,
      },
    });

    console.log('These are the results', employees);
    res.status(200).json({ employees });
  } catch (error) {
    console.error('Error in employee search:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  console.log('adding favourite job')
  try {
    const { jobPostId } = req.params;
    const employeeId = req.employeeId;

    const jobPost = await prisma.jobOffer.findUnique({
      where: { id: parseInt(jobPostId) },
    });

    if (!jobPost) {
      return res.status(404).json({ message: 'Job post not found' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const existingFavorite = await prisma.favouriteJob.findFirst({
      where: {
        employeeId: employeeId,
        jobOfferId: parseInt(jobPostId),
      },
    });

    if (existingFavorite) {
      return res.status(400).json({ message: 'Job post is already a favorite' });
    }

    // Create the favorite job entry
    const newFavorite = await prisma.favouriteJob.create({
      data: {
        employeeId: employeeId,
        jobOfferId: parseInt(jobPostId),
      },
    });
    
    console.log('this is the new favourite', newFavorite)
    res.status(201).json({ message: 'Job post added to favorites', favoriteJob: newFavorite });
  } catch (error) {
    console.error('Error in saving favorite job post:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.delete('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  const { jobPostId } = req.params;
  const employeeId = req.employeeId;

  if (!employeeId) {
    return res.status(403).json({ error: 'Unauthorized access.' });
  }

  try {
    const favoriteJob = await prisma.favouriteJob.findFirst({
      where: {
        jobOfferId: parseInt(jobPostId),
        employeeId: employeeId,
      },
    });

    if (!favoriteJob) {
      return res.status(404).json({ error: 'Favorite job not found.' });
    }

    await prisma.favouriteJob.delete({
      where: { id: favoriteJob.id },
    });

    console.log('Favourite job deleted', favoriteJob);

    res.status(200).json({ message: 'Favourite Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting favorite job:', error);
    res.status(500).json({ error: 'Failed to delete favorite job.' });
  }
});


router.get('/employees/favorite-jobs', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    console.log('fetching the jobs saved as favouritess')
    const employeeId = req.employeeId;
    
    if(!employeeId) {
      res.status(404).send('Emloyee not found');
    }

    const favoriteJobs = await prisma.favouriteJob.findMany({
      where: {
        employeeId: employeeId,
      },
      include: {
        jobOffer: {
          include: {
            restaurant: true,  // Ensure restaurant data is included
          },
        },
      },
    });

    if (favoriteJobs) {
      return res.status(200).json({ jobs: favoriteJobs });
    }

    return res.status(404).json({ message: 'jobs where not found' });
  } catch (error) {
    console.error('Error fetching favorite jobs:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/employees/favorite-jobs/:jobPostId', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    console.log('Fetching the jobs saved as favorites');
    const employeeId = req.employeeId;
    const jobPostId = parseInt(req.params.jobPostId, 10);

    if (!employeeId) {
      return res.status(404).send('Employee not found');
    }

    const favoriteJob = await prisma.favouriteJob.findFirst({
      where: {
        employeeId: employeeId,
        jobOfferId: jobPostId,
      },
    });

    if (favoriteJob) {
      return res.status(200).json({ message: "You have already saved this job", isSaved: true });
    }

    return res.status(404).json({ message: 'Job not found', isSaved: false });
  } catch (error) {
    console.error('Error fetching favorite jobs:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/employee/talent-pool', getEmployeeIdFromCookie, async (req, res) => {
  const { restaurantId } = req.body;
  const employeeId = req.employeeId;
  
  try {
    const existingRecord = await prisma.talentPool.findFirst({
      where: {
        employeeId: parseInt(employeeId),
        restaurantId: parseInt(restaurantId),
      },
    });

    if (existingRecord) {
      return res.status(409).json({ message: 'You have already applied to this company.' });
    }
    
    const newTalentPoolRecord = await prisma.talentPool.create({
      data: {
        employeeId: parseInt(employeeId),
        restaurantId:parseInt(restaurantId),
        status: 'pendent',
      },
    });
    
    if(!newTalentPoolRecord) {
      res.status(404).json({ message: 'We were not able to send the cv to this company', newTalentPoolRecord });
    }

    res.status(201).json({ message: 'Talent pool record created successfully', newTalentPoolRecord });
  } catch (error) {
    console.error('Error creating talent pool record:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/employee/talent-pool/check', getEmployeeIdFromCookie, async (req, res) => {
  const { restaurantId } = req.query;
  const employeeId = req.employeeId;

  try {
    if (!restaurantId || isNaN(parseInt(restaurantId))) {
      return res.status(400).json({ message: 'Invalid restaurant ID' });
    }

    const existingRecord = await prisma.talentPool.findFirst({
      where: {
        employeeId: parseInt(employeeId),
        restaurantId: parseInt(restaurantId),
      },
    });

    if (existingRecord) {
      return res.status(200).json({ isCvSent: true, message: 'Application already exists for this company.' });
    } else {
      return res.status(200).json({ isCvSent: false, message: 'No application found for this company.' });
    }
  } catch (error) {
    console.error('Error checking talent pool record:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});



export default router

