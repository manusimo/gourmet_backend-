import { Router } from "express";
import { getRestaurantIdFromCookie, getUserIdFromCookie } from "../helpers/cookies.js";
import { checkEmployee, checkUserType, setUserRole, setUserType } from "../helpers/authenticateToken.js";
import {
  validateSignupInput,
  validateSigninInput,
  getUserByEmail,
  createUser,
  verifyPassword,
  generateToken,
  verifyToken,
  getUserProfileImage,
  buildTokenPayload,
  getRestaurantUsers,
  getUserById,
  checkUserExists,
  sendConfirmationEmail,
  createOrUpdateUserWithPassword,
  createRestaurantUser,
  getUserWithDetails,
  getUserInfo,
  updateUserPassword,
  sendPasswordResetEmail,
  generateChatToken,
  updateUserProfile,
  checkEmailConflict
} from "../helpers/authHelpers.js";

const router = Router();

// POST /signup - User registration
router.post('/signup', async (req, res) => {
  try {
    const { email, password, passwordConfirmation, userType, name, phoneNumber } = req.body;

    // Validate input data
    const validation = validateSignupInput({ email, password, passwordConfirmation, userType, name, phoneNumber });
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors: validation.errors 
      });
    }

    // Check if user already exists
    const existingUser = await checkUserExists(email);
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists' 
      });
    }

    // Create new user
    const newUser = await createUser({ email, password, userType, name, phoneNumber });

    // Generate token
    const token = generateToken({
      userId: newUser.id,
      email: newUser.email,
      userType: newUser.userType,
      role: newUser.role,
    });

    // Set cookie
    res.cookie('manu', token, {
      httpOnly: true,
      sameSite: 'None',
      secure: true, 
    });

    // Verify token was created correctly
    try {
      verifyToken(token);
    } catch (error) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }

    res.status(201).json({ 
      success: true,
      message: 'User registered successfully and logged in' 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// POST /signin - User login
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input data
    const validation = validateSigninInput({ email, password });
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors: validation.errors 
      });
    }

    // Get user with all related data
    const user = await getUserByEmail(email);

    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Build token payload
    const tokenPayload = buildTokenPayload(user);
    const token = generateToken(tokenPayload);

    // Set cookie
    res.cookie('manu', token, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
    });

    // Get profile image
    const profileImageUrl = getUserProfileImage(user);

    res.status(200).json({ 
      success: true,
      message: 'Signin successful', 
      userType: user.userType, 
      profileImageUrl: profileImageUrl, 
      isAuthenticated: true 
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// POST /logout - User logout
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies.manu;
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Unauthorized' 
      });
    }

    // Clear cookies
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
    
    return res.status(200).json({ 
      success: true,
      message: 'Logout successful' 
    });
  } catch (error) {
    console.error('Error during logout:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /users - Get restaurant users
router.get('/users', getRestaurantIdFromCookie, async (req, res) => {
  try {
    const { restaurantId } = req;
    const restaurantUsers = await getRestaurantUsers(restaurantId);
    
    res.json({ 
      success: true,
      data: restaurantUsers 
    });
  } catch (error) {
    console.error('Error getting restaurant users:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// GET /users/:id - Get user by ID
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserById(id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({ 
      success: true,
      data: user 
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// GET /protected-route - Test protected route
router.get('/protected-route', async (req, res) => {
  res.status(200).json({ 
    success: true,
    message: 'You are logged in and authorized to access this route' 
  });
});

// POST /admin/create-user - Create user by admin
router.post('/admin/create-user', getRestaurantIdFromCookie, setUserRole, async (req, res) => {
  try {
    const { email } = req.body;
    const { restaurantId, userRole } = req;
    const userType = 'empresas';
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    if (userRole !== 'admin') {
      return res.status(400).json({ 
        success: false,
        message: 'You need to be an admin to create new users' 
      });
    }

    // Check if user already exists
    const existingUser = await checkUserExists(email);
    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: 'User already exists' 
      });
    }

    // Send confirmation email
    await sendConfirmationEmail(email, userType, restaurantId);
    
    res.status(201).json({ 
      success: true,
      message: 'User created successfully. Confirmation email sent.' 
    });
  } catch (error) {
    console.error('Failed to create user:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to send confirmation email' 
    });
  }
});

// POST /set-password - Set password for new user
router.post('/set-password', async (req, res) => {
  try {
    const { token, password, name, phoneNumber } = req.body;

    if (!token || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Token and password are required' 
      });
    }

    const decodedToken = verifyToken(token);
    const { email, userType, restaurantId } = decodedToken;

    // Check for existing user
    const existingUser = await getUserInfo(email);

    let userId;

    if (existingUser) {
      // Check if already associated with this restaurant
      const existingRestaurantUser = existingUser.restaurantUsers.find(
        ru => ru.restaurantId === parseInt(restaurantId)
      );

      if (existingRestaurantUser) {
        return res.status(409).json({ 
          success: false,
          message: 'User already exists and is associated with this restaurant' 
        });
      }

      userId = existingUser.id;
    } else {
      // Create new User if doesn't exist
      const newUser = await createOrUpdateUserWithPassword({ 
        email, password, userType, name, phoneNumber 
      });
      userId = newUser.id;
    }

    // Create RestaurantUser association
    await createRestaurantUser(userId, restaurantId);

    res.status(200).json({ 
      success: true,
      message: existingUser 
        ? 'User associated with restaurant successfully' 
        : 'User created and associated successfully' 
    });
  } catch (error) {
    console.error('Set password error:', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired token' 
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// GET /check-login-status - Check user login status
router.get('/check-login-status', getUserIdFromCookie, async (req, res) => {
  try {
    const { userId } = req; 

    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: 'User not logged in', 
        isLoggedIn: false 
      });
    }

    const user = await getUserWithDetails(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found', 
        isLoggedIn: false 
      });
    }

    const profileImageUrl = getUserProfileImage(user);

    res.status(200).json({
      success: true,
      message: "User logged in",
      isAuthenticated: true,
      profileImageUrl,
      userType: user.userType,
      role: user.role
    });
  } catch (error) {
    console.error('Check login status error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// GET /user-info - Get user info
router.get('/user-info', getUserIdFromCookie, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = await getUserInfo(req.userId);

    const restaurantUserId = user.restaurantUsers.length > 0
      ? user.restaurantUsers[0].id
      : null;

    const responseData = { 
      userId: user.id, 
      restaurantUserId: restaurantUserId, 
      employeeId: '' 
    };

    if (user.userType === 'profesionales' && user.employee) {
      responseData.employeeId = user.employee.id; 
    }

    res.json({ 
      success: true,
      data: responseData 
    });
  } catch (error) {
    console.error('Failed to retrieve user:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
});

// POST /reset-password - Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Token and new password are required' 
      });
    }

    const decodedToken = verifyToken(token);
    const { email } = decodedToken;

    const existingUser = await checkUserExists(email);

    if (!existingUser) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Update the user's password
    await updateUserPassword(email, newPassword);

    res.status(200).json({ 
      success: true,
      message: 'Password reset successful' 
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired token' 
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// POST /reset-password-request - Request password reset
router.post('/reset-password-request', async (req, res) => {
  try {
    const { email } = req.body;

    const existingUser = await checkUserExists(email);
    if (!existingUser) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    await sendPasswordResetEmail(email);

    res.status(200).json({ 
      success: true,
      message: 'Password reset link sent successfully' 
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// GET /chat-token - Generate chat token
router.get('/chat-token', getUserIdFromCookie, async (req, res) => {
  try {
    const { userId } = req;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: 'Not authenticated' 
      });
    }

    const user = await getUserWithDetails(userId);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const chatToken = generateChatToken(user);

    res.json({ 
      success: true,
      token: chatToken 
    });
  } catch (error) {
    console.error('Chat token generation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to generate chat token' 
    });
  }
});

// PATCH /user/update - Update user profile
router.patch('/user/update', getUserIdFromCookie, async (req, res) => {
  try {
    const { userId } = req;
    const { email, name, phoneNumber } = req.body;

    const numericUserId = typeof userId === 'string' ? parseInt(userId) : userId;

    // Check for email conflicts if email is being updated
    if (email) {
      const emailUser = await checkEmailConflict(email, numericUserId);

      if (emailUser) {
        return res.status(400).json({ 
          success: false,
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
        success: true,
        message: 'No changes to update'
      });
    }

    const updatedUser = await updateUserProfile(numericUserId, updateData);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        phoneNumber: updatedUser.phoneNumber,
        restaurantUsers: updatedUser.restaurantUsers
      }
    });

  } catch (error) {
    console.error('Update request failed:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to update profile. Please try again.',
      error: error.message
    });
  }
});

export default router;
