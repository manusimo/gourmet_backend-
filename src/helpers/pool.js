const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const getTalentPool = async (restaurantId, filter) => {
  try {
    const filters = {
      restaurantId,
      status: 'accepted', // Show accepted talents in "Mis talentos"
      deletedAt: null, // Exclude soft-deleted records
      employee: {
        ...(filter.position && { position: filter.position }),
        ...(filter.experience && { yearsOfExperience: filter.experience }),
        ...(filter.available && { available: filter.available }),
        ...(filter.schedule && { schedule: filter.schedule }),
        ...(filter.region && { region: filter.region }),
        ...(filter.comuna && { comuna: filter.comuna }),
      },
    };

    console.log('🔍 [getTalentPool] Filters applied:', JSON.stringify(filters, null, 2));

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

    console.log('🔍 [getTalentPool] Found entries:', talentPoolEntries.length);
    console.log('🔍 [getTalentPool] Entries:', talentPoolEntries.map(entry => ({
      id: entry.id,
      employeeId: entry.employeeId,
      status: entry.status,
      employeeName: entry.employee?.name
    })));

    return talentPoolEntries;
  } catch (error) {
    console.error('🔍 [getTalentPool] Error fetching talent pool:', error);
    throw error;
  }
};

module.exports = { getTalentPool };



