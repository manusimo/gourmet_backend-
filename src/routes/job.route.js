import Router from "express";
import { prisma } from "../db.js";
import jwt from 'jsonwebtoken';
import  { checkCompany, checkEmployee }  from '../helpers/authenticateToken.js';
import { getUserIdFromCookie, getRestaurantIdFromCookie, getEmployeeIdFromCookie, getRestaurantUserIdFromCookie, optionalAuth } from '../helpers/cookies.js';
import { buildFilters, buildSearchConditions } from '../helpers/filterHelpers.js';
import { fetchTopRatedJobs, fetchJobsByNameAndLocation  } from "../helpers/jobs.js";

const router = Router();

router.post('/job', checkCompany, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const {
      position,
      location,
      schedule,
      contract,
      vacancies,
      yearsOfExperience,
      description,
      questions,
      requirements,
      salary,
      propina, 
      functions,
    } = req.body;
    
    const restaurantId = req.restaurantId; 
    const restaurantUserId = req.restaurantUserId; 

    console.log('this is the lcoation', location)

    const tips = propina === 'Si' ? true : false;

    const jobOffer = await prisma.jobOffer.create({
      data: {
        position,
        location,
        schedule,
        contract,
        vacancies: parseInt(vacancies, 10),
        yearsOfExperience: isNaN(parseInt(yearsOfExperience, 10)) ? null : parseInt(yearsOfExperience, 10),
        description,
        restaurant: { connect: { id: restaurantId } }, 
        requirements,
        functions,
        tips,
        salary: parseInt(salary, 10),
        questions: { create: questions },
        restaurantUser: { connect: { id: restaurantUserId } }, 
      },
    });

    res.status(201).json({ message: 'Job offer created successfully', jobOffer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/jobs/recommended-jobs', optionalAuth, async (req, res) => {
  const { jobName, location, limit = 4 } = req.query; 
  const userId = req.userId; 
  const userType = req.userType;

  try {
    let formattedJobs;

    formattedJobs = await fetchJobsByNameAndLocation(jobName, location);
    
   
    res.status(200).json({
      jobs: formattedJobs,
    });
  } catch (error) {
    console.error('Error fetching recommended jobs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/jobs/top-rated-jobs-carousel', optionalAuth, async (req, res) => {
  console.log('Getting top-rated jobs for carousel');

  const { limit = 4 } = req.query;
  const userId = req.userId; // The user ID extracted from the cookie
  const userType = req.userType; // The user type extracted from the cookie

  try {
    let formattedJobs;

   
    formattedJobs = await fetchTopRatedJobs(limit);
  

    res.json({
      jobs: formattedJobs,
    });
  } catch (error) {
    console.error('Error fetching top-rated jobs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// router.patch('/job/:id', checkCompany, getRestaurantIdFromCookie,  async (req, res) => {
    
//   try {
//     const jobId = parseInt(req.params.id, 10);
  
//     const {
//       position,
//       location,
//       schedule,
//       contract,
//       period,
//       vacancies,
//       yearsOfExperience,
//       description,
//       questions,
//       requirements,
//       salary,
//       propina, 
//       functions,
//     } = req.body;
//     const restaurantId = req.restaurantId; 

//     const tips = propina === 'Si' ? true : false;

//     const updatedJobOffer = await prisma.jobOffer.update({
//       where: { id: jobId },
//       data: {
//         position,
//         location,
//         schedule,
//         period,
//         contract,
//         vacancies: parseInt(vacancies, 10),
//         yearsOfExperience: isNaN(parseInt(yearsOfExperience, 10)) ? null : parseInt(yearsOfExperience, 10),
//         description,
//         restaurantId,
//         requirements,
//         functions,
//         tips,
//         salary: parseInt(salary, 10),
//         questions: { set: questions } 
//       },
//     });

    

//     res.status(200).json({ message: 'Job offer updated successfully', updatedJobOffer });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// });


router.patch('/job/:id', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const {
      position,
      location,
      schedule,
      contract,
      period,
      vacancies,
      yearsOfExperience,
      description,
      questions, // Array of questions with `id` (existing) or `question` (new)
      requirements,
      salary,
      propina,
      functions,
    } = req.body;

    console.log('this questions', questions);

    const restaurantId = req.restaurantId;
    const tips = propina === 'Si';

    // Separate questions into categories
    const newQuestions = questions.filter((q) => !q.id); // New questions without `id`
    const existingQuestions = questions.filter((q) => q.id); // Existing questions with `id`

    // Step 1: Update existing questions
    for (const q of existingQuestions) {
      await prisma.question.update({
        where: { id: q.id },
        data: { question: q.question },
      });
    }

    // Step 2: Update the job offer and create new questions
    const updatedJobOffer = await prisma.jobOffer.update({
      where: { id: jobId },
      data: {
        position,
        location,
        schedule,
        period,
        contract,
        vacancies: parseInt(vacancies, 10),
        yearsOfExperience: isNaN(parseInt(yearsOfExperience, 10)) ? null : parseInt(yearsOfExperience, 10),
        description,
        restaurantId,
        requirements,
        functions,
        tips,
        salary: parseInt(salary, 10),
        questions: {
          create: newQuestions.map((q) => ({ question: q.question })), // Add new questions
        },
      },
      include: {
        questions: true, // Include the related questions in the response
      },
    });

    console.log('upd offer', updatedJobOffer);
    res.status(200).json({ message: 'Job offer updated successfully', updatedJobOffer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});



router.get('/jobs/applied', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {

  const employeeId = req.employeeId;

  try {
    const employeeExists = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employeeExists) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const applications = await prisma.application.findMany({
      where: {
        employeeId: employeeId,
      },
      include: {
        jobPost: {
          include: {
            restaurant: true,
          },
        },
      },
    });

    res.json(applications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/jobs', async (req, res) => {

  const {        
    location,           
    schedule,         
    period,   
    format,          
    contract, 
    region,
    comuna,          
    q,                  
    page,          
    limit = 10, 
    orderBy         
  } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1); 
  const limitNumber = Math.max(parseInt(limit, 10), 1); 
  const skip = (pageNumber - 1) * limitNumber; 

  const restaurantFilterFields = ['specialty', 'format', 'benefits', 'region', 'comuna']; 

  const restaurantFilter = buildFilters(req.query, restaurantFilterFields);
  const searchConditions = buildSearchConditions(q, 'position');

  let orderByCriteria = {};
  if (orderBy === 'applications') {
    orderByCriteria = {
      applications: {
        _count: 'desc' 
      }
    };
  } 
  
  if (orderBy === 'date') {
    orderByCriteria = {
      createdAt: 'desc' 
    };
  }
 
  try {
    const [jobs, totalJobs] = await Promise.all([
      prisma.jobOffer.findMany({
        where: {
          restaurant: {
            ...restaurantFilter,
          },
          ...searchConditions,
          location: location || undefined, 
          schedule: schedule || undefined,
          period: period || undefined,
          contract: contract || undefined,
        },
        include: {
          restaurant: true,
          questions: true,
        },
        orderBy: orderByCriteria,
        skip, 
        take: limitNumber, 
      }),
      prisma.jobOffer.count({
        where: {
          ...searchConditions,
          restaurant: {
            ...restaurantFilter,
          },
          location: location || undefined,
          schedule: schedule || undefined,
          period: period || undefined,
          contract: contract || undefined,
        },
      }),
    ]);
     
    const totalPages = Math.ceil(totalJobs / limitNumber);

    res.status(200).json({
      jobs,
      totalPages, 
      totalJobs, 
      currentPage: pageNumber
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});

router.get('/jobs/restaurant', checkCompany, getRestaurantIdFromCookie, async (req, res) => { 
  try {
    const restaurantId = req.restaurantId;
    const jobOffers = await prisma.jobOffer.findMany({
      where: {
        restaurantId: restaurantId,
      },
      include: {
        restaurant: true, 
        questions: true,
      },
      orderBy: {
        createdAt: 'desc', 
      },
    });
    res.status(200).json(jobOffers); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const jobOffer = await prisma.jobOffer.findUnique({
      where: {
        id: parseInt(jobId),
      },
      include: {
        questions: true, 
        restaurant: true, 
      },
    });

    if (jobOffer) {
      res.json(jobOffer);
    } else {
      res.status(404).send('Job offer not found');
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router
