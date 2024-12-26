import { Router } from "express";
import { prisma } from "../db.js";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getRestaurantIdFromCookie, getUserIdFromCookie } from "../helpers/cookies.js";
import { checkEmployee, checkUserType, setUserRole, setUserType } from "../helpers/authenticateToken.js";
import { v4 as uuidv4 } from 'uuid';
import { sendEmail } from '../helpers/email.js'; 

const router = Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password, passwordConfirmation, userType, name, phoneNumber } = req.body;

    if (password !== passwordConfirmation) {
      return res.status(400).json({ message: 'Your passwords do not match' });
    }

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);


    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        userType,
        phoneNumber,
        name,
        role: 'admin', 
      },
    });

    const token = jwt.sign(
      {
        userId: newUser.id,
        email: newUser.email,
        userType: newUser.userType,
        role: newUser.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('manu', token, {
      httpOnly: true,
      sameSite: 'None',
      secure: true, 
    });

    try {
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      console.log(decodedToken);
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Invalid token' });
    }

    res.status(201).json({ message: 'User registered successfully and logged in' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        employee: true,
        restaurant: true,
        restaurantUsers: {
          include: {
            restaurant: true
          }
        },
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      userType: user.userType,
      role: user.role,
    };

    if (user.employee) {
      tokenPayload.employeeId = user.employee.id;
    }

    if (user.restaurantUsers.length > 0) {
      const restaurantUser = user.restaurantUsers[0]; 
      tokenPayload.restaurantId = restaurantUser.restaurantId;
      tokenPayload.restaurantUserId = restaurantUser.id;
    }

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.cookie('manu', token, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
    });

    let profileImageUrl = 'defaultImage.jpg';
    if (user.userType === 'profesionales' && user.employee) {
      profileImageUrl = user.employee.profileImageUrl;
    } else if (user.userType === 'empresas') {
      const restaurant = user.restaurant || user.restaurantUsers[0]?.restaurant;
      if (restaurant) {
        profileImageUrl = restaurant.profileImageUrl;
      }
    }

    res.status(200).json({ 
      message: 'Signin successful', 
      userType: user.userType, 
      profileImageUrl: profileImageUrl, 
      isAuthenticated: true 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies.manu;
    
    if (!token) {
      console.log('No token found, user is not logged in.');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    res.clearCookie('manu', {
      httpOnly: true, 
      sameSite: 'None', 
      secure: true, 
    });
    
    res.clearCookie('userInfo', {
      httpOnly: false, 
      sameSite: 'None', 
      secure: true, 
    });
    
  
    return res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Error during logout:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/users', getRestaurantIdFromCookie, async (req, res) => {
  const { restaurantId } = req;
  try {
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: {
        restaurantId:parseInt(restaurantId),

      },
      include: {
        user: true,
      },
    });
    res.json(restaurantUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: parseInt(id),
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/protected-route', async (req, res) => {
  res.status(200).json({ message: 'You are logged in and authorized to access this route' });
});

router.post('/admin/create-user', getRestaurantIdFromCookie, setUserRole, async (req, res) => {
  console.log('creating the staff user');
  const { email } = req.body;
  const { restaurantId, userRole } = req;
  const userType = 'empresas';
  
  console.log('Input values:', { email, userType, restaurantId, userRole });

  if (!email) {
    console.log('Error: Email is required');
    return res.status(400).json({ message: 'Email is required' });
  }

  if (userRole !== 'admin') {
    console.log('Error: Requires admin role');
    return res.status(400).json({ message: 'You need to be an admin to create new users' });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  }).catch(err => {
    console.error('Failed to fetch user:', err);
    return res.status(500).json({ message: 'Failed to check existing user' });
  });

  if (existingUser) {
    console.log('Error: User already exists');
    return res.status(409).json({ message: 'User already exists' });
  }

  console.log('creating the token for confirmation');
  const confirmationToken = jwt.sign({ email, userType, restaurantId }, process.env.JWT_SECRET, { expiresIn: '3min' });

  const confirmationLink = `http://localhost:3001/panel-empresa/confirm-email?token=${confirmationToken}`;
  const emailBody = `Welcome to our service! Please click on the link below to confirm your email and set your password. <a href="${confirmationLink}">Confirm Email</a>`;
  
  console.log('Preparing to send email');
  try {
    console.log('sending to this email', email)
    await sendEmail({
      to: email,
      subject: 'Welcome to Our Service - Confirm Your Email',
      text: 'Confirmation link is provided in the email.',
      html: `<p>${emailBody}</p>`,
    });
    console.log('Email sent successfully');
    res.status(201).json({ message: 'User created successfully. Confirmation email sent.' });
  } catch (error) {
    console.error('Failed to send email:', error);
    return res.status(500).json({ message: 'Failed to send confirmation email' });
  }
});

router.post('/set-password', async (req, res) => {
  console.log('Setting the new password');
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const { email, userType, restaurantId } = decodedToken;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        userType,
        role: 'staff'
      },
    });
    
    const newRestaurantUser = await prisma.restaurantUser.create({
      data: {
        userId: newUser.id,
        restaurantId,
        role: 'staff' 
      }
    });

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/check-login-status', getUserIdFromCookie, async (req, res) => {
  try {
    const { userId } = req; 

    if (!userId) {
      return res.status(401).json({ message: 'User not logged in', isLoggedIn: false });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        employee: true,
        restaurant: true,     // For restaurant owners
        restaurantUsers: {    // For staff members
          include: {
            restaurant: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found', isLoggedIn: false });
    }

    let profileImageUrl = 'No photo';
    if (user.userType === 'profesionales' && user.employee) {
      profileImageUrl = user.employee.profileImageUrl;
    } else if (user.userType === 'empresas') {
      const restaurant = user.restaurant || user.restaurantUsers[0]?.restaurant;
      if (restaurant) {
        profileImageUrl = restaurant.profileImageUrl;
      }
    }

    res.status(200).json({
      message: "User logged in",
      isAuthenticated: true,
      profileImageUrl,
      userType: user.userType
    });
  } catch (error) {
    console.error('Full error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/user-info', getUserIdFromCookie, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: req.userId,
      },
      include: {
        restaurantUsers: {
          where: {
            userId: req.userId, 
          },
        },
        employee: true, 
      },
    });

    const restaurantUserId = user.restaurantUsers.length > 0
      ? user.restaurantUsers[0].id
      : null;

    const responseData = { userId: user.id, restaurantUserId: restaurantUserId, employeeId: '' };

    if (user.userType === 'profesionales' && user.employee) {
      responseData.employeeId = user.employee.id; 
    }

    if (user) {
      res.json(responseData); 
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Failed to retrieve user:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    console.log('new password')
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = decodedToken;

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the user's password
    const updatedPassword = await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    console.log('updated pass', updatedPassword)

    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/reset-password-request', async (req, res) => {
  try {
    const { email } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const resetLink = `http://localhost:3001/reset-password?token=${resetToken}`;

    const emailBody = `Click the link below to reset your password:\n\n${resetLink}`;

    await sendEmail({
      to: email,
      subject: 'Password Reset Request',
      text: emailBody,
    });

    res.status(200).json({ message: 'Password reset link sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
