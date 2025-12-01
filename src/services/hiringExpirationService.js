const {
  getExpiredActiveHirings,
  completeHiring
} = require('../helpers/hiringHelpers.js');
const { prisma } = require('../db.js');

/**
 * Service to check for expired hirings and mark them as completed
 * This should be run periodically (e.g., via cron job)
 */
class HiringExpirationService {
  /**
   * Process expired hirings
   * Marks active hirings that have passed their end date as completed
   */
  async processExpiredHirings() {
    try {
      console.log('🔍 [Hiring Expiration] Checking for expired hirings...');
      
      const expiredHirings = await getExpiredActiveHirings();
      
      console.log(`📊 [Hiring Expiration] Found ${expiredHirings.length} expired hirings`);

      for (const hiring of expiredHirings) {
        try {
          await completeHiring(hiring.id);
          console.log(`✅ [Hiring Expiration] Marked hiring ${hiring.id} as completed`);
          
          // Optionally send notification to both parties
          // This could trigger an email or in-app notification
          // asking them to complete their reviews
          
        } catch (error) {
          console.error(`❌ [Hiring Expiration] Error processing hiring ${hiring.id}:`, error);
        }
      }

      return {
        success: true,
        processed: expiredHirings.length
      };
    } catch (error) {
      console.error('❌ [Hiring Expiration] Error processing expired hirings:', error);
      throw error;
    }
  }

  /**
   * Get statistics about hirings
   */
  async getHiringStats() {
    try {
      const [
        totalHirings,
        activeHirings,
        completedHirings,
        pendingHirings,
        expiredActiveHirings
      ] = await Promise.all([
        prisma.hiring.count(),
        prisma.hiring.count({ where: { status: 'active' } }),
        prisma.hiring.count({ where: { status: 'completed' } }),
        prisma.hiring.count({ where: { status: 'pending' } }),
        prisma.hiring.count({
          where: {
            status: 'active',
            endDate: {
              lte: new Date()
            }
          }
        })
      ]);

      return {
        total: totalHirings,
        active: activeHirings,
        completed: completedHirings,
        pending: pendingHirings,
        expiredActive: expiredActiveHirings
      };
    } catch (error) {
      console.error('❌ [Hiring Expiration] Error getting hiring stats:', error);
      throw error;
    }
  }
}

module.exports = new HiringExpirationService();

