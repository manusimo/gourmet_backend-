import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

const getRestaurantIdFromCookie = (req, res, next) => {
  const token = req.cookies.manu;  

  if (!token) {
    return res.status(401).json({ message: 'Entra a tu cuenta para usar la plataforma' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);  
    
    const restaurantId = decodedToken.restaurantId;  
   
    req.restaurantId = restaurantId;
    next();  
  } catch (error) {
    console.error('Error in getRestaurantIdFromCookie middleware:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getEmployeeIdFromCookie = (req, res, next) => {
  const token = req.cookies.manu; 
 
  if (!token) {
    return res.status(401).json({ message: 'Entra o crea una cuenta para usar la plataforma' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    console.log('this is the decoded token employeee id', decodedToken)
  
    const employeeId = decodedToken.employeeId; 
  
    req.employeeId = employeeId; 
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getUserIdFromCookie = (req, res, next) => {
    const token = req.cookies.manu; 

    if (!token) {
      return res.status(401).json({ message: 'Entra o crea una cuenta para usar la plataforma' });
    }

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
   
      const userId = decodedToken.userId; 
      const userType = decodedToken.userType;

      req.userId = userId; 
      req.userType = userType
      next();
    } catch (error) {
      console.error('Error in getEmployeeIdFromCookie middleware:', error);
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      res.status(500).json({ message: 'Internal Server Error' });
    }
}

const getRestaurantUserIdFromCookie = (req, res, next) => {
  const token = req.cookies.manu; 

  if (!token) {
    return res.status(401).json({ message: 'Entra o crea una cuenta para usar la plataforma' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const restaurantUserId = decodedToken.restaurantUserId; 
    req.restaurantUserId = restaurantUserId; 
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

const validateTokenAndIdentifyUser = (req, res, next) => {
  try {
    const token = req.cookies.manu 
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decodedToken = validateToken(token); 
    identifyUser(decodedToken, req);

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

export { 
  getRestaurantIdFromCookie, 
  validateTokenAndIdentifyUser,
  getEmployeeIdFromCookie, 
  getUserIdFromCookie, 
  getRestaurantUserIdFromCookie, 
  optionalAuth,
};
