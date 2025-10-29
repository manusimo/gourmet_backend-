const jwt = require('jsonwebtoken');

const checkUserType = (requiredUserType) => (req, res, next) => {
  const token = req.cookies.manu;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized. Token missing.' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    
    console.log(`🔍 checkUserType: Required userType: ${requiredUserType}`);
    console.log(`🔍 checkUserType: Decoded token:`, decodedToken);
  
    const userType = decodedToken.userType; 
    console.log(`🔍 checkUserType: User userType from token: ${userType}`);

    if (userType !== requiredUserType) {
      console.log(`❌ checkUserType: Access denied. User has userType '${userType}' but '${requiredUserType}' is required`);
      const errorMessage =
        requiredUserType === 'empresas' 
          ? 'Access forbidden for non-company/restaurant users'
          : 'Access denied';
      return res.status(403).json({ message: errorMessage });
    }

    console.log(`✅ checkUserType: Access granted for userType '${userType}'`);
    req.userId = decodedToken.userId;
    req.userType = decodedToken.userType;
    req.userRole = decodedToken.role;
    req.restaurantId = decodedToken.restaurantId;
    req.restaurantUserId = decodedToken.restaurantUserId;
    next();
  } catch (error) {
    console.error('JWT Error in checkUserType:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

const checkUserRole = () => (req, res, next) => {
  try {
    const token = req.cookies.manu;
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized. Token missing.' });
    }
    
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    req.userRole = decodedToken.role;
    console.log('🔍 setUserRole: User role set to:', req.userRole);
    next();
  } catch (error) {
    console.error('Error in checkUserRole middleware:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const checkEmployee = checkUserType('profesionales');
const checkCompany = checkUserType('empresas');
const checkAdmin = checkUserType('admin');
const setUserRole = checkUserRole()

module.exports = { checkEmployee, checkCompany, checkAdmin, setUserRole };
