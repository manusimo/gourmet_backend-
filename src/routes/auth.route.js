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
  const confirmationToken = jwt.sign({ email, userType, restaurantId }, process.env.JWT_SECRET, { expiresIn: '60min' });

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  const confirmationLink = `${baseUrl}/panel-empresa/confirm-email?token=${confirmationToken}`;
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
  const { token, password, name, phoneNumber } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required' });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const { email, userType, restaurantId } = decodedToken;

    // Check for existing user
    const existingUser = await prisma.user.findUnique({ 
      where: { email },
      include: {
        restaurantUsers: true
      }
    });

    let userId;

    if (existingUser) {
      // Check if already associated with this restaurant
      const existingRestaurantUser = existingUser.restaurantUsers.find(
        ru => ru.restaurantId === parseInt(restaurantId)
      );

      if (existingRestaurantUser) {
        return res.status(409).json({ 
          message: 'User already exists and is associated with this restaurant' 
        });
      }

      userId = existingUser.id;
    } else {
      // Create new User if doesn't exist
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          userType,
          role: 'staff',
          name: name || undefined,
          phoneNumber: phoneNumber || undefined,
        },
      });
      userId = newUser.id;
    }

    // Create RestaurantUser association
    const newRestaurantUser = await prisma.restaurantUser.create({
      data: {
        userId,
        restaurantId: parseInt(restaurantId),
        role: 'staff',
        // Remove name and phoneNumber from here since they should be in the User model
      }
    });

    res.status(200).json({ 
      message: existingUser 
        ? 'User associated with restaurant successfully' 
        : 'User created and associated successfully' 
    });
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
        restaurant: true,     
        restaurantUsers: {    
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
      userType: user.userType,
      role: user.role
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

    console.log('reseting the password for this email', email)

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

router.get('/chat-token', getUserIdFromCookie, async (req, res) => {

  try {
    const { userId } = req;
    
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        employee: true,
        restaurant: true,
        restaurantUsers: {
          include: {
            restaurant: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const chatTokenPayload = {
      userId: user.id,
      userType: user.userType,
      tokenType: 'socket',
      ...(user.employee && { employeeId: user.employee.id }),
      ...(user.restaurantUsers?.[0] && {
        restaurantUserId: user.restaurantUsers[0].id,
        restaurantId: user.restaurantUsers[0].restaurantId
      }),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60), 
      aud: 'chat',
      iss: process.env.NODE_ENV === 'production' ? process.env.JWT_ISSUER : 'localhost',   
    };

    const chatToken = jwt.sign(
      chatTokenPayload,
      process.env.JWT_SECRET
    );

    res.json({ token: chatToken });
  } catch (error) {
    console.error('Chat token generation error:', error);
    res.status(500).json({ message: 'Failed to generate chat token' });
  }
});

router.patch('/user/update', getUserIdFromCookie, async (req, res) => {
  try {
    const { userId } = req;
    const { email, name, phoneNumber } = req.body
    const numericUserId = typeof userId === 'string' ? parseInt(userId) : userId;

    if (email) {
      const emailUser = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          NOT: {
            id: numericUserId
          }
        }
      });

      if (emailUser) {
        return res.status(400).json({ 
          message: 'This email is already associated with another account' 
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (email) updateData.email = email.toLowerCase();
    if (name) updateData.name = name;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;

    if (Object.keys(updateData).length === 0) {
      return res.status(200).json({
        message: 'No changes to update',
        user: existingUser
      });
    }

    const updatedUser = await prisma.user.update({
      where: { 
        id: numericUserId 
      },
      data: updateData,
      include: {
        restaurantUsers: true
      }
    });

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        phoneNumber: updatedUser.phoneNumber,
        restaurantUsers: updatedUser.restaurantUsers
      }
    });

  } catch (error) {
    console.error('Request failed:', error);
    return res.status(500).json({ 
      message: 'Failed to update profile. Please try again.',
      error: error.message
    });
  }
});

export default router;
