const { prisma } = require('../../db.js');

/**
 * Admin Deletion Service
 * Handles deletion of user data and related entities
 */
class AdminDeletionService {
  /**
   * Delete empresas user data (restaurants, job offers, etc.)
   * @param {Object} tx - Prisma transaction client
   * @param {number} userId - User ID
   */
  static async deleteEmpresasUserData(tx, userId) {
    // Delete restaurants owned by this user
    const userRestaurants = await tx.restaurant.findMany({
      where: { userId: userId }
    });

    for (const restaurant of userRestaurants) {
      await this._deleteRestaurantAndAllData(tx, restaurant.id);
    }

    // Delete restaurant user relationships
    const restaurantUsers = await tx.restaurantUser.findMany({
      where: { userId: userId }
    });

    for (const restaurantUser of restaurantUsers) {
      await this._deleteRestaurantUserAndAllData(tx, restaurantUser.id);
    }
  }

  /**
   * Delete profesionales user data (employee profile, applications, etc.)
   * @param {Object} tx - Prisma transaction client
   * @param {number} userId - User ID
   */
  static async deleteProfesionalesUserData(tx, userId) {
    // For profesionales: Delete everything (employee profile, applications, conversations)
    const employee = await tx.employee.findUnique({ where: { userId: userId } });
    if (employee) {
      // First, get all applications for this employee
      const applications = await tx.application.findMany({ 
        where: { employeeId: employee.id } 
      });
      
      // Delete all answers for these applications first (foreign key constraint)
      for (const application of applications) {
        await tx.answer.deleteMany({ 
          where: { applicationId: application.id } 
        });
      }
      
      // Now delete the applications
      await tx.application.deleteMany({ where: { employeeId: employee.id } });
      
      // Delete other related data
      await tx.favouriteJob.deleteMany({ where: { employeeId: employee.id } });
      await tx.talentPool.deleteMany({ where: { employeeId: employee.id } });
      await tx.experience.deleteMany({ where: { employeeId: employee.id } });
      await tx.education.deleteMany({ where: { employeeId: employee.id } });
      
      // Get conversations first, then delete messages, then conversations
      const conversations = await tx.conversation.findMany({ 
        where: { employeeId: employee.id } 
      });
      
      // Delete all messages for these conversations first
      for (const conversation of conversations) {
        await tx.message.deleteMany({ 
          where: { conversationId: conversation.id } 
        });
      }
      
      // Now delete the conversations
      await tx.conversation.deleteMany({ where: { employeeId: employee.id } });
      
      // Finally delete the employee
      await tx.employee.delete({ where: { id: employee.id } });
    }
  }

  // ========== Private Helper Methods ==========

  /**
   * Delete restaurant and all associated data
   * @param {Object} tx - Prisma transaction client
   * @param {number} restaurantId - Restaurant ID
   * @private
   */
  static async _deleteRestaurantAndAllData(tx, restaurantId) {
    // Delete job offers and their dependencies
    await this._deleteJobOffersForRestaurant(tx, restaurantId);

    // Delete restaurant-related data
    await this._deleteRestaurantData(tx, restaurantId);

    // Delete restaurantUser links pointing to this restaurant
    await tx.restaurantUser.deleteMany({ where: { restaurantId } });

    // Finally delete the restaurant itself
    await tx.restaurant.delete({ where: { id: restaurantId } });
  }

  /**
   * Delete restaurant user and all associated data
   * @param {Object} tx - Prisma transaction client
   * @param {number} restaurantUserId - Restaurant user ID
   * @private
   */
  static async _deleteRestaurantUserAndAllData(tx, restaurantUserId) {
    // Delete job offers and their dependencies
    await this._deleteJobOffersForRestaurantUser(tx, restaurantUserId);

    // Delete conversations and messages
    await this._deleteConversationsAndMessages(tx, { restaurantUserId });

    // Delete the restaurant user relationship
    await tx.restaurantUser.delete({ where: { id: restaurantUserId } });
  }

  /**
   * Delete job offers and their dependencies for a restaurant
   * @param {Object} tx - Prisma transaction client
   * @param {number} restaurantId - Restaurant ID
   * @private
   */
  static async _deleteJobOffersForRestaurant(tx, restaurantId) {
    const jobOffers = await tx.jobOffer.findMany({ where: { restaurantId } });

    // Delete dependencies for each job offer
    for (const jobOffer of jobOffers) {
      await this._deleteJobOfferDependencies(tx, jobOffer.id);
    }

    // Remove favourite jobs that reference any of these job offers
    const jobOfferIds = jobOffers.map((jo) => jo.id);
    if (jobOfferIds.length > 0) {
      await tx.favouriteJob.deleteMany({ where: { jobOfferId: { in: jobOfferIds } } });
    }

    // Delete remaining job offers
    await tx.jobOffer.deleteMany({ where: { restaurantId } });
  }

  /**
   * Delete job offers and their dependencies for a restaurant user
   * @param {Object} tx - Prisma transaction client
   * @param {number} restaurantUserId - Restaurant user ID
   * @private
   */
  static async _deleteJobOffersForRestaurantUser(tx, restaurantUserId) {
    const jobOffers = await tx.jobOffer.findMany({ where: { restaurantUserId } });

    // Delete dependencies for each job offer
    for (const jobOffer of jobOffers) {
      await this._deleteJobOfferDependencies(tx, jobOffer.id);
    }

    // Delete user's job posts after dependents are removed
    await tx.jobOffer.deleteMany({ where: { restaurantUserId } });
  }

  /**
   * Delete job offer dependencies (answers, applications, questions)
   * @param {Object} tx - Prisma transaction client
   * @param {number} jobOfferId - Job offer ID
   * @private
   */
  static async _deleteJobOfferDependencies(tx, jobOfferId) {
    // Get applications for this job offer
    const applications = await tx.application.findMany({ where: { jobPostId: jobOfferId } });

    // Delete answers for each application
    for (const application of applications) {
      await tx.answer.deleteMany({ where: { applicationId: application.id } });
    }

    // Delete applications
    await tx.application.deleteMany({ where: { jobPostId: jobOfferId } });

    // Delete questions
    await tx.question.deleteMany({ where: { jobOfferId } });
  }

  /**
   * Delete restaurant-related data (locations, conversations, messages, talent pool)
   * @param {Object} tx - Prisma transaction client
   * @param {number} restaurantId - Restaurant ID
   * @private
   */
  static async _deleteRestaurantData(tx, restaurantId) {
    // Delete locations
    await tx.location.deleteMany({ where: { restaurantId } });

    // Delete conversations and messages
    await this._deleteConversationsAndMessages(tx, { restaurantId });

    // Delete talent pool entries
    await tx.talentPool.deleteMany({ where: { restaurantId } });
  }

  /**
   * Delete conversations and their messages
   * @param {Object} tx - Prisma transaction client
   * @param {Object} where - Where clause for finding conversations
   * @param {number} [where.restaurantId] - Restaurant ID
   * @param {number} [where.restaurantUserId] - Restaurant user ID
   * @private
   */
  static async _deleteConversationsAndMessages(tx, where) {
    const conversations = await tx.conversation.findMany({ where });

    // Delete all messages for these conversations first
    for (const conversation of conversations) {
      await tx.message.deleteMany({ where: { conversationId: conversation.id } });
    }

    // Now delete the conversations
    await tx.conversation.deleteMany({ where });
  }
}

module.exports = AdminDeletionService;

