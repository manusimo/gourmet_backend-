const express = require('express');
const { prisma } = require('../db.js');
const { getMonitoringStats, resetMonitoring } = require('../middleware/ddosMonitoring.js');
const { getPerformanceStats, getHealthStatus } = require('../middleware/performanceMonitoring.js');
const { getErrorStats, searchErrors } = require('../middleware/errorTracking.js');
const { checkCompany } = require('../helpers/authenticateToken.js');
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const { sendEmail } = require('../helpers/email.js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const router = express.Router();

// ============================================================================
// USER MANAGEMENT ENDPOINTS
// ============================================================================

// GET /admin/users - Get all users for the company
router.get('/users', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    console.log('🔍 Fetching users for restaurant:', req.restaurantId);
    
    // Get all users associated with this restaurant
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: {
        restaurantId: req.restaurantId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            role: true
          }
        }
      }
    });

    console.log('🔍 Found restaurant users:', restaurantUsers.length);

    const users = restaurantUsers.map(ru => ({
      ...ru.user,
      restaurantUserId: ru.id,
      role: ru.role
    }));

    res.status(200).json({ 
      success: true,
      data: users 
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error',
      error: error.message 
    });
  }
});

// POST /admin/create-user - Create a new user for the company
router.post('/create-user', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;
    const restaurantId = req.restaurantId;

    console.log('🔍 Creating user:', { name, email, phoneNumber, restaurantId });
    console.log('🔍 Prisma client available:', !!prisma);
    console.log('🔍 RestaurantUser model available:', !!prisma.restaurantUser);
    console.log('🔍 User model available:', !!prisma.user);
    console.log('🔍 Available Prisma models:', Object.keys(prisma));

    // Validate required fields
    if (!name || !email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone number are required'
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(10).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10); // Hash the temporary password

    console.log('🔍 Generated temporary password for:', email);

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        phoneNumber,
        password: hashedPassword, // Store hashed password
        userType: 'employee', // Add missing userType field
        role: 'employee', // Default role for company users
        mfaEnabled: false,
        accountLocked: false,
        loginAttempts: 0,
        securityNotifications: false
      }
    });

    console.log('✅ User created successfully:', newUser.id);

    // Associate user with restaurant
    console.log('🔍 Creating restaurant user association...');
    const restaurantUser = await prisma.restaurantUser.create({
      data: {
        userId: newUser.id,
        restaurantId: restaurantId,
        role: 'employee'
      }
    });

    console.log('✅ User associated with restaurant:', restaurantUser.id);

    // Send email with temporary password
    try {
      await sendEmail({
        to: email,
        subject: 'Bienvenido a GourmetJobs - Tu cuenta ha sido creada',
        text: `Hola ${name},\n\nTu cuenta ha sido creada exitosamente en GourmetJobs.\n\nTu contraseña temporal es: ${tempPassword}\n\nPor favor, cambia tu contraseña después de iniciar sesión por primera vez.\n\nSaludos,\nEl equipo de GourmetJobs`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #fb5424;">Bienvenido a GourmetJobs</h2>
            <p>Hola <strong>${name}</strong>,</p>
            <p>Tu cuenta ha sido creada exitosamente en GourmetJobs.</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Tu contraseña temporal es:</strong></p>
              <p style="font-size: 18px; font-weight: bold; color: #fb5424; margin: 10px 0;">${tempPassword}</p>
            </div>
            <p><strong>Importante:</strong> Por favor, cambia tu contraseña después de iniciar sesión por primera vez.</p>
            <p>Saludos,<br>El equipo de GourmetJobs</p>
          </div>
        `
      });
      console.log('✅ Email sent successfully to:', email);
    } catch (emailError) {
      console.error('❌ Error sending email:', emailError);
      // Don't fail the user creation if email fails
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        ...newUser,
        restaurantUserId: restaurantUser.id,
        role: restaurantUser.role
      }
    });
  } catch (error) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
});

// PATCH /admin/user/update - Update user information
router.patch('/user/update', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { id, name, email, phoneNumber } = req.body;
    
    console.log('🔍 Updating user with data:', { id, name, email, phoneNumber });

    if (!id) {
      console.log('❌ No user ID provided in request body');
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Check if user belongs to this restaurant
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        userId: parseInt(id),
        restaurantId: req.restaurantId
      }
    });

    if (!restaurantUser) {
      console.log('❌ User not found or not associated with restaurant:', { userId: id, restaurantId: req.restaurantId });
      return res.status(404).json({
        success: false,
        message: 'User not found or not associated with this restaurant'
      });
    }

    console.log('✅ Found restaurant user association:', restaurantUser.id);

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        name: name || undefined,
        email: email || undefined,
        phoneNumber: phoneNumber || undefined
      }
    });

    console.log('✅ User updated successfully:', updatedUser.id);

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('❌ Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
});

// GET /admin/user/:id - Get specific user by ID
router.get('/user/:id', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.restaurantId;

    // Check if user belongs to this restaurant
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        userId: parseInt(id),
        restaurantId: restaurantId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            role: true
          }
        }
      }
    });

    if (!restaurantUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not associated with this restaurant'
      });
    }

    const user = {
      ...restaurantUser.user,
      restaurantUserId: restaurantUser.id,
      role: restaurantUser.role
    };

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
});

// ============================================================================
// DASHBOARD ENDPOINTS
// ============================================================================

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

module.exports = router;