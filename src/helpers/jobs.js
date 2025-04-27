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
      // Soft-delete associated Conversations
      prisma.conversation.updateMany({
        where: {
          jobOfferId: jobId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      }),
      // Soft-delete associated Applications
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

export { fetchTopRatedJobs, fetchJobsByNameAndLocation, softDeleteJobCascade };
