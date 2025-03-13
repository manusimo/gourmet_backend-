import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export { fetchTopRatedJobs, fetchJobsByNameAndLocation };
