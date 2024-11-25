import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fetch top-rated jobs
const fetchTopRatedJobs = async (limit) => {  
  try {
    const jobs = await prisma.jobOffer.findMany({
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
        ...(jobName && {
          name: {
            contains: jobName, // Filter by job name (partial match)
            mode: 'insensitive', // Case-insensitive search
          },
        }),
        ...(location && {
          restaurant: {
            location: {
              contains: location, // Filter by location (partial match)
              mode: 'insensitive', // Case-insensitive search
            },
          },
        }),
        ...(user && {
          applications: {
            some: {
              userId: user.id, // Filter jobs that the user has applied to
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

export { fetchTopRatedJobs, fetchJobsByNameAndLocation };
