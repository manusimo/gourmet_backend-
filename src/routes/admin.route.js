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
    
    // Get all users associated with this restaurant
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: {
        restaurantId: req.restaurantId
      },
      select: {
        id: true,
        role: true,
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
router.post('/create-user', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;
    const restaurantId = req.restaurantId;

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

    const tempPassword = crypto.randomBytes(10).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        phoneNumber,
        password: hashedPassword,
        userType: 'empresas', 
        role: 'staff', 
        mfaEnabled: false,
        accountLocked: false,
        loginAttempts: 0,
        securityNotifications: false
      }
    });

    const restaurantUser = await prisma.restaurantUser.create({
      data: {
        userId: newUser.id,
        restaurantId: restaurantId,
        role: 'staff' // Restaurant staff role
      }
    });

    const token = jwt.sign({ 
      userId: newUser.id, 
      userType: 'empresas',
      role: 'staff',
      restaurantId: restaurantId,
      restaurantUserId: restaurantUser.id
    }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const baseUrl = 'http://localhost:3001';
    const setupUrl = `${baseUrl}/set-password?token=${token}`;

    // Send email with temporary password and setup link
    try {
      const emailResult = await sendEmail({
        to: email,
        subject: 'Bienvenido a GourmetJobs - Tu cuenta ha sido creada',
        text: `Hola ${name},\n\nTu cuenta ha sido creada exitosamente en GourmetJobs.\n\nTu contraseña temporal es: ${tempPassword}\n\nConfigura tu contraseña aquí: ${setupUrl}\n\nPor favor, cambia tu contraseña después de iniciar sesión por primera vez.\n\nSaludos,\nEl equipo de GourmetJobs`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #fb5424;">Bienvenido a GourmetJobs</h2>
            <p>Hola <strong>${name}</strong>,</p>
            <p>Tu cuenta ha sido creada exitosamente en GourmetJobs.</p>
        
            <div style="text-align: center; margin: 30px 0;">
              <a href="${setupUrl}" style="background-color: #fb5424; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Configurar Contraseña</a>
            </div>
            <p><strong>Importante:</strong> Por favor, cambia tu contraseña después de iniciar sesión por primera vez.</p>
            <p>Saludos,<br>El equipo de GourmetJobs</p>
          </div>
        `
      });
      
    } catch (emailError) {
      console.error('❌ Exception while sending email:', emailError);
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
    
    if (!id) {
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
      return res.status(404).json({
        success: false,
        message: 'User not found or not associated with this restaurant'
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        name: name || undefined,
        email: email || undefined,
        phoneNumber: phoneNumber || undefined
      }
    });

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
      return res.status(404).json({
        success: false,
        message: 'User not found or not associated with this restaurant'
      });
    }

    if (restaurantUser.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete the restaurant owner (admin user)'
      });
    }

    await prisma.restaurantUser.delete({
      where: { id: restaurantUser.id }
    });

    await prisma.user.delete({
      where: { id: parseInt(id) }
    });

  
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

// GET /admin/total-counts - Get total counts for dashboard
router.get('/total-counts', async (req, res) => {
  const startTime = Date.now();
  console.log('[METRICS] Starting /admin/total-counts request');
  
  try {
    // Calculate 48 hours ago timestamp
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    console.log('[METRICS] 48 hours ago timestamp:', fortyEightHoursAgo.toISOString());

    // Try to get jobsWithNoApplicationsAfter48h, but handle if createdAt doesn't exist yet
    let jobsWithNoApplicationsAfter48h = 0;
    try {
      console.log('[METRICS] Fetching jobsWithNoApplicationsAfter48h...');
      jobsWithNoApplicationsAfter48h = await prisma.jobOffer.count({
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
      console.log('[METRICS] jobsWithNoApplicationsAfter48h:', jobsWithNoApplicationsAfter48h);
    } catch (error) {
      // JobOffer.createdAt field doesn't exist yet - migration not applied
      console.warn('[METRICS] JobOffer.createdAt field does not exist. Error:', error.message);
      console.warn('[METRICS] Will return 0 until migration is applied.');
      jobsWithNoApplicationsAfter48h = 0;
    }

    const [
      registeredCompanies,
      registeredProfessionals,
      publishedOffers,
      totalApplications,
      professionalUsers,
      adminCompanyUsers,
      activeProfessionals,
      workersWhoNeverCameBack
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
      // Query from Employee since it has direct relation to applications
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

    // Calculate percentage of finished profiles that take action
    const activeProfessionalsCount = activeProfessionals || 0;
    const registeredProfessionalsCount = registeredProfessionals || 0;
    const activeProfessionalsPercentage = registeredProfessionalsCount > 0 
      ? Math.round((activeProfessionalsCount / registeredProfessionalsCount) * 100) 
      : 0;

    // Calculate average time metrics (same as /metrics endpoint)
    console.log('[METRICS] Calculating average time metrics...');
    let avgSignupToProfileDays = null;
    let avgProfileToApplicationDays = null;
    let avgSignupToRestaurantDays = null;
    let avgRestaurantToJobDays = null;

    try {
      console.log('[METRICS] Fetching avgSignupToProfileDays...');
      const signupToProfileResult = await prisma.$queryRaw`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (e."createdAt" - u."createdAt"))) / 86400 as avg_days
        FROM "User" u
        INNER JOIN "Employee" e ON e."userId" = u.id
        WHERE u."userType" = 'profesionales'
          AND e."createdAt" IS NOT NULL
      `;
      
      if (signupToProfileResult && signupToProfileResult[0]?.avg_days !== null) {
        avgSignupToProfileDays = Math.round(parseFloat(signupToProfileResult[0].avg_days) * 10) / 10;
        console.log('[METRICS] avgSignupToProfileDays:', avgSignupToProfileDays);
      } else {
        console.log('[METRICS] avgSignupToProfileDays: No data available (null result)');
      }
    } catch (error) {
      console.warn('[METRICS] Employee.createdAt field does not exist. Error:', error.message);
      console.warn('[METRICS] Add createdAt to Employee model for this metric.');
    }

    try {
      console.log('[METRICS] Fetching avgProfileToApplicationDays...');
      const profileToApplicationResult = await prisma.$queryRaw`
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
      
      if (profileToApplicationResult && profileToApplicationResult[0]?.avg_days !== null) {
        avgProfileToApplicationDays = Math.round(parseFloat(profileToApplicationResult[0].avg_days) * 10) / 10;
        console.log('[METRICS] avgProfileToApplicationDays:', avgProfileToApplicationDays);
      } else {
        console.log('[METRICS] avgProfileToApplicationDays: No data available (null result)');
      }
    } catch (error) {
      console.warn('[METRICS] Employee.createdAt or Application.createdAt fields do not exist. Error:', error.message);
      console.warn('[METRICS] Add createdAt to both models for this metric.');
    }

    try {
      console.log('[METRICS] Fetching avgSignupToRestaurantDays...');
      const signupToRestaurantResult = await prisma.$queryRaw`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (r."createdAt" - u."createdAt"))) / 86400 as avg_days
        FROM "User" u
        INNER JOIN "Restaurant" r ON r."userId" = u.id
        WHERE u."userType" = 'empresas'
          AND r."createdAt" IS NOT NULL
      `;
      
      if (signupToRestaurantResult && signupToRestaurantResult[0]?.avg_days !== null) {
        avgSignupToRestaurantDays = Math.round(parseFloat(signupToRestaurantResult[0].avg_days) * 10) / 10;
        console.log('[METRICS] avgSignupToRestaurantDays:', avgSignupToRestaurantDays);
      } else {
        console.log('[METRICS] avgSignupToRestaurantDays: No data available (null result)');
      }
    } catch (error) {
      console.warn('[METRICS] Restaurant.createdAt field does not exist. Error:', error.message);
      console.warn('[METRICS] Add createdAt to Restaurant model for this metric.');
    }

    try {
      console.log('[METRICS] Fetching avgRestaurantToJobDays...');
      const restaurantToJobResult = await prisma.$queryRaw`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (
            (SELECT MIN(j."createdAt") FROM "JobOffer" j WHERE j."restaurantId" = r.id) - r."createdAt"
          ))) / 86400 as avg_days
        FROM "Restaurant" r
        WHERE r."createdAt" IS NOT NULL
          AND EXISTS (SELECT 1 FROM "JobOffer" j WHERE j."restaurantId" = r.id AND j."createdAt" IS NOT NULL)
      `;
      
      if (restaurantToJobResult && restaurantToJobResult[0]?.avg_days !== null) {
        avgRestaurantToJobDays = Math.round(parseFloat(restaurantToJobResult[0].avg_days) * 10) / 10;
        console.log('[METRICS] avgRestaurantToJobDays:', avgRestaurantToJobDays);
      } else {
        console.log('[METRICS] avgRestaurantToJobDays: No data available (null result)');
      }
    } catch (error) {
      console.warn('[METRICS] Restaurant.createdAt or JobOffer.createdAt fields do not exist. Error:', error.message);
      console.warn('[METRICS] Add createdAt to both models for this metric.');
    }

    const totalCounts = {
      registeredCompanies: (registeredCompanies || 0) + (adminCompanyUsers || 0),
      // registeredProfessionals = Users with userType 'profesionales' who created Employee profile
      registeredProfessionals: registeredProfessionalsCount,
      publishedOffers: publishedOffers || 0,
      totalApplications: totalApplications || 0,
      totalConversations: totalConversations || 0,
      breakdown: {
        restaurantProfiles: registeredCompanies || 0,
        adminCompanyUsers: adminCompanyUsers || 0,
        professionalProfiles: registeredProfessionalsCount,
        professionalUsers: professionalUsers || 0,
        // Workers: Professional users with completed profiles who applied to ≥1 job
        activeProfessionals: activeProfessionalsCount,
        activeProfessionalsPercentage: activeProfessionalsPercentage,
        // Average time metrics (requires createdAt on Employee and Application)
        avgSignupToProfileDays: avgSignupToProfileDays,
        avgProfileToApplicationDays: avgProfileToApplicationDays,
        // Average time metrics for companies (requires createdAt fields on Restaurant and JobOffer)
        avgSignupToRestaurantDays: avgSignupToRestaurantDays,
        avgRestaurantToJobDays: avgRestaurantToJobDays,
        // Urgent metrics
        jobsWithNoApplicationsAfter48h: jobsWithNoApplicationsAfter48h || 0,
        workersWhoNeverCameBack: workersWhoNeverCameBack || 0
      }
    };

    const executionTime = Date.now() - startTime;
    console.log('[METRICS] Calculated activeProfessionalsPercentage:', activeProfessionalsPercentage + '%');
    console.log('[METRICS] Total execution time:', executionTime + 'ms');
    console.log('[METRICS] Successfully returning total counts');

    res.status(200).json({ 
      success: true,
      data: totalCounts 
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('[METRICS] Error fetching total counts after', executionTime + 'ms');
    console.error('[METRICS] Error details:', error);
    console.error('[METRICS] Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /admin/metrics - Legacy endpoint for compatibility
router.get('/metrics', async (req, res) => {
  const startTime = Date.now();
  console.log('[METRICS] Starting /admin/metrics request');
  
  try {
    // Calculate 48 hours ago timestamp
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    console.log('[METRICS] 48 hours ago timestamp:', fortyEightHoursAgo.toISOString());

    // Try to get jobsWithNoApplicationsAfter48h, but handle if createdAt doesn't exist yet
    let jobsWithNoApplicationsAfter48h = 0;
    try {
      console.log('[METRICS] Fetching jobsWithNoApplicationsAfter48h...');
      jobsWithNoApplicationsAfter48h = await prisma.jobOffer.count({
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
      console.log('[METRICS] jobsWithNoApplicationsAfter48h:', jobsWithNoApplicationsAfter48h);
    } catch (error) {
      // JobOffer.createdAt field doesn't exist yet - migration not applied
      console.warn('[METRICS] JobOffer.createdAt field does not exist. Error:', error.message);
      console.warn('[METRICS] Will return 0 until migration is applied.');
      jobsWithNoApplicationsAfter48h = 0;
    }

    console.log('[METRICS] Fetching main metrics in parallel...');
    const [
      registeredCompanies,
      registeredProfessionals,
      publishedOffers,
      totalApplications,
      professionalUsers,
      adminCompanyUsers,
      activeProfessionals,
      workersWhoNeverCameBack
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
      // Query from Employee since it has direct relation to applications
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

    console.log('[METRICS] Main metrics fetched:');
    console.log('[METRICS]   - registeredCompanies:', registeredCompanies);
    console.log('[METRICS]   - registeredProfessionals:', registeredProfessionals);
    console.log('[METRICS]   - publishedOffers:', publishedOffers);
    console.log('[METRICS]   - totalApplications:', totalApplications);
    console.log('[METRICS]   - professionalUsers:', professionalUsers);
    console.log('[METRICS]   - adminCompanyUsers:', adminCompanyUsers);
    console.log('[METRICS]   - activeProfessionals:', activeProfessionals);
    console.log('[METRICS]   - workersWhoNeverCameBack:', workersWhoNeverCameBack);

    // Calculate percentage of finished profiles that take action
    const activeProfessionalsCount = activeProfessionals || 0;
    const registeredProfessionalsCount = registeredProfessionals || 0;
    const activeProfessionalsPercentage = registeredProfessionalsCount > 0 
      ? Math.round((activeProfessionalsCount / registeredProfessionalsCount) * 100) 
      : 0;

    console.log('[METRICS] Calculating average time metrics...');
    let avgSignupToProfileDays = null;
    let avgProfileToApplicationDays = null;
    let avgSignupToRestaurantDays = null;
    let avgRestaurantToJobDays = null;

    try {
      console.log('[METRICS] Fetching avgSignupToProfileDays...');
      const signupToProfileResult = await prisma.$queryRaw`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (e."createdAt" - u."createdAt"))) / 86400 as avg_days
        FROM "User" u
        INNER JOIN "Employee" e ON e."userId" = u.id
        WHERE u."userType" = 'profesionales'
          AND e."createdAt" IS NOT NULL
      `;
      
      if (signupToProfileResult && signupToProfileResult[0]?.avg_days !== null) {
        avgSignupToProfileDays = Math.round(parseFloat(signupToProfileResult[0].avg_days) * 10) / 10;
        console.log('[METRICS] avgSignupToProfileDays:', avgSignupToProfileDays);
      } else {
        console.log('[METRICS] avgSignupToProfileDays: No data available (null result)');
      }
    } catch (error) {
      // Employee.createdAt field doesn't exist - need to add it via migration
      console.warn('[METRICS] Employee.createdAt field does not exist. Error:', error.message);
      console.warn('[METRICS] Add createdAt to Employee model for this metric.');
    }

    try {
      console.log('[METRICS] Fetching avgProfileToApplicationDays...');
      const profileToApplicationResult = await prisma.$queryRaw`
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
      
      if (profileToApplicationResult && profileToApplicationResult[0]?.avg_days !== null) {
        avgProfileToApplicationDays = Math.round(parseFloat(profileToApplicationResult[0].avg_days) * 10) / 10;
        console.log('[METRICS] avgProfileToApplicationDays:', avgProfileToApplicationDays);
      } else {
        console.log('[METRICS] avgProfileToApplicationDays: No data available (null result)');
      }
    } catch (error) {
      // Employee.createdAt or Application.createdAt fields don't exist
      console.warn('[METRICS] Employee.createdAt or Application.createdAt fields do not exist. Error:', error.message);
      console.warn('[METRICS] Add createdAt to both models for this metric.');
    }

    try {
      console.log('[METRICS] Fetching avgSignupToRestaurantDays...');
      const signupToRestaurantResult = await prisma.$queryRaw`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (r."createdAt" - u."createdAt"))) / 86400 as avg_days
        FROM "User" u
        INNER JOIN "Restaurant" r ON r."userId" = u.id
        WHERE u."userType" = 'empresas'
          AND r."createdAt" IS NOT NULL
      `;
      
      if (signupToRestaurantResult && signupToRestaurantResult[0]?.avg_days !== null) {
        avgSignupToRestaurantDays = Math.round(parseFloat(signupToRestaurantResult[0].avg_days) * 10) / 10;
        console.log('[METRICS] avgSignupToRestaurantDays:', avgSignupToRestaurantDays);
      } else {
        console.log('[METRICS] avgSignupToRestaurantDays: No data available (null result)');
      }
    } catch (error) {
      console.warn('[METRICS] Restaurant.createdAt field does not exist. Error:', error.message);
      console.warn('[METRICS] Add createdAt to Restaurant model for this metric.');
    }

    try {
      console.log('[METRICS] Fetching avgRestaurantToJobDays...');
      const restaurantToJobResult = await prisma.$queryRaw`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (
            (SELECT MIN(j."createdAt") FROM "JobOffer" j WHERE j."restaurantId" = r.id) - r."createdAt"
          ))) / 86400 as avg_days
        FROM "Restaurant" r
        WHERE r."createdAt" IS NOT NULL
          AND EXISTS (SELECT 1 FROM "JobOffer" j WHERE j."restaurantId" = r.id AND j."createdAt" IS NOT NULL)
      `;
      
      if (restaurantToJobResult && restaurantToJobResult[0]?.avg_days !== null) {
        avgRestaurantToJobDays = Math.round(parseFloat(restaurantToJobResult[0].avg_days) * 10) / 10;
        console.log('[METRICS] avgRestaurantToJobDays:', avgRestaurantToJobDays);
      } else {
        console.log('[METRICS] avgRestaurantToJobDays: No data available (null result)');
      }
    } catch (error) {
      console.warn('[METRICS] Restaurant.createdAt or JobOffer.createdAt fields do not exist. Error:', error.message);
      console.warn('[METRICS] Add createdAt to both models for this metric.');
    }

    const executionTime = Date.now() - startTime;
    console.log('[METRICS] Calculated activeProfessionalsPercentage:', activeProfessionalsPercentage + '%');
    console.log('[METRICS] Total execution time:', executionTime + 'ms');
    console.log('[METRICS] Successfully returning metrics');

    res.json({
      registeredCompanies: (registeredCompanies || 0) + (adminCompanyUsers || 0),
      // registeredProfessionals = Users with userType 'profesionales' who created Employee profile
      registeredProfessionals: registeredProfessionalsCount,
      publishedOffers: publishedOffers || 0,
      totalApplications: totalApplications || 0,
      totalConversations: totalConversations || 0,
      breakdown: {
        restaurantProfiles: registeredCompanies || 0,
        adminCompanyUsers: adminCompanyUsers || 0,
        professionalProfiles: registeredProfessionalsCount,
        professionalUsers: professionalUsers || 0,
        // Workers: Professional users with completed profiles who applied to ≥1 job
        activeProfessionals: activeProfessionalsCount,
        activeProfessionalsPercentage: activeProfessionalsPercentage,
        // Average time metrics (requires createdAt fields on Employee and Application)
        avgSignupToProfileDays: avgSignupToProfileDays,
        avgProfileToApplicationDays: avgProfileToApplicationDays,
        // Average time metrics for companies (requires createdAt fields on Restaurant and JobOffer)
        avgSignupToRestaurantDays: avgSignupToRestaurantDays,
        avgRestaurantToJobDays: avgRestaurantToJobDays,
        // Urgent metrics
        jobsWithNoApplicationsAfter48h: jobsWithNoApplicationsAfter48h || 0,
        workersWhoNeverCameBack: workersWhoNeverCameBack || 0
      }
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('[METRICS] Error fetching metrics after', executionTime + 'ms');
    console.error('[METRICS] Error details:', error);
    console.error('[METRICS] Error stack:', error.stack);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

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


router.post('/unflag-user', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

  
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
        phoneNumber: true,
        userType: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        accountLocked: true,
        mfaEnabled: true,
        employee: {
          select: {
            id: true
          }
        }
      },
      orderBy: {
        id: 'desc' // Order by ID desc to show newest users first (IDs are auto-incrementing)
      }
    });

    // Map users to include hasEmployeeProfile flag
    const usersWithProfileInfo = users.map(user => ({
      ...user,
      hasEmployeeProfile: user.userType === 'profesionales' ? (user.employee !== null) : null
    }));

    console.log(`🔍 [Admin All Users] Found ${usersWithProfileInfo.length} filtered users`);
    console.log('🔍 [Admin All Users] Users:', usersWithProfileInfo.map(u => ({ id: u.id, email: u.email, userType: u.userType, role: u.role, hasEmployeeProfile: u.hasEmployeeProfile })));

    res.status(200).json({
      success: true,
      users: usersWithProfileInfo,
      total: usersWithProfileInfo.length
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
router.delete('/delete-user', checkAdmin, getUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

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
          
          // For each job offer: delete dependent entities in correct order
          for (const jobOffer of jobOffers) {
            // Delete answers for applications linked to this job offer
            const applicationsForOffer = await tx.application.findMany({ where: { jobPostId: jobOffer.id } });
            for (const application of applicationsForOffer) {
              await tx.answer.deleteMany({ where: { applicationId: application.id } });
            }

            // Delete applications linked to this job offer
            await tx.application.deleteMany({ where: { jobPostId: jobOffer.id } });

            // Delete questions linked to this job offer
            await tx.question.deleteMany({ where: { jobOfferId: jobOffer.id } });
          }

          // Remove favourite jobs that reference any of these job offers
          const jobOfferIds = jobOffers.map((jo) => jo.id);
          if (jobOfferIds.length > 0) {
            await tx.favouriteJob.deleteMany({ where: { jobOfferId: { in: jobOfferIds } } });
          }
          
          // Delete locations first (they reference restaurant)
          await tx.location.deleteMany({ where: { restaurantId: restaurant.id } });

          // Delete messages for conversations tied to this restaurant, then conversations
          const conversationsForRestaurant = await tx.conversation.findMany({ where: { restaurantId: restaurant.id } });
          for (const conv of conversationsForRestaurant) {
            await tx.message.deleteMany({ where: { conversationId: conv.id } });
          }
          await tx.conversation.deleteMany({ where: { restaurantId: restaurant.id } });

          // Delete talent pool entries for this restaurant
          await tx.talentPool.deleteMany({ where: { restaurantId: restaurant.id } });

          // Delete restaurantUser links pointing to this restaurant (FK constraint)
          await tx.restaurantUser.deleteMany({ where: { restaurantId: restaurant.id } });

          // Finally delete remaining job offers for this restaurant and the restaurant itself
          await tx.jobOffer.deleteMany({ where: { restaurantId: restaurant.id } });
          await tx.restaurant.delete({ where: { id: restaurant.id } });
        }

        // Delete restaurant user relationships
        const restaurantUsers = await tx.restaurantUser.findMany({
          where: { userId: parseInt(userId) }
        });

        for (const restaurantUser of restaurantUsers) {
          // Get job offers created by this restaurant user
          const jobOffersByUser = await tx.jobOffer.findMany({ where: { restaurantUserId: restaurantUser.id } });

          // For each job offer: delete dependent entities in correct order
          for (const jobOffer of jobOffersByUser) {
            // Delete answers for applications linked to this job offer
            const applicationsForOffer = await tx.application.findMany({ where: { jobPostId: jobOffer.id } });
            for (const application of applicationsForOffer) {
              await tx.answer.deleteMany({ where: { applicationId: application.id } });
            }

            // Delete applications linked to this job offer
            await tx.application.deleteMany({ where: { jobPostId: jobOffer.id } });

            // Delete questions linked to this job offer
            await tx.question.deleteMany({ where: { jobOfferId: jobOffer.id } });
          }

          // Delete user's job posts after dependents are removed
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