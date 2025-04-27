import { Router } from "express";
import { prisma } from "../db.js";
import jwt from 'jsonwebtoken';
import { getEmployeeIdFromCookie, getRestaurantIdFromCookie } from "../helpers/cookies.js";
import { checkEmployee, checkCompany } from "../helpers/authenticateToken.js";

const router = Router();

router.post('/application', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { jobPostId, answers } = req.body;
    const employeeId = req.employeeId;

    if (!employeeId) {
      return res.status(401).json({ message: 'Debes hacer log in para postular' });
    }

    const jobPost = await prisma.jobOffer.findFirst({
      where: { id: jobPostId, deletedAt: null },
    });

    if (!jobPost) {
      return res.status(404).json({ message: 'Job post not found.' });
    }

    const existingApplication = await prisma.application.findFirst({
      where: {
        jobPostId: jobPostId,
        employeeId: employeeId,
        deletedAt: null,
      },
    });

    if (existingApplication) {
      return res.status(409).json({ message: 'Ya postulaste a este trabajo.' });
    }

    const application = await prisma.application.create({
      data: {
        jobPost: {
          connect: { id: jobPostId },
        },
        employee: {
          connect: { id: employeeId },
        },
        answers: {
          create: answers.map(({ questionId, answer }) => ({
            question: { connect: { id: parseInt(questionId) } },
            answer: answer.toString(),
          })),
        },
      },
      include: {
        answers: true,
      },
    });

    res.status(201).json({ message: 'Postulaste exitosamente.', application });
  } catch (error) {
    console.error('Error creating application:', error);

    if (error.code === 'P2025') {
      return res.status(400).json({ message: 'Este trabajo ya no está disponible.' });
    }

    res.status(500).json({ message: 'Hemos tenido un error, intenta más tarde.' });
  }
});


router.get('/applications/:applicationId', async (req, res) => {
  const { applicationId } = req.params;

  try {
      const application = await prisma.application.findFirst({
          where: {
              id: parseInt(applicationId),
              deletedAt: null,
          },
          include: {
              jobPost: {
                  include: {
                      questions: {
                          include: {
                              answers: {
                                  where: {
                                      applicationId: parseInt(applicationId),
                                  },
                              },
                          },
                      },
                  },
              },
          },
      });

      if (!application) {
          return res.status(404).send('Application not found');
      }

      res.status(200).json(application);
  } catch (error) {
      console.error('🚨 Error in GET /applications/:applicationId:', {
          error: error.message,
          stack: error.stack
      });
      res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/job-offers/:jobOfferId/applicants', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  const { jobOfferId } = req.params;
  const { restaurantId } = req;

  try {
    const jobOffer = await prisma.jobOffer.findFirst({
      where: {
        id: parseInt(jobOfferId),
        restaurantId: parseInt(restaurantId),
        deletedAt: null,
      },
    });

    if (!jobOffer) {
      return res.status(404).json({ message: 'Job offer not found or you do not have permission to view the applicants.' });
    }

    const applications = await prisma.application.findMany({
      where: {
        jobPostId: parseInt(jobOfferId),
        deletedAt: null,
      },
      include: {
        employee: {
          include: {
            user: true,
          },
        },
        jobPost: true, // Include job post details if needed
      },
    });

    res.json(applications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export default router
