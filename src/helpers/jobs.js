import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const fetchTopRatedJobs = async (limit) => {
  try {
    const jobs = await prisma.jobOffer.findMany({
      where: { deletedAt: null },
      orderBy: {
        applications: {
          _count: 'desc',
        },
      },
      include: {
        applications: {
          select: {
            id: true,
          },
        },
        restaurant: true,
        location: true,
      },
      take: parseInt(limit, 10),
    });

    return jobs.map((job) => ({
      ...job,
      applicationsCount: job.applications.length,
    }));
  } catch (error) {
    console.error('Error fetching top-rated jobs:', error);
    throw new Error('Could not fetch top-rated jobs');
  }
};

// Fetch jobs by name and location, with optional user filtering
const fetchJobsByNameAndLocation = async (jobName, location, user = null) => {
  try {
    const jobs = await prisma.jobOffer.findMany({
      where: {
        deletedAt: null,
        ...(jobName && {
          name: {
            contains: jobName,
            mode: 'insensitive',
          },
        }),
        ...(location && {
          restaurant: {
            location: {
              contains: location,
              mode: 'insensitive',
            },
          },
        }),
        ...(user && {
          applications: {
            some: {
              userId: user.id,
            },
          },
        }),
      },
      include: {
        restaurant: true,
        applications: {
          select: {
            id: true,
          },
        },
        location: true,
      },
    });

    return jobs.map((job) => ({
      ...job,
      applicationsCount: job.applications.length,
    }));
  } catch (error) {
    console.error('Error fetching jobs by name and location:', error);
    throw new Error('Could not fetch jobs by name and location');
  }
};

const softDeleteJobCascade = async (jobId, restaurantId) => {
  try {
    const existingJob = await prisma.jobOffer.findFirst({
      where: {
        id: jobId,
        restaurantId,
        deletedAt: null,
      },
    });

    if (!existingJob) {
      throw new Error('Job offer not found or already deleted');
    }

    const [updatedJob] = await prisma.$transaction([
      prisma.jobOffer.update({
        where: { id: jobId },
        data: {
          deletedAt: new Date(),
        },
      }),
      prisma.conversation.updateMany({
        where: {
          jobOfferId: jobId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      }),
      prisma.application.updateMany({
        where: {
          jobPostId: jobId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      }),
    ]);

    return updatedJob;
  } catch (error) {
    console.error('[softDeleteJobCascade] Error:', error);
    throw new Error('Could not perform soft-delete cascade operation');
  }
};

/* ---------- helpers ---------- */
const toInt = (v) => (v === undefined ? undefined : parseInt(v, 10));
const toNullableInt = (v) => (isNaN(toInt(v)) ? null : toInt(v));

const ensureActiveJob = async (jobId, restaurantId) => {
  return prisma.jobOffer.findFirst({
    where: { id: jobId, restaurantId, deletedAt: null },
  });
};


/* ---------- updated updateJobOffer ---------- */
const updateJobOffer = async (jobId, restaurantId, body) => {
  const {
    position,
    locationId,
    schedule,
    contract,
    period,
    vacancies,
    yearsOfExperience,
    description,
    questions = [],
    requirements,
    salary,
    propina,
    functions,
  } = body;

  const existingJob = await ensureActiveJob(jobId, restaurantId);
  if (!existingJob) throw new Error('Job offer not found or has been deleted');

  const tips = propina === 'Si';

  const createQueue = [];
  const updateQueue = [];

  for (const q of questions) {
    if (q.id) {
      updateQueue.push(
        prisma.question.update({
          where: { id: q.id },
          data: { question: q.question },
        })
      );
    } else {
      createQueue.push({ question: q.question });
    }
  }

  const data = {
    position,
    schedule,
    period,
    contract,
    vacancies: toInt(vacancies),
    yearsOfExperience: toNullableInt(yearsOfExperience),
    description,
    requirements,
    functions,
    tips,
    salary: toInt(salary),
    questions: { create: createQueue },
  };

  if (locationId) data.location = { connect: { id: toInt(locationId) } };

  const updatedJob = await prisma.$transaction(async (tx) => {
    if (updateQueue.length) await Promise.all(updateQueue);
    return tx.jobOffer.update({
      where: { id: jobId },
      data,
      include: { questions: true },
    });
  });

  return updatedJob;
};

export {
  fetchTopRatedJobs,
  fetchJobsByNameAndLocation,
  softDeleteJobCascade,
  updateJobOffer,
};
