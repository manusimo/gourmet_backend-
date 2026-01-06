const { prisma } = require("../db.js");

/**
 * Check if talent pool entry exists
 * @param {number} employeeId - Employee ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Talent pool entry or null if not found
 */
const checkTalentPoolEntry = async (employeeId, restaurantId) => {
  return await prisma.talentPool.findFirst({
    where: {
      employeeId: parseInt(employeeId),
      restaurantId,
      deletedAt: null, // Exclude soft-deleted records
    }
  });
};

/**
 * Create talent pool entry
 * @param {Object} talentData - Talent pool data
 * @returns {Object} Created talent pool entry
 */
const createTalentPoolEntry = async (talentData) => {
  const { employeeId, restaurantId, restaurantUserId } = talentData;
  
  const data = {
    employee: { connect: { id: parseInt(employeeId) } },
    restaurant: { connect: { id: restaurantId } },
    status: 'accepted', 
  };

  // Only add addedByUser connection if restaurantUserId exists
  if (restaurantUserId) {
    data.addedByUser = { connect: { id: restaurantUserId } };
  }
  
  return await prisma.talentPool.create({ data });
};

/**
 * Build filter conditions for talent pool search
 * @param {Object} queryParams - Query parameters
 * @returns {Object} Filter conditions
 */
const buildTalentPoolFilters = (queryParams) => {
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
const getTalentPoolEntryWithConversations = async (talentId) => {
  return await prisma.talentPool.findFirst({
    where: { 
      id: talentId,
      deletedAt: null // Exclude soft-deleted records
    },
    include: { conversations: true }
  });
};

/**
 * Soft delete talent pool entry and associated conversations
 * @param {number} talentId - Talent pool entry ID
 * @returns {Object} Soft deleted talent pool entry
 */
const deleteTalentPoolEntry = async (talentId) => {
  return await prisma.$transaction(async (tx) => {
    const existingEntry = await tx.talentPool.findFirst({
      where: { 
        id: talentId,
        deletedAt: null // Only find non-deleted records
      },
      include: { conversations: true }
    });

    if (!existingEntry) {
      throw new Error('Talent not found in the pool or already deleted.');
    }

    // Soft delete conversations and messages
    const conversationIds = existingEntry.conversations.map(conversation => conversation.id);

    await tx.message.deleteMany({
      where: { conversationId: { in: conversationIds } }
    });

    await tx.conversation.updateMany({
      where: { id: { in: conversationIds } },
      data: { deletedAt: new Date() }
    });

    // Soft delete the talent pool entry
    return await tx.talentPool.update({
      where: { id: talentId },
      data: { deletedAt: new Date() }
    });
  });
};

/**
 * Approve talent pool entry
 * @param {number} talentId - Talent pool entry ID
 * @param {number} restaurantUserId - Restaurant user ID
 * @returns {Object} Updated talent pool entry
 */
const approveTalentPoolEntry = async (talentId, restaurantUserId) => {
  const updateData = {
    status: "accepted"
  };

  // Only add addedByUser connection if restaurantUserId exists and is not undefined
  if (restaurantUserId && restaurantUserId !== undefined) {
    updateData.addedByUser = { connect: { id: restaurantUserId } };
  }

  return await prisma.talentPool.update({
    where: { id: parseInt(talentId) },
    data: updateData
  });
};

/**
 * Find or create restaurant user for a user and restaurant
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Promise<number>} Restaurant user ID
 */
const findOrCreateRestaurantUser = async (userId, restaurantId) => {
  // Try to find existing restaurant user
  const restaurantUser = await prisma.restaurantUser.findFirst({
    where: {
      userId: parseInt(userId),
      restaurantId: parseInt(restaurantId)
    }
  });

  if (restaurantUser) {
    return restaurantUser.id;
  }

  // Create new restaurant user if not found
  const newRestaurantUser = await prisma.restaurantUser.create({
    data: {
      userId: parseInt(userId),
      restaurantId: parseInt(restaurantId),
      role: 'admin'
    }
  });

  return newRestaurantUser.id;
};

/**
 * Get restaurant owned by user (for legacy JWT fallback)
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} Restaurant or null
 */
const getRestaurantByUserId = async (userId) => {
  return await prisma.restaurant.findFirst({
    where: { userId: parseInt(userId) }
  });
};

/**
 * Upsert restaurant user for admin (for legacy JWT fallback)
 * @param {number} userId - User ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Promise<Object>} Restaurant user
 */
const upsertAdminRestaurantUser = async (userId, restaurantId) => {
  return await prisma.restaurantUser.upsert({
    where: {
      userId_restaurantId: {
        userId: parseInt(userId),
        restaurantId: parseInt(restaurantId)
      }
    },
    update: {},
    create: {
      userId: parseInt(userId),
      restaurantId: parseInt(restaurantId),
      role: 'admin'
    }
  });
};

module.exports = {
  checkTalentPoolEntry,
  createTalentPoolEntry,
  buildTalentPoolFilters,
  getTalentPoolEntryWithConversations,
  deleteTalentPoolEntry,
  approveTalentPoolEntry,
  findOrCreateRestaurantUser,
  getRestaurantByUserId,
  upsertAdminRestaurantUser,
}; 