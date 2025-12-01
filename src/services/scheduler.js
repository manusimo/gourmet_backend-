const cron = require('node-cron');
const { Logger } = require('../middleware/errorTracking.js');
const jobLifecycleService = require('./jobLifecycleService.js');

/**
 * Initialize all scheduled tasks
 */
class Scheduler {
  constructor() {
    this.jobs = [];
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    // Run daily checks at 9 AM every day
    const dailyJobLifecycleCheck = cron.schedule('0 9 * * *', async () => {
      console.log('🔄 Running scheduled job lifecycle checks...');
      try {
        await jobLifecycleService.runDailyChecks();
      } catch (error) {
        console.error('❌ Error in scheduled job lifecycle checks:', error);
        Logger.error('Scheduled job lifecycle check failed', { error: error.message });
      }
    }, {
      scheduled: true,
      timezone: "America/Santiago" // Adjust to your timezone
    });

    this.jobs.push(dailyJobLifecycleCheck);
    console.log('✅ Cron job scheduled for daily job lifecycle checks (9 AM daily)');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log('🛑 All scheduled jobs stopped');
  }
}

// Create singleton instance
const scheduler = new Scheduler();

module.exports = scheduler;

