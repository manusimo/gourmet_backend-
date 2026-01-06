const jwt = require('jsonwebtoken');
const { prisma } = require('../db.js');

const getAuthFromCookie = (req, res, next) => {
 
  let token = req.cookies.manu;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); 
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Entra a tu cuenta para usar la plataforma' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);  
    
    req.userId = decodedToken.userId;
    req.userType = decodedToken.userType;
    req.role = decodedToken.role;
    req.restaurantId = decodedToken.restaurantId;
    req.restaurantUserId = decodedToken.restaurantUserId;
    req.employeeId = decodedToken.employeeId;
  
    next();  
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getEmployeeIdFromCookie = async (req, res, next) => {
  let token = req.cookies.manu;
 
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); 
    }
  } 
 
  if (!token) {
    return res.status(401).json({ message: 'Entra o crea una cuenta para usar la plataforma' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
  
    let employeeId = decodedToken.employeeId;
    
    if (!employeeId && decodedToken.userId) {
     
      const employee = await prisma.employee.findUnique({
        where: { userId: decodedToken.userId },
        select: { id: true }
      });
      
      if (employee) {
        employeeId = employee.id;
      } else {
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
    
    let token = req.cookies.manu;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return res.status(401).json({ message: 'Entra o crea una cuenta para usar la plataforma' });
    }

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
   
      const userId = decodedToken.userId; 
      const userType = decodedToken.userType;    
      let role = decodedToken.role; 

      if (!role) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true }
        });
        role = user ? user.role : 'user';
      }

      req.userId = userId; 
      req.userType = userType;
      req.role = role; 
    
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


module.exports = {
  getAuthFromCookie, 
  getRestaurantIdFromCookie: getAuthFromCookie, // Alias for backward compatibility
  getEmployeeIdFromCookie, 
  getUserIdFromCookie, 
  getRestaurantUserIdFromCookie, 
  optionalAuth,
};
