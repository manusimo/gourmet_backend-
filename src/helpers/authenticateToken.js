import jwt from 'jsonwebtoken';

const checkUserType = (requiredUserType) => (req, res, next) => {
  const token = req.cookies.manu; 


  if (!token) {
    return res.status(401).json({ message: 'Debes crear tu perfil para usar la plataforma' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

  
    const userType = decodedToken.userType; 
   

    if (userType !== requiredUserType) {
      const errorMessage =
        requiredUserType === 'profesionales' || requiredUserType === 'employee'
          ? 'Access forbidden for non-professional/employee users'
          : 'Access forbidden for non-company/restaurant users';
      return res.status(403).json({ message: errorMessage });
    }

    req.userType = userType;
    next();
  } catch (error) {
    console.error('Error in checkUserType middleware:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const setUserType = () => (req, res, next) => {
  const token = req.cookies.manu; 
  console.log('setting the user type')
  
  if (!token) {
    return res.status(401).json({ message: 'JWT token is missing or undefined' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    console.log('this is the decoded token at user type', decodedToken)

    const userType = decodedToken.userType; 
   
    req.userType = userType;
    next();
  } catch (error) {
    console.error('Error in checkUserType middleware:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const checkUserRole = () => (req, res, next) => {
  const token = req.cookies.manu; 
  
  if (!token) {
    return res.status(401).json({ message: 'JWT token is missing or undefined' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
  
    const userRole = decodedToken.role; 
  
    if (!userRole) {
      return res.status(401).json({ message: 'User role is missing in the token' });
    }

    req.userRole = userRole;
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
const setUserRole = checkUserRole()

export { checkUserType, checkEmployee, checkCompany, setUserRole, setUserType};
