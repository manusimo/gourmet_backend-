import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const getTalentPool = async (restaurantId, filter) => {
  try {
    const filters = {
      restaurantId,
      employee: {
        ...(filter.position && { position: filter.position }),
        ...(filter.experience && { yearsOfExperience: filter.experience }),
        ...(filter.location && { location: { contains: filter.location } }), 
        ...(filter.available && { available: filter.available }),
        ...(filter.schedule && { schedule: filter.schedule }),
      },
    };

    const talentPoolEntries = await prisma.talentPool.findMany({
      where: filters,
      include: {
        employee: true,
        restaurant: true,
        addedByUser: true,
        conversations: true,
      },
      orderBy: {
        createdAt: 'desc', 
      },
    });

    return talentPoolEntries;
  } catch (error) {
    console.error('Error fetching talent pool:', error);
    throw error;
  }
};

export { getTalentPool };



