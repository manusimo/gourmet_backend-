import { prisma } from "../db.js";

/**
 * Check if talent pool entry exists
 * @param {number} employeeId - Employee ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Talent pool entry or null if not found
 */
export const checkTalentPoolEntry = async (employeeId, restaurantId) => {
  return await prisma.talentPool.findFirst({
    where: {
      employeeId: parseInt(employeeId),
      restaurantId,
    }
  });
};

/**
 * Create talent pool entry
 * @param {Object} talentData - Talent pool data
 * @returns {Object} Created talent pool entry
 */
export const createTalentPoolEntry = async (talentData) => {
  const { employeeId, restaurantId, restaurantUserId } = talentData;
  
  return await prisma.talentPool.create({
    data: {
      employee: { connect: { id: parseInt(employeeId) } },
      restaurant: { connect: { id: restaurantId } },
      addedByUser: { connect: { id: restaurantUserId } },
      status: 'accepted', 
    }
  });
};

/**
 * Build filter conditions for talent pool search
 * @param {Object} queryParams - Query parameters
 * @returns {Object} Filter conditions
 */
export const buildTalentPoolFilters = (queryParams) => {
  const { position, experience, region, comuna, available, schedule } = queryParams;
  
  let filter = {};
  if (position) filter.position = position;
  if (available) filter.available = available;
  if (schedule) filter.schedule = schedule;
  if (region) filter.region = region;
  if (comuna) filter.comuna = comuna;
  
  return filter;
};

/**
 * Get talent pool entry by ID with conversations
 * @param {number} talentId - Talent pool entry ID
 * @returns {Object|null} Talent pool entry with conversations or null
 */
export const getTalentPoolEntryWithConversations = async (talentId) => {
  return await prisma.talentPool.findUnique({
    where: { id: talentId },
    include: { conversations: true }
  });
};

/**
 * Delete talent pool entry and associated conversations
 * @param {number} talentId - Talent pool entry ID
 * @returns {Object} Deleted talent pool entry
 */
export const deleteTalentPoolEntry = async (talentId) => {
  return await prisma.$transaction(async (tx) => {
    const existingEntry = await tx.talentPool.findUnique({
      where: { id: talentId },
      include: { conversations: true }
    });

    if (!existingEntry) {
      throw new Error('Talent not found in the pool.');
    }

    const conversationIds = existingEntry.conversations.map(conversation => conversation.id);

    await tx.message.deleteMany({
      where: { conversationId: { in: conversationIds } }
    });

    await tx.conversation.deleteMany({
      where: { id: { in: conversationIds } }
    });

    return await tx.talentPool.delete({
      where: { id: talentId }
    });
  });
};

/**
 * Approve talent pool entry
 * @param {number} talentId - Talent pool entry ID
 * @param {number} restaurantUserId - Restaurant user ID
 * @returns {Object} Updated talent pool entry
 */
export const approveTalentPoolEntry = async (talentId, restaurantUserId) => {
  return await prisma.talentPool.update({
    where: { id: parseInt(talentId) },
    data: {
      status: "approved",
      addedByUser: { connect: { id: restaurantUserId } }
    }
  });
}; 