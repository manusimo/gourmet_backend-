const Logger = require('../../utils/logger.js');
const { getMonitoringStats, resetMonitoring } = require('../../middleware/ddosMonitoring.js');
const { getPerformanceStats, getHealthStatus } = require('../../middleware/performanceMonitoring.js');
const { getErrorStats, searchErrors } = require('../../middleware/errorTracking.js');
const { DDOS_WARNING_THRESHOLD, DDOS_CRITICAL_THRESHOLD, SECURITY_THRESHOLDS, SECURITY_SETTINGS } = require('./adminConstants.js');

/**
 * Admin Security Service
 * Handles business logic for admin security and monitoring operations
 */
class AdminSecurityService {
  /**
   * Get DDoS monitoring statistics
   * @returns {Object} DDoS stats with status and message
   */
  static getDDoSStats() {
    Logger.info('Getting DDoS monitoring stats');

    const stats = getMonitoringStats();
    
    const ddosStats = {
      ...stats,
      status: stats.requestsPerSecond > DDOS_WARNING_THRESHOLD ? 'WARNING' : 'NORMAL',
      message: stats.requestsPerSecond > DDOS_CRITICAL_THRESHOLD ? 'High traffic detected' : 'Traffic levels normal'
    };

    Logger.info('DDoS stats retrieved successfully', {
      requestsPerSecond: stats.requestsPerSecond,
      status: ddosStats.status
    });

    return ddosStats;
  }

  /**
   * Reset DDoS monitoring data
   * @returns {Object} Success message
   */
  static resetDDoSMonitoring() {
    Logger.info('Resetting DDoS monitoring data');

    resetMonitoring();

    Logger.info('DDoS monitoring data reset successfully');

    return {
      message: 'DDoS monitoring data reset successfully'
    };
  }

  /**
   * Get security alert configuration
   * @returns {Object} Alert configuration with thresholds, settings, and features
   */
  static getAlertConfig() {
    Logger.info('Getting security alert configuration');

    const config = {
      thresholds: SECURITY_THRESHOLDS,
      settings: {
        ...SECURITY_SETTINGS,
        emailAlertsEnabled: !!process.env.SMTP_USER,
        adminEmail: process.env.ADMIN_EMAIL || process.env.SMTP_USER
      },
      features: {
        realTimeMonitoring: true,
        ipBasedTracking: true,
        failedRequestTracking: true,
        automaticBlocking: false, // Rate limiting handles this
        emailNotifications: true
      }
    };

    Logger.info('Alert configuration retrieved successfully');

    return config;
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance statistics
   */
  static getPerformanceStats() {
    Logger.info('Getting performance statistics');

    const stats = getPerformanceStats();

    Logger.info('Performance stats retrieved successfully');

    return stats;
  }

  /**
   * Get application health status
   * @returns {Object} Health status information
   */
  static getHealthStatus() {
    Logger.info('Getting application health status');

    const health = getHealthStatus();

    Logger.info('Health status retrieved successfully', {
      status: health.status
    });

    return health;
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  static getErrorStats() {
    Logger.info('Getting error statistics');

    const stats = getErrorStats();

    Logger.info('Error stats retrieved successfully');

    return stats;
  }

  /**
   * Search and filter errors
   * @param {Object} query - Search query parameters
   * @param {string} [query.category] - Error category
   * @param {string} [query.severity] - Error severity
   * @param {string} [query.endpoint] - Endpoint
   * @param {string} [query.userId] - User ID
   * @param {number} [query.timeRange] - Time range in milliseconds
   * @returns {Object} Search results with errors, total count, and query
   */
  static searchErrors(query) {
    Logger.info('Searching errors', { query });

    // Build query object with proper parsing
    const searchQuery = {
      category: query.category,
      severity: query.severity,
      endpoint: query.endpoint,
      userId: query.userId,
      timeRange: query.timeRange ? parseInt(query.timeRange, 10) : undefined
    };

    const errors = searchErrors(searchQuery);

    const result = {
      errors,
      total: errors.length,
      query: searchQuery
    };

    Logger.info('Error search completed', {
      total: result.total,
      query: searchQuery
    });

    return result;
  }
}

module.exports = AdminSecurityService;

