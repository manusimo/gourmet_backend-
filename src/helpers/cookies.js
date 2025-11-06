const jwt = require('jsonwebtoken');
const { prisma } = require('../db.js');

const getAuthFromCookie = (req, res, next) => {
  console.log('🔍 getAuthFromCookie called');
  console.log('🔍 Request cookies:', req.cookies);
  
  // Try to get token from cookie first (preferred for desktop)
  let token = req.cookies.manu;
  console.log('🔍 Manu cookie exists:', !!token);
  
  // Fallback to Authorization header for mobile browsers that block third-party cookies
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
      console.log('🔍 Token found in Authorization header (mobile fallback)');
    }
  }

  if (!token) {
    console.log('❌ No manu cookie or Authorization header found');
    return res.status(401).json({ message: 'Entra a tu cuenta para usar la plataforma' });
  }

  try {
    console.log('🔍 Verifying JWT token...');
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);  
    console.log('🔍 Token decoded successfully:', {
      userId: decodedToken.userId,
      userType: decodedToken.userType,
      role: decodedToken.role,
      restaurantId: decodedToken.restaurantId,
      restaurantUserId: decodedToken.restaurantUserId,
      employeeId: decodedToken.employeeId
    });
    
    // Extract everything from JWT token
    req.userId = decodedToken.userId;
    req.userType = decodedToken.userType;
    req.role = decodedToken.role;
    req.restaurantId = decodedToken.restaurantId;
    req.restaurantUserId = decodedToken.restaurantUserId;
    req.employeeId = decodedToken.employeeId;
   
    console.log('🔍 Request object updated with user info');
    next();  
  } catch (error) {
    console.error('❌ Error in getAuthFromCookie middleware:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getEmployeeIdFromCookie = async (req, res, next) => {
  // Try to get token from cookie first (preferred for desktop)
  let token = req.cookies.manu;
  
  // Fallback to Authorization header for mobile browsers that block third-party cookies
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    }
  } 
 
  if (!token) {
    return res.status(401).json({ message: 'Entra o crea una cuenta para usar la plataforma' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
  
    let employeeId = decodedToken.employeeId;
    
    // If employeeId is not in token, try to find it using userId
    if (!employeeId && decodedToken.userId) {
      console.log('🔍 employeeId not in token, looking up using userId:', decodedToken.userId);
      
      // Find employee record by userId
      const employee = await prisma.employee.findUnique({
        where: { userId: decodedToken.userId },
        select: { id: true }
      });
      
      if (employee) {
        employeeId = employee.id;
        console.log('✅ Found employeeId:', employeeId);
      } else {
        console.log('❌ No employee record found for userId:', decodedToken.userId);
        return res.status(404).json({ 
          success: false,
          message: 'Employee profile not found. Please create your profile first.' 
        });
      }
    }
  
    req.employeeId = employeeId; 
    next();
  } catch (error) {
    console.error('Error in getEmployeeIdFromCookie:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getUserIdFromCookie = async (req, res, next) => {
    console.log('🍪 getUserIdFromCookie - Checking authentication');
    console.log('🍪 Request cookies:', req.cookies);
    console.log('🍪 Manu cookie exists:', !!req.cookies.manu);
    
    // Try to get token from cookie first (preferred for desktop)
    let token = req.cookies.manu;
    
    // Fallback to Authorization header for mobile browsers that block third-party cookies
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Remove 'Bearer ' prefix
        console.log('🍪 Token found in Authorization header (mobile fallback)');
      }
    }

    if (!token) {
      console.log('🍪 No token found in cookies or Authorization header');
      return res.status(401).json({ message: 'Entra o crea una cuenta para usar la plataforma' });
    }

    console.log('🍪 Token found, verifying...');

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      console.log('🍪 Token decoded successfully:', { userId: decodedToken.userId, userType: decodedToken.userType, role: decodedToken.role });
   
      const userId = decodedToken.userId; 
      const userType = decodedToken.userType;    
      let role = decodedToken.role; // Extract role from JWT token

      // If role is not in token, get it from the database
      if (!role) {
        console.log('🍪 Role not in token, fetching from database...');
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true }
        });
        role = user ? user.role : 'user';
        console.log('🍪 Role from database:', role);
      }

      req.userId = userId; 
      req.userType = userType;
      req.role = role; // Set role from JWT token or database
      
      console.log('🍪 Authentication successful, proceeding to next middleware');
      next();
    } catch (error) {
      console.error('🍪 Error in getUserIdFromCookie middleware:', error);
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      res.status(500).json({ message: 'Internal Server Error' });
    }
}

const getRestaurantUserIdFromCookie = async (req, res, next) => {
  // Try to get token from cookie first (preferred for desktop)
  let token = req.cookies.manu;
  
  // Fallback to Authorization header for mobile browsers that block third-party cookies
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    }
  } 

  if (!token) {
    return res.status(401).json({ message: 'Entra o crea una cuenta para usar la plataforma' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    
    // For company users, check if they have a RestaurantUser record
    if (decodedToken.userType === 'empresas') {
      // Check if this user has a RestaurantUser record (staff member)
      const restaurantUser = await prisma.restaurantUser.findFirst({
        where: { userId: decodedToken.userId },
        select: { id: true }
      });
      
      if (restaurantUser) {
        // This is a staff member - they have a RestaurantUser record
        req.restaurantUserId = restaurantUser.id;
        console.log(`👥 Staff member detected, restaurantUserId: ${restaurantUser.id}`);
      } else {
        // This is the restaurant owner - create or find a RestaurantUser record for them
        const restaurant = await prisma.restaurant.findFirst({
          where: { userId: decodedToken.userId }
        });
        
        if (restaurant) {
          // Check if RestaurantUser record already exists for this admin
          let adminRestaurantUser = await prisma.restaurantUser.findFirst({
            where: {
              userId: decodedToken.userId,
              restaurantId: restaurant.id
            }
          });
          
          if (!adminRestaurantUser) {
            // Create a RestaurantUser record for the admin if it doesn't exist
            adminRestaurantUser = await prisma.restaurantUser.create({
              data: {
                userId: decodedToken.userId,
                restaurantId: restaurant.id,
                role: 'admin'
              }
            });
          }
          
          req.restaurantUserId = adminRestaurantUser.id;
          console.log(`👑 Restaurant owner/admin detected, created restaurantUserId: ${adminRestaurantUser.id}`);
        } else {
          req.restaurantUserId = undefined;
          console.log(`❌ Restaurant owner detected but no restaurant found`);
        }
      }
    } else {
      // For other user types, use the restaurantUserId from token if it exists
      req.restaurantUserId = decodedToken.restaurantUserId;
    }
    
    next();
  } catch (error) {
    console.error('Error in getRestaurantUserIdFromCookie middleware:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
}

const identifyUser = (decodedToken, req) => {
  req.userId = decodedToken.userId;
  req.userType = decodedToken.userType;

  if (decodedToken.employeeId) {
    req.employeeId = decodedToken.employeeId;
  }

  if (decodedToken.restaurantUserId) {
    req.restaurantUserId = decodedToken.restaurantUserId;
  }
};

const optionalAuth = (req, res, next) => {
  const token = req.cookies.manu; 

  if (!token) {
    return next();
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
   
    req.userId = decodedToken.userId; 
    req.userType = decodedToken.userType;

    next();
  } catch (error) {
    console.error('Error in optionalAuth middleware:', error);
    return next();
  }
};

const validateTokenAndIdentifyUser = async (req, res, next) => {
  try {
    const token = req.cookies.manu;
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decodedToken = validateToken(token);
    identifyUser(decodedToken, req);

    // For restaurant users, we need to look up the restaurantUserId if not in token
    if (decodedToken.userType === 'empresas' && !req.restaurantUserId) {
      console.log('🔍 Looking up restaurantUserId for user:', decodedToken.userId);
      
      const restaurantUser = await prisma.restaurantUser.findFirst({
        where: { userId: decodedToken.userId },
        select: { id: true }
      });
      
      if (restaurantUser) {
        req.restaurantUserId = restaurantUser.id;
        console.log('✅ Found restaurantUserId:', restaurantUser.id);
      } else {
        console.log('❌ No restaurantUser found for userId:', decodedToken.userId);
      }
    }

    // For professional users, we need to look up the employeeId if not in token
    if (decodedToken.userType === 'profesionales' && !req.employeeId) {
      console.log('🔍 Looking up employeeId for user:', decodedToken.userId);
      
      const employee = await prisma.employee.findFirst({
        where: { userId: decodedToken.userId },
        select: { id: true }
      });
      
      if (employee) {
        req.employeeId = employee.id;
        console.log('✅ Found employeeId:', employee.id);
      } else {
        console.log('❌ No employee found for userId:', decodedToken.userId);
      }
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const validateToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET); 
  } catch (error) {
    console.error('Error in token validation:', error);
    throw error;
  }
};

module.exports = {
  getAuthFromCookie, 
  getRestaurantIdFromCookie: getAuthFromCookie, // Alias for backward compatibility
  validateTokenAndIdentifyUser,
  getEmployeeIdFromCookie, 
  getUserIdFromCookie, 
  getRestaurantUserIdFromCookie, 
  optionalAuth,
};
