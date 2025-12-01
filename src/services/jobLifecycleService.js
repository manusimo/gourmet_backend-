const { prisma } = require('../db.js');
const { createMessage } = require('../helpers/chatHelpers.js');

/**
 * Service to handle job lifecycle events (start, end, notifications)
 */
class JobLifecycleService {
  /**
   * Check for jobs starting today and send notifications
   */
  async checkJobsStartingToday() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Find hirings with jobs starting today
      const hiringsStartingToday = await prisma.hiring.findMany({
        where: {
          status: {
            in: ['active', 'accepted']
          },
          jobOffer: {
            startDate: {
              gte: today,
              lt: tomorrow
            }
          },
          conversationId: {
            not: null
          },
          startMessageSent: false // Track if we've already sent the start message
        },
        include: {
          employee: {
            include: {
              user: true
            }
          },
          restaurant: {
            include: {
              restaurantUsers: {
                take: 1,
                include: {
                  user: true
                }
              }
            }
          },
          jobOffer: true,
          conversation: true
        }
      });

      console.log(`📅 Found ${hiringsStartingToday.length} jobs starting today`);

      for (const hiring of hiringsStartingToday) {
        await this.sendJobStartMessage(hiring);
      }

      return hiringsStartingToday.length;
    } catch (error) {
      console.error('❌ Error checking jobs starting today:', error);
      throw error;
    }
  }

  /**
   * Check for jobs ending today and send notifications
   */
  async checkJobsEndingToday() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Find hirings with jobs ending today
      const hiringsEndingToday = await prisma.hiring.findMany({
        where: {
          status: {
            in: ['active', 'accepted']
          },
          jobOffer: {
            endDate: {
              gte: today,
              lt: tomorrow
            }
          },
          conversationId: {
            not: null
          },
          endMessageSent: false // Track if we've already sent the end message
        },
        include: {
          employee: {
            include: {
              user: true
            }
          },
          restaurant: {
            include: {
              restaurantUsers: {
                take: 1,
                include: {
                  user: true
                }
              }
            }
          },
          jobOffer: true,
          conversation: true
        }
      });

      console.log(`📅 Found ${hiringsEndingToday.length} jobs ending today`);

      for (const hiring of hiringsEndingToday) {
        await this.sendJobEndMessage(hiring);
      }

      return hiringsEndingToday.length;
    } catch (error) {
      console.error('❌ Error checking jobs ending today:', error);
      throw error;
    }
  }

  /**
   * Send message when job starts
   */
  async sendJobStartMessage(hiring) {
    try {
      if (!hiring.conversationId) {
        console.log(`⚠️ No conversation ID for hiring ${hiring.id}`);
        return;
      }

      const restaurantUser = hiring.restaurant.restaurantUsers[0];
      if (!restaurantUser) {
        console.log(`⚠️ No restaurant user found for hiring ${hiring.id}`);
        return;
      }

      const messageText = `🎉 ¡El trabajo comienza hoy! ¡Mucha suerte en tu primer día en ${hiring.restaurant.name}!`;

      // Send message to employee
      await createMessage({
        text: messageText,
        conversationId: hiring.conversationId,
        senderUserId: restaurantUser.id,
        receiverUserId: hiring.employeeId,
        senderType: 'restaurant',
        receiverType: 'employee'
      });

      // Mark that start message was sent
      await prisma.hiring.update({
        where: { id: hiring.id },
        data: { startMessageSent: true }
      });

      console.log(`✅ Sent job start message for hiring ${hiring.id}`);
    } catch (error) {
      console.error(`❌ Error sending job start message for hiring ${hiring.id}:`, error);
      throw error;
    }
  }

  /**
   * Send message when job ends
   */
  async sendJobEndMessage(hiring) {
    try {
      if (!hiring.conversationId) {
        console.log(`⚠️ No conversation ID for hiring ${hiring.id}`);
        return;
      }

      const restaurantUser = hiring.restaurant.restaurantUsers[0];
      if (!restaurantUser) {
        console.log(`⚠️ No restaurant user found for hiring ${hiring.id}`);
        return;
      }

      const messageText = `✅ Trabajo finalizado. ¡Tiempo para reseñas! Puedes dejar una reseña sobre tu experiencia.`;

      // Send message to both parties
      await createMessage({
        text: messageText,
        conversationId: hiring.conversationId,
        senderUserId: restaurantUser.id,
        receiverUserId: hiring.employeeId,
        senderType: 'restaurant',
        receiverType: 'employee'
      });

      // Update hiring status to completed
      await prisma.hiring.update({
        where: { id: hiring.id },
        data: {
          status: 'completed',
          endMessageSent: true
        }
      });

      console.log(`✅ Sent job end message for hiring ${hiring.id}`);
    } catch (error) {
      console.error(`❌ Error sending job end message for hiring ${hiring.id}:`, error);
      throw error;
    }
  }

  /**
   * Run daily checks (to be called by cron job)
   */
  async runDailyChecks() {
    try {
      console.log('🔄 Running daily job lifecycle checks...');
      const startingCount = await this.checkJobsStartingToday();
      const endingCount = await this.checkJobsEndingToday();
      console.log(`✅ Daily checks completed: ${startingCount} jobs starting, ${endingCount} jobs ending`);
      return { startingCount, endingCount };
    } catch (error) {
      console.error('❌ Error running daily checks:', error);
      throw error;
    }
  }
}

module.exports = new JobLifecycleService();

