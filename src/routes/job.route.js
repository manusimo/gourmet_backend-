import Router from "express";
import { prisma } from "../db.js";
import jwt from 'jsonwebtoken';
import  { checkCompany, checkEmployee }  from '../helpers/authenticateToken.js';
import { getUserIdFromCookie, getRestaurantIdFromCookie, getEmployeeIdFromCookie, getRestaurantUserIdFromCookie, optionalAuth } from '../helpers/cookies.js';
import { buildFilters, buildSearchConditions } from '../helpers/filterHelpers.js';
import { checkJobOfferLimit } from '../middleware/checkPlan.js';
import {
  fetchTopRatedJobs,
  fetchJobsByNameAndLocation,
  softDeleteJobCascade,
  updateJobOffer,
} from '../helpers/jobs.js';

const router = Router();

router.post('/job', checkCompany, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, checkJobOfferLimit(), async (req, res) => {
  try {
    const {
      position,
      locationId,
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

    console.log('this is the locationId', locationId);

    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'locationId is required',
      });
    }

    const tips = propina === 'Si';

    const jobOffer = await prisma.jobOffer.create({
      data: {
        position,
        location: { connect: { id: locationId } },
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

    const jobOfferCheck = await prisma.jobOffer.findUnique({
      where: { id: jobOffer.id },
      include: { location: true },
    });

    console.log('this is the job offer', jobOfferCheck)

    // Calcular ofertas restantes
    const remainingJobOffers = req.remainingJobOffers - 1;
    const planNames = {
      'starter': 'STARTER',
      'pro': 'PRO',
      'plus': 'PLUS',
      'premium': 'PREMIUM'
    };

    res.status(201).json({
      message: 'Job offer created successfully',
      jobOffer,
      planInfo: {
        currentPlan: planNames[req.user.payment_status] || 'STARTER',
        remainingJobOffers,
        totalLimit: req.jobOfferLimit,
        upgradeMessage: remainingJobOffers === 0 ?
          `Has usado todas tus ofertas de trabajo. Actualiza a ${req.user.payment_status === 'starter' ? 'PRO' : req.user.payment_status === 'pro' ? 'PLUS' : 'PREMIUM'} para más.` :
          `Te quedan ${remainingJobOffers} ofertas de trabajo de tu plan ${planNames[req.user.payment_status]}.`
      }
    });
  } catch (error) {
    console.error('Error creating job offer:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/jobs/recommended-jobs', optionalAuth, async (req, res) => {
  const { jobName, location, limit = 4 } = req.query;
  const userId = req.userId;
  const userType = req.userType;
  const finishedDateParsed = new Date(new Date().setDate(new Date().getDate() - 30));

  try {
    let formattedJobs;

    formattedJobs = await fetchJobsByNameAndLocation(jobName, location, null, finishedDateParsed);

    res.status(200).json({
      jobs: formattedJobs,
    });
  } catch (error) {
    console.error('Error fetching recommended jobs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/jobs/top-rated-jobs-carousel', optionalAuth, async (req, res) => {
  const { limit = 4 } = req.query;
  const userId = req.userId;
  const userType = req.userType;
  const finishedDateParsed = new Date(new Date().setDate(new Date().getDate() - 30));

  try {
    let formattedJobs;

    formattedJobs = await fetchTopRatedJobs(limit, finishedDateParsed);

    res.json({
      jobs: formattedJobs,
    });
  } catch (error) {
    console.error('Error fetching top-rated jobs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.patch('/job/:id', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const updated = await updateJobOffer(jobId, req.restaurantId, req.body);
    res
      .status(200)
      .json({
        message: 'Job offer updated successfully',
        updatedJobOffer: updated,
      });
  } catch (error) {
    console.error('[PATCH /job/:id]', error);
    res.status(400).json({ message: error.message });
  }
});


router.get('/jobs/applied', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  const employeeId = req.employeeId;

  try {
    const employeeExists = await prisma.employee.findUnique({
      where: { id: employeeId },
    });
    console.log('herok')
    if (!employeeExists) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const applications = await prisma.application.findMany({
      where: {
        employeeId: employeeId,
        jobPost: { deletedAt: null},
      },
      include: {
        jobPost: {
          include: {
            restaurant: true,
            location: true,
            questions: true,
          },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    res.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/jobs', async (req, res) => {
  const {
    locationId,
    schedule,
    period,
    format,
    contract,
    region,
    comuna,
    q,
    page,
    limit = 10,
    orderBy,
    finishedDate,
  } = req.query;

  const finishedDateParsed = finishedDate
    ? new Date(finishedDate)
    : new Date(new Date().setDate(new Date().getDate() - 30));

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const limitNumber = Math.max(parseInt(limit, 10), 1);
  const skip = (pageNumber - 1) * limitNumber;

  const restaurantFilterFields = [
    'specialty',
    'format',
    'benefits',
    'region',
    'comuna',
  ];
  const restaurantFilter = buildFilters(req.query, restaurantFilterFields);
  const searchConditions = buildSearchConditions(q, 'position');

  let orderByCriteria = { createdAt: 'desc' };

  if (orderBy === 'applications') {
    orderByCriteria = {
      applications: {
        _count: 'desc',
      },
    };
  }

  if (orderBy === 'date') {
    orderByCriteria = {
      createdAt: 'desc',
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
          locationId: locationId ? parseInt(locationId, 10) : undefined,
          schedule: schedule || undefined,
          period: period || undefined,
          contract: contract || undefined,
          createdAt: { gt: finishedDateParsed },
          deletedAt: null,
        },
        include: {
          restaurant: true,
          location: true,
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
          locationId: locationId ? parseInt(locationId, 10) : undefined,
          schedule: schedule || undefined,
          period: period || undefined,
          contract: contract || undefined,
          createdAt: { gt: finishedDateParsed },
          deletedAt: null,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalJobs / limitNumber);

    res.status(200).json({
      jobs,
      totalPages,
      totalJobs,
      currentPage: pageNumber,
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
        deletedAt: null,
      },
      include: {
        restaurant: true,
        questions: true,
        location: true,
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
    const jobOffer = await prisma.jobOffer.findFirst({
      where: {
        id: parseInt(jobId),
        deletedAt: null,
      },
      include: {
        questions: true,
        restaurant: true,
        applications: true,
        location: true,
      },
    });

    console.log('this is the job offer', jobOffer)

    if (jobOffer) {
      res.json({
        ...jobOffer,
        applicationsCount: jobOffer.applications.length,
        createdAt: jobOffer.createdAt.toISOString().slice(0, 10),
      });
    } else {
      res.status(404).send('Job offer not found');
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.delete('/job/:id', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const restaurantId = req.restaurantId;

    const deletedJob = await softDeleteJobCascade(jobId, restaurantId);

    res.status(200).json({
      message: 'Job offer soft deleted successfully',
      jobOffer: deletedJob,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
});

// Ruta para obtener información del plan y job offers de la empresa
router.get('/my-plan-info', checkCompany, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const restaurantUserId = req.restaurantUserId;

    if (!restaurantUserId) {
      return res.status(401).json({ message: 'No autenticado como usuario de restaurante' });
    }

    // Buscar el usuario de restaurante y su usuario asociado
    const restaurantUser = await prisma.restaurantUser.findUnique({
      where: { id: restaurantUserId },
      include: {
        user: true,
        jobOffers: {
          where: { deletedAt: null },
          include: {
            applications: {
              where: { deletedAt: null }
            },
            location: true
          }
        }
      }
    });

    if (!restaurantUser || !restaurantUser.user) {
      return res.status(401).json({ message: 'Usuario de restaurante no encontrado' });
    }

    const user = restaurantUser.user;
    const currentJobOffers = restaurantUser.jobOffers.length;

    // Definir límites según el plan
    const planLimits = {
      'starter': 1,
      'pro': 5,
      'plus': 10,
      'premium': Infinity
    };

    const limit = planLimits[user.payment_status] || 1;
    const remainingJobOffers = limit - currentJobOffers;

    const planNames = {
      'starter': 'STARTER',
      'pro': 'PRO',
      'plus': 'PLUS',
      'premium': 'PREMIUM'
    };

    // Verificar vigencia del pago
    let paymentStatus = 'active';
    let daysUntilExpiration = null;

    if (user.payment_status !== 'starter' && user.last_payment) {
      const lastPayment = new Date(user.last_payment);
      const now = new Date();
      const thirtyDaysFromPayment = new Date(lastPayment.getTime() + (30 * 24 * 60 * 60 * 1000));
      
      if (now > thirtyDaysFromPayment) {
        paymentStatus = 'expired';
      } else {
        daysUntilExpiration = Math.ceil((thirtyDaysFromPayment - now) / (24 * 60 * 60 * 1000));
      }
    }

    // Calcular estadísticas
    const totalApplications = restaurantUser.jobOffers.reduce((total, jobOffer) => {
      return total + jobOffer.applications.length;
    }, 0);

    // Obtener información de ubicaciones
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantUser.restaurantId },
      include: {
        locations: true
      }
    });

    const currentLocations = restaurant ? restaurant.locations.length : 0;

    // Definir límites de ubicaciones según el plan
    const locationLimits = {
      'starter': 1,
      'pro': 5,
      'plus': 10,
      'premium': Infinity
    };

    const locationLimit = locationLimits[user.payment_status] || 1;
    const remainingLocations = locationLimit - currentLocations;

    res.status(200).json({
      planInfo: {
        currentPlan: planNames[user.payment_status] || 'STARTER',
        paymentStatus,
        daysUntilExpiration,
        lastPayment: user.last_payment,
        currentJobOffers,
        remainingJobOffers,
        totalLimit: limit,
        totalApplications,
        currentLocations,
        remainingLocations,
        locationLimit,
        jobOffers: restaurantUser.jobOffers.map(jobOffer => ({
          id: jobOffer.id,
          position: jobOffer.position,
          applicationsCount: jobOffer.applications.length,
          createdAt: jobOffer.createdAt,
          location: jobOffer.location
        }))
      }
    });

  } catch (error) {
    console.error('Error getting plan info:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
