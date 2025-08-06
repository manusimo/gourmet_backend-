import { Router } from "express";
import { prisma } from "../db.js";
import { getMonitoringStats, resetMonitoring } from "../middleware/ddosMonitoring.js";
import { getPerformanceStats, getHealthStatus } from "../middleware/performanceMonitoring.js";
import { getErrorStats, searchErrors } from "../middleware/errorTracking.js";

const router = Router();

// GET /admin/total-counts - Get total counts for dashboard
router.get('/total-counts', async (req, res) => {
  try {
    const [
      registeredCompanies,
      registeredProfessionals,
      publishedOffers,
      totalApplications
    ] = await Promise.all([
      prisma.restaurant.count(),
      prisma.employee.count(),
      prisma.jobOffer.count(),
      prisma.application.count()
    ]);

    const totalCounts = {
      registeredCompanies: registeredCompanies || 0,
      registeredProfessionals: registeredProfessionals || 0,
      publishedOffers: publishedOffers || 0,
      totalApplications: totalApplications || 0
    };

    res.status(200).json({ 
      success: true,
      data: totalCounts 
    });
  } catch (error) {
    console.error('Error fetching total counts:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /admin/metrics - Legacy endpoint for compatibility
router.get('/metrics', async (req, res) => {
  try {
    const [
      registeredCompanies,
      registeredProfessionals,
      publishedOffers,
      totalApplications
    ] = await Promise.all([
      prisma.restaurant.count(),
      prisma.employee.count(),
      prisma.jobOffer.count(),
      prisma.application.count()
    ]);

    res.json({
      registeredCompanies: registeredCompanies || 0,
      registeredProfessionals: registeredProfessionals || 0,
      publishedOffers: publishedOffers || 0,
      totalApplications: totalApplications || 0
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// ============================================================================
// SECURITY MONITORING ENDPOINTS
// ============================================================================

// GET /admin/security/ddos-stats - Get real-time DDoS monitoring statistics
router.get('/security/ddos-stats', (req, res) => {
  try {
    const stats = getMonitoringStats();
    res.status(200).json({ 
      success: true,
      data: {
        ...stats,
        status: stats.requestsPerSecond > 50 ? 'WARNING' : 'NORMAL',
        message: stats.requestsPerSecond > 100 ? 'High traffic detected' : 'Traffic levels normal'
      }
    });
  } catch (error) {
    console.error('Error fetching DDoS stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// POST /admin/security/reset-monitoring - Reset DDoS monitoring data
router.post('/security/reset-monitoring', (req, res) => {
  try {
    resetMonitoring();
    res.status(200).json({ 
      success: true,
      message: 'DDoS monitoring data reset successfully' 
    });
  } catch (error) {
    console.error('Error resetting monitoring:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /admin/security/alert-config - Get current alert configuration
router.get('/security/alert-config', (req, res) => {
  try {
    const config = {
      thresholds: {
        requestsPerSecondWarning: 50,
        requestsPerSecondCritical: 100,
        requestsPerMinuteWarning: 1000,
        requestsPerMinuteCritical: 2000,
        maxRequestsPerIPPerMinute: 200,
        maxFailedRequestsPerIP: 20
      },
      settings: {
        monitoringWindowSeconds: 60,
        alertCooldownMinutes: 15,
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

    res.status(200).json({ 
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error fetching alert config:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// ============================================================================
// PERFORMANCE MONITORING ENDPOINTS
// ============================================================================

// GET /admin/performance/stats - Get performance statistics
router.get('/performance/stats', (req, res) => {
  try {
    const stats = getPerformanceStats();
    res.status(200).json({ 
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching performance stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /admin/performance/health - Get application health status
router.get('/performance/health', (req, res) => {
  try {
    const health = getHealthStatus();
    res.status(200).json({ 
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Error fetching health status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// ============================================================================
// ERROR TRACKING ENDPOINTS
// ============================================================================

// GET /admin/errors/stats - Get error statistics
router.get('/errors/stats', (req, res) => {
  try {
    const stats = getErrorStats();
    res.status(200).json({ 
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching error stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /admin/errors/search - Search and filter errors
router.get('/errors/search', (req, res) => {
  try {
    const query = {
      category: req.query.category,
      severity: req.query.severity,
      endpoint: req.query.endpoint,
      userId: req.query.userId,
      timeRange: req.query.timeRange ? parseInt(req.query.timeRange) : undefined
    };

    const errors = searchErrors(query);
    res.status(200).json({ 
      success: true,
      data: {
        errors,
        total: errors.length,
        query
      }
    });
  } catch (error) {
    console.error('Error searching errors:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// ============================================================================
// SYSTEM MONITORING ENDPOINTS
// ============================================================================

// GET /admin/system/overview - Complete system overview
router.get('/system/overview', async (req, res) => {
  try {
    // Get all monitoring data
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
        ddosStatus: ddosStats.requestsPerSecond > 50 ? 'WARNING' : 'NORMAL'
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

    res.status(200).json({ 
      success: true,
      data: systemOverview
    });
  } catch (error) {
    console.error('Error fetching system overview:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /admin/system/logs - Get recent log entries (if needed)
router.get('/system/logs', (req, res) => {
  try {
    // This could read from log files if needed
    // For now, return a placeholder
    res.status(200).json({ 
      success: true,
      message: 'Log viewing not implemented yet',
      data: {
        logFiles: ['error.log', 'warn.log', 'info.log', 'combined.log'],
        location: './logs/'
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

export default router;