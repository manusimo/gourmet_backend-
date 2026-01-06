const Logger = require('../../utils/logger.js');
const { prisma } = require('../../db.js');
const { getMonitoringStats } = require('../../middleware/ddosMonitoring.js');
const { getPerformanceStats, getHealthStatus } = require('../../middleware/performanceMonitoring.js');
const { getErrorStats } = require('../../middleware/errorTracking.js');
const { FORTY_EIGHT_HOURS_MS, DDOS_WARNING_THRESHOLD } = require('./adminConstants.js');

/**
 * Admin Metrics Service
 * Handles business logic for admin metrics and analytics
 */
class AdminMetricsService {
  /**
   * Get total counts for admin dashboard
   * @returns {Promise<Object>} Total counts with breakdown and metrics
   * @throws {Error} If database error occurs
   */
  static async getTotalCounts() {
    const startTime = Date.now();
    Logger.info('Getting total counts for dashboard');

    try {
      // Get jobs with no applications after 48h
      const jobsWithNoApplicationsAfter48h = await this._getJobsWithNoApplicationsAfter48h();

      // Fetch all counts in parallel
      const counts = await this._fetchAllCounts();

      // Calculate percentage of finished profiles that take action
      const activeProfessionalsPercentage = this._calculateActiveProfessionalsPercentage(
        counts.activeProfessionals,
        counts.registeredProfessionals
      );

      // Calculate average time metrics
      const avgMetrics = await this._calculateAverageTimeMetrics();

      // Build total counts response
      const totalCounts = this._buildTotalCountsResponse({
        counts,
        activeProfessionalsPercentage,
        avgMetrics,
        jobsWithNoApplicationsAfter48h
      });

      const executionTime = Date.now() - startTime;
      Logger.info('Total counts retrieved successfully', {
        executionTime: `${executionTime}ms`,
        activeProfessionalsPercentage: `${activeProfessionalsPercentage}%`
      });

      return totalCounts;
    } catch (error) {
      Logger.error('Error getting total counts', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Get metrics in legacy format (for backward compatibility)
   * @returns {Promise<Object>} Metrics in legacy format
   * @throws {Error} If database error occurs
   */
  static async getMetrics() {
    const startTime = Date.now();
    Logger.info('Getting metrics (legacy format)');

    try {
      // Get jobs with no applications after 48h
      const jobsWithNoApplicationsAfter48h = await this._getJobsWithNoApplicationsAfter48h();

      // Fetch all counts in parallel
      const counts = await this._fetchAllCounts();

      // Calculate percentage of finished profiles that take action
      const activeProfessionalsPercentage = this._calculateActiveProfessionalsPercentage(
        counts.activeProfessionals,
        counts.registeredProfessionals
      );

      // Calculate average time metrics
      const avgMetrics = await this._calculateAverageTimeMetrics();

      // Build metrics response in legacy format
      const metrics = this._buildMetricsResponse({
        counts,
        activeProfessionalsPercentage,
        avgMetrics,
        jobsWithNoApplicationsAfter48h
      });

      const executionTime = Date.now() - startTime;
      Logger.info('Metrics retrieved successfully (legacy format)', {
        executionTime: `${executionTime}ms`,
        activeProfessionalsPercentage: `${activeProfessionalsPercentage}%`
      });

      return metrics;
    } catch (error) {
      Logger.error('Error getting metrics', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Get complete system overview
   * @returns {Promise<Object>} System overview with all metrics
   * @throws {Error} If database error occurs
   */
  static async getSystemOverview() {
    Logger.info('Getting system overview');

    try {
      // Get all monitoring data in parallel
      const [
        ddosStats,
        performanceStats,
        errorStats,
        healthStatus,
        businessMetrics
      ] = await Promise.all([
        getMonitoringStats(),
        getPerformanceStats(),
        getErrorStats(),
        getHealthStatus(),
        // Business metrics
        Promise.all([
          prisma.restaurant.count(),
          prisma.employee.count(),
          prisma.jobOffer.count(),
          prisma.application.count()
        ])
      ]);

      const [companies, professionals, jobs, applications] = businessMetrics;

      const systemOverview = {
        timestamp: new Date().toISOString(),
        status: healthStatus.status,
        uptime: process.uptime(),
        
        // Business metrics
        business: {
          companies,
          professionals,
          jobs,
          applications
        },

        // Performance metrics
        performance: {
          avgResponseTime: performanceStats.overview.avgResponseTime,
          requestsLast5Min: performanceStats.overview.requestsLast5Min,
          errorRate: performanceStats.overview.errorRate,
          memoryUsage: healthStatus.memory
        },

        // Security metrics
        security: {
          requestsPerSecond: ddosStats.requestsPerSecond,
          suspiciousIPs: ddosStats.suspiciousIPs,
          ddosStatus: ddosStats.requestsPerSecond > DDOS_WARNING_THRESHOLD ? 'WARNING' : 'NORMAL'
        },

        // Error metrics
        errors: {
          totalErrors: errorStats.overview.totalErrors,
          errorsLastHour: errorStats.overview.errorsLastHour,
          criticalErrors: errorStats.overview.criticalErrors,
          topErrorType: errorStats.overview.topErrorType
        },

        // System health
        health: {
          status: healthStatus.status,
          issues: healthStatus.issues,
          memoryPercentage: healthStatus.memory.percentage
        }
      };

      Logger.info('System overview retrieved successfully', {
        status: systemOverview.status,
        uptime: `${systemOverview.uptime}s`
      });

      return systemOverview;
    } catch (error) {
      Logger.error('Error getting system overview', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  // ========== Private Helper Methods ==========

  /**
   * Get jobs with no applications after 48 hours
   * @returns {Promise<number>} Count of jobs with no applications after 48h
   * @private
   */
  static async _getJobsWithNoApplicationsAfter48h() {
    const fortyEightHoursAgo = new Date(Date.now() - FORTY_EIGHT_HOURS_MS);

    try {
      return await prisma.jobOffer.count({
        where: {
          createdAt: {
            lt: fortyEightHoursAgo
          },
          deletedAt: null,
          applications: {
            none: {}
          }
        }
      });
    } catch (error) {
      // JobOffer.createdAt field doesn't exist yet - migration not applied
      Logger.warn('JobOffer.createdAt field does not exist', { error: error.message });
      return 0;
    }
  }

  /**
   * Fetch all counts in parallel
   * @returns {Promise<Object>} Object containing all counts
   * @private
   */
  static async _fetchAllCounts() {
    const [
      registeredCompanies,
      registeredProfessionals,
      publishedOffers,
      totalApplications,
      professionalUsers,
      adminCompanyUsers,
      activeProfessionals,
      workersWhoNeverCameBack,
      totalConversations
    ] = await Promise.all([
      prisma.restaurant.count(),
      // Count Users with userType 'profesionales' who have created an Employee profile
      prisma.user.count({
        where: {
          userType: 'profesionales',
          employee: {
            isNot: null
          }
        }
      }),
      prisma.jobOffer.count(),
      prisma.application.count(),
      // Count all users with userType 'profesionales' (registered but may not have profile)
      prisma.user.count({
        where: { userType: 'profesionales' }
      }),
      prisma.user.count({
        where: {
          userType: 'empresas',
          role: 'admin'
        }
      }),
      // Count distinct professional users with completed profiles who have applied to ≥1 job
      prisma.employee.count({
        where: {
          user: {
            userType: 'profesionales'
          },
          applications: {
            some: {}
          }
        }
      }),
      // Workers who never came back after signup (signed up but didn't create profile)
      prisma.user.count({
        where: {
          userType: 'profesionales',
          employee: {
            is: null
          }
        }
      }),
      // Count all conversations (excluding soft-deleted ones)
      prisma.conversation.count({
        where: {
          deletedAt: null
        }
      })
    ]);

    return {
      registeredCompanies,
      registeredProfessionals,
      publishedOffers,
      totalApplications,
      professionalUsers,
      adminCompanyUsers,
      activeProfessionals,
      workersWhoNeverCameBack,
      totalConversations
    };
  }

  /**
   * Calculate percentage of finished profiles that take action
   * @param {number} activeProfessionals - Count of active professionals
   * @param {number} registeredProfessionals - Count of registered professionals
   * @returns {number} Percentage (0-100)
   * @private
   */
  static _calculateActiveProfessionalsPercentage(activeProfessionals, registeredProfessionals) {
    const activeProfessionalsCount = activeProfessionals || 0;
    const registeredProfessionalsCount = registeredProfessionals || 0;
    
    return registeredProfessionalsCount > 0
      ? Math.round((activeProfessionalsCount / registeredProfessionalsCount) * 100)
      : 0;
  }

  /**
   * Build total counts response object
   * @param {Object} params - Response parameters
   * @param {Object} params.counts - All fetched counts
   * @param {number} params.activeProfessionalsPercentage - Active professionals percentage
   * @param {Object} params.avgMetrics - Average time metrics
   * @param {number} params.jobsWithNoApplicationsAfter48h - Jobs with no applications after 48h
   * @returns {Object} Total counts response
   * @private
   */
  static _buildTotalCountsResponse({ counts, activeProfessionalsPercentage, avgMetrics, jobsWithNoApplicationsAfter48h }) {
    const {
      registeredCompanies,
      registeredProfessionals,
      publishedOffers,
      totalApplications,
      professionalUsers,
      adminCompanyUsers,
      activeProfessionals,
      workersWhoNeverCameBack,
      totalConversations
    } = counts;

    const registeredProfessionalsCount = registeredProfessionals || 0;
    const activeProfessionalsCount = activeProfessionals || 0;

    return {
      registeredCompanies: (registeredCompanies || 0) + (adminCompanyUsers || 0),
      registeredProfessionals: registeredProfessionalsCount,
      publishedOffers: publishedOffers || 0,
      totalApplications: totalApplications || 0,
      totalConversations: totalConversations || 0,
      breakdown: {
        restaurantProfiles: registeredCompanies || 0,
        adminCompanyUsers: adminCompanyUsers || 0,
        professionalProfiles: registeredProfessionalsCount,
        professionalUsers: professionalUsers || 0,
        activeProfessionals: activeProfessionalsCount,
        activeProfessionalsPercentage,
        ...avgMetrics,
        jobsWithNoApplicationsAfter48h: jobsWithNoApplicationsAfter48h || 0,
        workersWhoNeverCameBack: workersWhoNeverCameBack || 0
      }
    };
  }

  /**
   * Build metrics response in legacy format
   * @param {Object} params - Response parameters
   * @param {Object} params.counts - All fetched counts
   * @param {number} params.activeProfessionalsPercentage - Active professionals percentage
   * @param {Object} params.avgMetrics - Average time metrics
   * @param {number} params.jobsWithNoApplicationsAfter48h - Jobs with no applications after 48h
   * @returns {Object} Metrics response in legacy format
   * @private
   */
  static _buildMetricsResponse({ counts, activeProfessionalsPercentage, avgMetrics, jobsWithNoApplicationsAfter48h }) {
    const {
      registeredCompanies,
      registeredProfessionals,
      publishedOffers,
      totalApplications,
      professionalUsers,
      adminCompanyUsers,
      activeProfessionals,
      workersWhoNeverCameBack,
      totalConversations
    } = counts;

    const registeredProfessionalsCount = registeredProfessionals || 0;
    const activeProfessionalsCount = activeProfessionals || 0;

    return {
      registeredCompanies: (registeredCompanies || 0) + (adminCompanyUsers || 0),
      registeredProfessionals: registeredProfessionalsCount,
      publishedOffers: publishedOffers || 0,
      totalApplications: totalApplications || 0,
      totalConversations: totalConversations || 0,
      breakdown: {
        restaurantProfiles: registeredCompanies || 0,
        adminCompanyUsers: adminCompanyUsers || 0,
        professionalProfiles: registeredProfessionalsCount,
        professionalUsers: professionalUsers || 0,
        activeProfessionals: activeProfessionalsCount,
        activeProfessionalsPercentage,
        avgSignupToProfileDays: avgMetrics.avgSignupToProfileDays,
        avgProfileToApplicationDays: avgMetrics.avgProfileToApplicationDays,
        avgSignupToRestaurantDays: avgMetrics.avgSignupToRestaurantDays,
        avgRestaurantToJobDays: avgMetrics.avgRestaurantToJobDays,
        jobsWithNoApplicationsAfter48h: jobsWithNoApplicationsAfter48h || 0,
        workersWhoNeverCameBack: workersWhoNeverCameBack || 0
      }
    };
  }

  /**
   * Calculate average time metrics
   * @returns {Promise<Object>} Average time metrics
   * @private
   */
  static async _calculateAverageTimeMetrics() {
    const [
      avgSignupToProfileDays,
      avgProfileToApplicationDays,
      avgSignupToRestaurantDays,
      avgRestaurantToJobDays
    ] = await Promise.all([
      this._calculateAvgSignupToProfileDays(),
      this._calculateAvgProfileToApplicationDays(),
      this._calculateAvgSignupToRestaurantDays(),
      this._calculateAvgRestaurantToJobDays()
    ]);

    return {
      avgSignupToProfileDays,
      avgProfileToApplicationDays,
      avgSignupToRestaurantDays,
      avgRestaurantToJobDays
    };
  }

  /**
   * Calculate average days from signup to profile creation
   * @returns {Promise<number|null>} Average days or null
   * @private
   */
  static async _calculateAvgSignupToProfileDays() {
    const query = prisma.$queryRaw`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (e."createdAt" - u."createdAt"))) / 86400 as avg_days
      FROM "User" u
      INNER JOIN "Employee" e ON e."userId" = u.id
      WHERE u."userType" = 'profesionales'
        AND e."createdAt" IS NOT NULL
    `;
    
    return this._executeAverageDaysQuery(query, 'Employee.createdAt field does not exist');
  }

  /**
   * Calculate average days from profile creation to first application
   * @returns {Promise<number|null>} Average days or null
   * @private
   */
  static async _calculateAvgProfileToApplicationDays() {
    const query = prisma.$queryRaw`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (
          (SELECT MIN(a."createdAt") FROM "Application" a WHERE a."employeeId" = e.id) - e."createdAt"
        ))) / 86400 as avg_days
      FROM "User" u
      INNER JOIN "Employee" e ON e."userId" = u.id
      WHERE u."userType" = 'profesionales'
        AND e."createdAt" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "Application" a WHERE a."employeeId" = e.id AND a."createdAt" IS NOT NULL)
    `;
    
    return this._executeAverageDaysQuery(query, 'Employee.createdAt or Application.createdAt fields do not exist');
  }

  /**
   * Calculate average days from signup to restaurant creation
   * @returns {Promise<number|null>} Average days or null
   * @private
   */
  static async _calculateAvgSignupToRestaurantDays() {
    const query = prisma.$queryRaw`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (r."createdAt" - u."createdAt"))) / 86400 as avg_days
      FROM "User" u
      INNER JOIN "Restaurant" r ON r."userId" = u.id
      WHERE u."userType" = 'empresas'
        AND r."createdAt" IS NOT NULL
    `;
    
    return this._executeAverageDaysQuery(query, 'Restaurant.createdAt field does not exist');
  }

  /**
   * Calculate average days from restaurant creation to first job offer
   * @returns {Promise<number|null>} Average days or null
   * @private
   */
  static async _calculateAvgRestaurantToJobDays() {
    const query = prisma.$queryRaw`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (
          (SELECT MIN(j."createdAt") FROM "JobOffer" j WHERE j."restaurantId" = r.id) - r."createdAt"
        ))) / 86400 as avg_days
      FROM "Restaurant" r
      WHERE r."createdAt" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "JobOffer" j WHERE j."restaurantId" = r.id AND j."createdAt" IS NOT NULL)
    `;
    
    return this._executeAverageDaysQuery(query, 'Restaurant.createdAt or JobOffer.createdAt fields do not exist');
  }

  /**
   * Execute average days query and parse result
   * @param {Promise} query - Raw SQL query promise
   * @param {string} errorMessage - Error message for logging
   * @returns {Promise<number|null>} Rounded average days or null
   * @private
   */
  static async _executeAverageDaysQuery(query, errorMessage) {
    try {
      const result = await query;
      
      if (result && result[0]?.avg_days !== null) {
        return Math.round(parseFloat(result[0].avg_days) * 10) / 10;
      }
      
      return null;
    } catch (error) {
      Logger.warn(errorMessage, { error: error.message });
      return null;
    }
  }
}

module.exports = AdminMetricsService;

