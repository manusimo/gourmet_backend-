import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const fetchTopRatedJobs = async (limit) => {
  try {
    const jobs = await prisma.jobOffer.findMany({
      where: { deletedAt: null, deactivatedAt: null },
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

    return jobs.map(job => ({
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
        deactivatedAt: null,
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

    return jobs.map(job => ({
      ...job,
      applicationsCount: job.applications.length,
    }));
  } catch (error) {
    console.error('Error fetching jobs by name and location:', error);
    throw new Error('Could not fetch jobs by name and location');
  }
};

const toggleJobActivation = async (jobId, active, restaurantId) => {
  try {
    const jobOffer = await prisma.jobOffer.findFirst({
      where: {
        id: jobId,
        restaurantId: restaurantId,
        deletedAt: null,
      },
    });
    if (!jobOffer) {
      throw new Error('Job offer not found');
    }
    const updatedJobOffer = await prisma.jobOffer.update({
      where: { id: jobId },
      data: {
        deactivatedAt: active ? null : new Date(),
      },
    });
    return updatedJobOffer;
  } catch (error) {
    console.error('Error toggling job activation:', error);
    throw new Error('Could not toggle job activation');
  }
};

// Soft delete job: update deletedAt to current date instead of removing from DB
const softDeleteJob = async (jobId, restaurantId) => {
  try {
    const jobOffer = await prisma.jobOffer.findFirst({
      where: {
        id: jobId,
        restaurantId: restaurantId,
        deletedAt: null,
      },
    });
    if (!jobOffer) {
      throw new Error('Job offer not found or already deleted');
    }
    const updatedJob = await prisma.jobOffer.update({
      where: { id: jobId },
      data: {
        deletedAt: new Date(),
      },
    });
    return updatedJob;
  } catch (error) {
    console.error('Error soft deleting job:', error);
    throw new Error('Could not soft delete job');
  }
};

export { fetchTopRatedJobs, fetchJobsByNameAndLocation, toggleJobActivation, softDeleteJob };
