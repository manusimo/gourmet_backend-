import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

const getRestaurantIdFromCookie = (req, res, next) => {
  const token = req.cookies.manu;  

  if (!token) {
    console.log('JWT token is missing or undefined');
    return res.status(401).json({ message: 'JWT token is missing or undefined' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);  
    
    const restaurantId = decodedToken.restaurantId;  
   
    req.restaurantId = restaurantId;
    next();  // Pass the control to the next middleware/route handler
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
    return res.status(401).json({ message: 'JWT token is missing or undefined' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    console.log('this is the decoded token employeee id', decodedToken)
  
    const employeeId = decodedToken.employeeId; 
  
    req.employeeId = employeeId; 
    next();
  } catch (error) {
    console.error('Error in getEmployeeIdFromCookie middleware:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getUserIdFromCookie = (req, res, next) => {
    const token = req.cookies.manu; 

    if (!token) {
      return res.status(401).json({ message: 'JWT token is missing or undefined' });
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
  const token = req.cookies.manu; // Assuming the JWT token is stored in a cookie named 'manu'

  if (!token) {
    return res.status(401).json({ message: 'JWT token is missing or undefined' });
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


export { getRestaurantIdFromCookie, getEmployeeIdFromCookie, getUserIdFromCookie, getRestaurantUserIdFromCookie, optionalAuth  };
