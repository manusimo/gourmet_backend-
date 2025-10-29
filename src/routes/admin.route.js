const express = require('express');
const { prisma } = require('../db.js');
const { getMonitoringStats, resetMonitoring } = require('../middleware/ddosMonitoring.js');
const { getPerformanceStats, getHealthStatus } = require('../middleware/performanceMonitoring.js');
const { getErrorStats, searchErrors } = require('../middleware/errorTracking.js');
const { checkAdmin, checkCompany } = require('../helpers/authenticateToken.js');
const { requireRole } = require('../middleware/auth.js');
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const { isAccountLocked, resetAccountLockout } = require('../middleware/security.js');
const { sendEmail } = require('../helpers/email.js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { setUserRole } = require('../middleware/auth.js');

const router = express.Router();


// GET /admin/users - Get all users for the company
router.get('/users', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    console.log('🔐 SECURITY CHECK - User attempting to access admin/users:');
    console.log(`   User ID: ${req.userId}`);
    console.log(`   User Role: ${req.role}`);
    console.log(`   Restaurant ID: ${req.restaurantId}`);
    console.log(`   Restaurant User ID: ${req.restaurantUserId}`);
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
    console.log('🔍 Restaurant users data:', JSON.stringify(restaurantUsers, null, 2));

    const users = restaurantUsers.map(ru => ({
      ...ru.user,
      restaurantUserId: ru.id,
      role: ru.role
    }));

    console.log('🔍 Processed users data:', JSON.stringify(users, null, 2));

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
router.post('/create-user', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;
    const restaurantId = req.restaurantId;

    console.log('🔍 Creating user:', { name, email, phoneNumber, restaurantId });

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
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    console.log('🔍 Generated temporary password for:', email);
    console.log('🔑 Temporary password:', tempPassword); // Log for development

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        phoneNumber,
        password: hashedPassword,
        userType: 'empresas', // Restaurant staff, not job applicants
        role: 'staff', // Restaurant staff role
        mfaEnabled: false,
        accountLocked: false,
        loginAttempts: 0,
        securityNotifications: false
      }
    });

    console.log('✅ User created successfully:', newUser.id);

    // Associate user with restaurant
    const restaurantUser = await prisma.restaurantUser.create({
      data: {
        userId: newUser.id,
        restaurantId: restaurantId,
        role: 'staff' // Restaurant staff role
      }
    });

    console.log('✅ User associated with restaurant:', restaurantUser.id);

    // Generate JWT token for password setup
    const token = jwt.sign({ 
      userId: newUser.id, 
      userType: 'empresas',
      role: 'staff',
      restaurantId: restaurantId,
      restaurantUserId: restaurantUser.id
    }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://www.gourmetjobs.cl' 
      : 'http://localhost:3001';
    const setupUrl = `${baseUrl}/set-password?token=${token}`;

    // Send email with temporary password and setup link
    try {
      await sendEmail({
        to: email,
        subject: 'Bienvenido a GourmetJobs - Tu cuenta ha sido creada',
        text: `Hola ${name},\n\nTu cuenta ha sido creada exitosamente en GourmetJobs.\n\nTu contraseña temporal es: ${tempPassword}\n\nConfigura tu contraseña aquí: ${setupUrl}\n\nPor favor, cambia tu contraseña después de iniciar sesión por primera vez.\n\nSaludos,\nEl equipo de GourmetJobs`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #fb5424;">Bienvenido a GourmetJobs</h2>
            <p>Hola <strong>${name}</strong>,</p>
            <p>Tu cuenta ha sido creada exitosamente en GourmetJobs.</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Tu contraseña temporal es:</strong></p>
              <p style="font-size: 18px; font-weight: bold; color: #fb5424; margin: 10px 0;">${tempPassword}</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${setupUrl}" style="background-color: #fb5424; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Configurar Contraseña</a>
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
router.patch(
  '/user/update', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
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

// DELETE /admin/user/:id - Delete user from restaurant
router.delete('/user/:id', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.restaurantId;

    console.log('🗑️ Deleting user:', { userId: id, restaurantId });

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
            email: true,
            role: true
          }
        }
      }
    });

    if (!restaurantUser) {
      console.log('❌ User not found or not associated with restaurant:', { userId: id, restaurantId });
      return res.status(404).json({
        success: false,
        message: 'User not found or not associated with this restaurant'
      });
    }

    // Prevent deleting the admin user (restaurant owner)
    if (restaurantUser.user.role === 'admin') {
      console.log('❌ Cannot delete admin user:', restaurantUser.user.email);
      return res.status(403).json({
        success: false,
        message: 'Cannot delete the restaurant owner (admin user)'
      });
    }

    console.log('✅ Found restaurant user association:', restaurantUser.id);

    // Delete the restaurant user association first
    await prisma.restaurantUser.delete({
      where: { id: restaurantUser.id }
    });

    console.log('✅ Restaurant user association deleted');

    // Delete the user
    await prisma.user.delete({
      where: { id: parseInt(id) }
    });

    console.log('✅ User deleted successfully:', restaurantUser.user.email);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: {
        deletedUser: {
          id: restaurantUser.user.id,
          email: restaurantUser.user.email,
          role: restaurantUser.user.role
        }
      }
    });
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
});

// GET /admin/user/:id - Get specific user by ID
router.get('/user/:id', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
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

// ============================================================================
// FLAGGED USERS MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all flagged/locked users
 * GET /api/admin/flagged-users
 */
router.get('/flagged-users', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    console.log('🔍 Admin fetching flagged users');
    
    // Get all users with lockout information
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        userType: true,
        role: true,
        lastLoginAt: true,
        createdAt: true
      }
    });

    // Check which users are currently locked
    const flaggedUsers = [];
    
    for (const user of users) {
      const lockoutStatus = isAccountLocked(user.id);
      if (lockoutStatus) {
        flaggedUsers.push({
          ...user,
          attempts: lockoutStatus.attempts,
          lockUntil: lockoutStatus.lockUntil,
          remainingTime: lockoutStatus.remainingTime
        });
      }
    }

    console.log(`🔍 Found ${flaggedUsers.length} flagged users`);

    res.status(200).json({
      success: true,
      flaggedUsers: flaggedUsers,
      total: flaggedUsers.length
    });

  } catch (error) {
    console.error('❌ Error fetching flagged users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching flagged users'
    });
  }
});

/**
 * Unflag/unlock a user
 * POST /api/admin/unflag-user
 */
router.post('/unflag-user', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    console.log(`🔍 Admin attempting to unflag user: ${userId}`);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      select: { id: true, email: true, name: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Reset the account lockout
    const resetResult = resetAccountLockout(userId);
    
    if (resetResult.success) {
      console.log(`✅ Admin unflag: User ${user.email} (ID: ${userId}) has been unlocked`);
      
      res.status(200).json({
        success: true,
        message: `User ${user.email} has been successfully unlocked`,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'User was not locked or could not be unlocked'
      });
    }

  } catch (error) {
    console.error('❌ Error unflagging user:', error);
    res.status(500).json({
      success: false,
      message: 'Error unflagging user'
    });
  }
});

/**
 * Get all users
 * GET /api/admin/all-users
 */
router.get('/all-users', checkAdmin, getUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    console.log('🔍 [Admin All Users] Request received');
    console.log('🔍 [Admin All Users] User ID:', req.userId);
    console.log('🔍 [Admin All Users] User Role:', req.role);
    
    // Get users with specific criteria:
    // 1. All users with userType: 'profesionales' (all professionals)
    // 2. Only users with userType: 'empresas' AND role: 'admin' (only admin companies)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { userType: 'profesionales' },
          { 
            AND: [
              { userType: 'empresas' },
              { role: 'admin' }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        userType: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        accountLocked: true,
        mfaEnabled: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`🔍 [Admin All Users] Found ${users.length} filtered users`);
    console.log('🔍 [Admin All Users] Users:', users.map(u => ({ id: u.id, email: u.email, userType: u.userType, role: u.role })));

    res.status(200).json({
      success: true,
      users: users,
      total: users.length
    });

  } catch (error) {
    console.error('❌ [Admin All Users] Error fetching all users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching all users'
    });
  }
});

/**
 * Delete a user and all related data
 * DELETE /api/admin/delete-user
 */
router.delete('/delete-user', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    console.log(`🔍 Admin attempting to delete user: ${userId}`);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      select: { id: true, email: true, name: true, userType: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting the current admin user
    if (parseInt(userId) === req.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Start a transaction to delete all related data
    await prisma.$transaction(async (tx) => {
      // Delete related data based on user type
      if (user.userType === 'empresas') {
        // For empresas: Check if user owns restaurants directly
        const userRestaurants = await tx.restaurant.findMany({
          where: { userId: parseInt(userId) }
        });

        // Delete restaurants owned by this user
        for (const restaurant of userRestaurants) {
          // Get job offers for this restaurant
          const jobOffers = await tx.jobOffer.findMany({ where: { restaurantId: restaurant.id } });
          
          // Delete applications for these job offers
          for (const jobOffer of jobOffers) {
            await tx.application.deleteMany({ where: { jobPostId: jobOffer.id } });
          }
          
          // Delete locations first (they reference restaurant)
          await tx.location.deleteMany({ where: { restaurantId: restaurant.id } });
          
          // Delete job offers and conversations
          await tx.jobOffer.deleteMany({ where: { restaurantId: restaurant.id } });
          await tx.conversation.deleteMany({ where: { restaurantId: restaurant.id } });
          await tx.restaurant.delete({ where: { id: restaurant.id } });
        }

        // Delete restaurant user relationships
        const restaurantUsers = await tx.restaurantUser.findMany({
          where: { userId: parseInt(userId) }
        });

        for (const restaurantUser of restaurantUsers) {
          // Delete user's job posts
          await tx.jobOffer.deleteMany({ where: { restaurantUserId: restaurantUser.id } });
          
          // Get conversations first, then delete messages, then conversations
          const conversations = await tx.conversation.findMany({ 
            where: { restaurantUserId: restaurantUser.id } 
          });
          
          // Delete all messages for these conversations first
          for (const conversation of conversations) {
            await tx.message.deleteMany({ 
              where: { conversationId: conversation.id } 
            });
          }
          
          // Now delete the conversations
          await tx.conversation.deleteMany({ where: { restaurantUserId: restaurantUser.id } });
          
          // Delete the restaurant user relationship
          await tx.restaurantUser.delete({ where: { id: restaurantUser.id } });
        }
      } else if (user.userType === 'profesionales') {
        // For profesionales: Delete everything (employee profile, applications, conversations)
        const employee = await tx.employee.findUnique({ where: { userId: parseInt(userId) } });
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

      // Delete AI agent related data
      await tx.agentConversation.deleteMany({ where: { userId: parseInt(userId) } });
      await tx.aiAgent.deleteMany({ where: { createdByUserId: parseInt(userId) } });
      
      // Delete notifications
      await tx.notification.deleteMany({ where: { userId: parseInt(userId) } });
      
      // Finally, delete the user
      await tx.user.delete({ where: { id: parseInt(userId) } });
    });

    console.log(`✅ Admin delete: User ${user.email} (ID: ${userId}) and all related data deleted successfully`);
    
    res.status(200).json({
      success: true,
      message: `User ${user.email} and all related data deleted successfully`,
      deletedUser: {
        id: user.id,
        email: user.email,
        name: user.name,
        userType: user.userType
      }
    });

  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user and related data'
    });
  }
});

module.exports = router;