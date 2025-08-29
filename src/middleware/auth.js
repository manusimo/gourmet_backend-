const jwt = require('jsonwebtoken');
const { prisma } = require('../db.js');
const { isTokenBlacklisted } = require('./security.js');

// ============================================================================
// TOKEN VALIDATION WITH BLACKLIST CHECK
// ============================================================================

/**
 * Enhanced token validation with blacklist checking
 */
const validateTokenAndIdentifyUser = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided or invalid format'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if token is blacklisted
    if (isTokenBlacklisted(token)) {
      console.log(`🔒 Blacklisted token attempted access: ${token.substring(0, 20)}...`);
      return res.status(401).json({
        success: false,
        message: 'Token has been invalidated',
        error: 'TOKEN_BLACKLISTED'
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired',
          error: 'TOKEN_EXPIRED'
        });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          error: 'INVALID_TOKEN'
        });
      }
      throw error;
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        userType: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
        error: 'USER_NOT_FOUND'
      });
    }

    // Add user information to request
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userType = decoded.userType;
    req.user = user;
    req.token = token;

    next();

  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token provided, continue without authentication
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    if (isTokenBlacklisted(token)) {
      return next(); // Treat blacklisted token as no authentication
    }

    // Verify JWT token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Verify user still exists
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          userType: true
        }
      });

      if (user) {
        req.userId = decoded.userId;
        req.userEmail = decoded.email;
        req.userType = decoded.userType;
        req.user = user;
        req.token = token;
      }
    } catch (error) {
      // Token invalid or expired, continue without authentication
    }

    next();

  } catch (error) {
    console.error('Optional auth error:', error);
    next(); // Continue without authentication on error
  }
};

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

/**
 * Check if user is an employee
 */
const checkEmployee = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: req.userId },
      select: { id: true, userId: true }
    });

    if (!employee) {
      return res.status(403).json({
        success: false,
        message: 'Employee access required'
      });
    }

    req.employeeId = employee.id;
    next();

  } catch (error) {
    console.error('Employee check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};

/**
 * Check if user is a company/restaurant
 */
const checkCompany = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: req.userId },
      select: { id: true, userId: true }
    });

    if (!restaurant) {
      return res.status(403).json({
        success: false,
        message: 'Company access required'
      });
    }

    req.restaurantId = restaurant.id;
    next();

  } catch (error) {
    console.error('Company check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};

/**
 * Set user role from database based on restaurant association
 */
const setUserRole = async (req, res, next) => {
  try {
    if (!req.userId) {
      console.log('❌ setUserRole: Missing userId');
      req.role = 'user'; // Fallback role
      return next();
    }

    // If no restaurantId, use the role from the token (for users creating their first restaurant)
    if (!req.restaurantId) {
      console.log('🔍 setUserRole: No restaurantId, using role from token');
      // The role should already be set from the token in getUserIdFromCookie
      if (!req.role) {
        req.role = 'user'; // Fallback role
      }
      console.log(`✅ setUserRole: Using role from token: '${req.role}'`);
      return next();
    }

    // Get the user's role from their restaurant association
    const restaurantUser = await prisma.restaurantUser.findFirst({
      where: {
        userId: req.userId,
        restaurantId: req.restaurantId
      },
      select: {
        role: true
      }
    });

    if (restaurantUser) {
      req.role = restaurantUser.role;
      console.log(`✅ setUserRole: User role set to '${restaurantUser.role}' from restaurant association`);
    } else {
      // If no restaurant association found, check if this is the restaurant owner
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { role: true }
      });
      
      if (user && user.role === 'admin') {
        req.role = 'admin';
        console.log('✅ setUserRole: User role set to admin (restaurant owner)');
      } else {
        req.role = 'user'; // Fallback role
        console.log('⚠️ setUserRole: No role found, defaulting to user');
      }
    }

    next();
  } catch (error) {
    console.error('❌ Error in setUserRole:', error);
    req.role = 'user'; // Fallback role
    next();
  }
};

/**
 * Set user type from token/database
 */
const setUserType = (req, res, next) => {
  try {
    if (req.userType) {
      req.type = req.userType;
    } else if (req.role) {
      req.type = req.role;
    } else {
      req.type = 'guest';
    }
    next();
  } catch (error) {
    console.error('Set user type error:', error);
    next();
  }
};

// ============================================================================
// PLAN-BASED ACCESS CONTROL
// ============================================================================

/**
 * Require specific plan for access
 */
const requirePlan = (requiredPlan) => {
  return async (req, res, next) => {
    try {
      if (!req.userId || !req.restaurantId) {
        return res.status(403).json({
          success: false,
          message: 'Restaurant access required'
        });
      }

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: req.restaurantId },
        select: { currentPlan: true }
      });

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found'
        });
      }

      const planHierarchy = ['free', 'starter', 'professional', 'enterprise'];
      const userPlanIndex = planHierarchy.indexOf(restaurant.currentPlan);
      const requiredPlanIndex = planHierarchy.indexOf(requiredPlan);

      if (userPlanIndex < requiredPlanIndex) {
        return res.status(403).json({
          success: false,
          message: `${requiredPlan} plan required for this feature`,
          currentPlan: restaurant.currentPlan,
          requiredPlan: requiredPlan
        });
      }

      next();

    } catch (error) {
      console.error('Plan check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal Server Error'
      });
    }
  };
};

/**
 * Check location limit based on plan
 */
const checkLocationLimit = async (req, res, next) => {
  try {
    if (!req.restaurantId) {
      return next();
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.restaurantId },
      include: { locations: true },
      select: {
        currentPlan: true,
        locations: true
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    const planLimits = {
      free: 1,
      starter: 3,
      professional: 10,
      enterprise: -1 // unlimited
    };

    const limit = planLimits[restaurant.currentPlan] || 1;
    
    if (limit > 0 && restaurant.locations.length >= limit) {
      return res.status(403).json({
        success: false,
        message: `Location limit reached for ${restaurant.currentPlan} plan`,
        currentLocations: restaurant.locations.length,
        limit: limit
      });
    }

    next();

  } catch (error) {
    console.error('Location limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};

/**
 * Check job offer limit based on plan
 */
const checkJobOfferLimit = async (req, res, next) => {
  try {
    if (!req.restaurantId) {
      return next();
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.restaurantId },
      include: { 
        jobOffers: {
          where: { isActive: true }
        }
      },
      select: {
        currentPlan: true,
        jobOffers: true
      }
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    const planLimits = {
      free: 2,
      starter: 10,
      professional: 50,
      enterprise: -1 // unlimited
    };

    const limit = planLimits[restaurant.currentPlan] || 2;
    
    if (limit > 0 && restaurant.jobOffers.length >= limit) {
      return res.status(403).json({
        success: false,
        message: `Job offer limit reached for ${restaurant.currentPlan} plan`,
        currentJobOffers: restaurant.jobOffers.length,
        limit: limit
      });
    }

    next();

  } catch (error) {
    console.error('Job offer limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};

/**
 * Require specific roles middleware - more flexible than requireAdmin
 */
const requireRole = (allowedRoles) => {
  // If a single role is passed as string, convert to array
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    console.log('🔐 SECURITY CHECK - requireRole middleware:');
    console.log(`   Required roles: ${rolesArray.join(', ')}`);
    console.log(`   User role: ${req.role}`);
    console.log(`   User ID: ${req.userId}`);
    console.log(`   User Type: ${req.userType}`);
    
    if (!req.role || !rolesArray.includes(req.role)) {
      console.log(`❌ ACCESS DENIED - User has role '${req.role}' but requires one of: ${rolesArray.join(', ')}`);
      return res.status(403).json({ 
        success: false,
        message: `Access forbidden. Required role: ${rolesArray.join(' or ')}`,
        userRole: req.role,
        requiredRoles: rolesArray
      });
    }
    
    console.log(`✅ ACCESS GRANTED - User role '${req.role}' matches required roles`);
    next();
  };
};

/**
 * Check specific permissions middleware - for fine-grained control
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    console.log(`🔍 requirePermission: Checking for permission: ${permission}`);
    console.log(`🔍 requirePermission: User role: ${req.role}`);
    
    // Define role-based permissions
    const rolePermissions = {
      admin: ['create_company', 'edit_company', 'delete_company', 'manage_users', 'view_analytics'],
      manager: ['create_company', 'edit_company', 'manage_staff'],
      staff: ['view_company', 'edit_profile'],
      user: ['view_public']
    };
    
    const userPermissions = rolePermissions[req.role] || [];
    
    if (!userPermissions.includes(permission)) {
      console.log(`❌ requirePermission: Access denied. User role '${req.role}' lacks permission '${permission}'`);
      return res.status(403).json({ 
        success: false,
        message: `Access forbidden. Missing permission: ${permission}` 
      });
    }
    
    console.log(`✅ requirePermission: Access granted for permission '${permission}'`);
    next();
  };
};

/**
 * Log authentication events for security monitoring
 */
const logAuthEvent = (eventType) => {
  return (req, res, next) => {
    console.log(`🔐 Auth Event: ${eventType}`, {
      userId: req.userId,
      userType: req.userType,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    next();
  };
};

module.exports = {
  validateTokenAndIdentifyUser,
  optionalAuth,
  checkEmployee,
  checkCompany,
  setUserRole,
  setUserType,
  requirePlan,
  checkLocationLimit,
  checkJobOfferLimit,
  requireRole,
  requirePermission,
  logAuthEvent
}; 