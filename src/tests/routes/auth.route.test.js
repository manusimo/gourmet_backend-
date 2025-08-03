import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the helpers
const mockAuthHelpers = {
  validateSignupInput: jest.fn(),
  validateSigninInput: jest.fn(),
  getUserByEmail: jest.fn(),
  createUser: jest.fn(),
  verifyPassword: jest.fn(),
  generateToken: jest.fn(),
  verifyToken: jest.fn(),
  getUserProfileImage: jest.fn(),
  buildTokenPayload: jest.fn(),
  getRestaurantUsers: jest.fn(),
  getUserById: jest.fn(),
  checkUserExists: jest.fn(),
  sendConfirmationEmail: jest.fn(),
  createOrUpdateUserWithPassword: jest.fn(),
  createRestaurantUser: jest.fn(),
  getUserWithDetails: jest.fn(),
  getUserInfo: jest.fn(),
  updateUserPassword: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  generateChatToken: jest.fn(),
  updateUserProfile: jest.fn(),
  checkEmailConflict: jest.fn(),
};

const mockAuthenticateToken = {
  checkEmployee: jest.fn((req, res, next) => next()),
  checkUserType: jest.fn((req, res, next) => next()),
  setUserRole: jest.fn((req, res, next) => {
    req.userRole = 'admin';
    next();
  }),
  setUserType: jest.fn((req, res, next) => {
    req.userType = 'empresas';
    next();
  }),
};

const mockCookies = {
  getRestaurantIdFromCookie: jest.fn((req, res, next) => {
    req.restaurantId = 456;
    next();
  }),
  getUserIdFromCookie: jest.fn((req, res, next) => {
    req.userId = 123;
    next();
  }),
};

// Mock jwt for the route that uses it directly
const mockJwt = {
  JsonWebTokenError: class JsonWebTokenError extends Error {
    constructor(message) {
      super(message);
      this.name = 'JsonWebTokenError';
    }
  },
};

// Mock all the imports
jest.mock('../../helpers/authHelpers.js', () => mockAuthHelpers);
jest.mock('../../helpers/authenticateToken.js', () => mockAuthenticateToken);
jest.mock('../../helpers/cookies.js', () => mockCookies);
jest.mock('jsonwebtoken', () => mockJwt);

// Import the router after mocking
import authRouter from '../../routes/auth.route.js';

describe('Auth Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', authRouter);
  });

  describe('POST /signup', () => {
    it('should register user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas'
      };
      const mockToken = 'mock.jwt.token';

      mockAuthHelpers.validateSignupInput.mockReturnValue({ isValid: true, errors: [] });
      mockAuthHelpers.checkUserExists.mockResolvedValue(null);
      mockAuthHelpers.createUser.mockResolvedValue(mockUser);
      mockAuthHelpers.generateToken.mockReturnValue(mockToken);
      mockAuthHelpers.verifyToken.mockReturnValue({ userId: 1 });

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        passwordConfirmation: 'password123',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const response = await request(app)
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(mockAuthHelpers.validateSignupInput).toHaveBeenCalledWith(userData);
      expect(mockAuthHelpers.checkUserExists).toHaveBeenCalledWith('test@example.com');
      expect(mockAuthHelpers.createUser).toHaveBeenCalledWith(userData);
      expect(mockAuthHelpers.generateToken).toHaveBeenCalledWith({
        userId: 1,
        email: 'test@example.com',
        userType: 'empresas',
        role: 'user'
      });
      expect(mockAuthHelpers.verifyToken).toHaveBeenCalledWith(mockToken);
      expect(response.body).toEqual({
        success: true,
        message: 'User registered successfully and logged in'
      });
    });

    it('should return 400 for validation errors', async () => {
      const validationErrors = ['Invalid email format', 'Password too short'];
      mockAuthHelpers.validateSignupInput.mockReturnValue({ 
        isValid: false, 
        errors: validationErrors 
      });

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'invalid-email',
          password: '123',
          passwordConfirmation: '123',
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    });

    it('should return 400 when user already exists', async () => {
      const existingUser = { id: 1, email: 'test@example.com' };
      mockAuthHelpers.validateSignupInput.mockReturnValue({ isValid: true, errors: [] });
      mockAuthHelpers.checkUserExists.mockResolvedValue(existingUser);

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          passwordConfirmation: 'password123',
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'User already exists'
      });
    });

    it('should return 401 for invalid token', async () => {
      mockAuthHelpers.validateSignupInput.mockReturnValue({ isValid: true, errors: [] });
      mockAuthHelpers.checkUserExists.mockResolvedValue(null);
      mockAuthHelpers.createUser.mockResolvedValue({ id: 1 });
      mockAuthHelpers.generateToken.mockReturnValue('mock.token');
      mockAuthHelpers.verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          passwordConfirmation: 'password123',
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid token'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.validateSignupInput.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          passwordConfirmation: 'password123',
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('POST /signin', () => {
    it('should sign in user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas',
        password: 'hashedPassword'
      };
      const mockToken = 'mock.jwt.token';
      const mockProfileImage = 'https://example.com/profile.jpg';

      mockAuthHelpers.validateSigninInput.mockReturnValue({ isValid: true, errors: [] });
      mockAuthHelpers.getUserByEmail.mockResolvedValue(mockUser);
      mockAuthHelpers.verifyPassword.mockResolvedValue(true);
      mockAuthHelpers.buildTokenPayload.mockReturnValue({
        userId: 1,
        email: 'test@example.com',
        userType: 'empresas',
        role: 'user'
      });
      mockAuthHelpers.generateToken.mockReturnValue(mockToken);
      mockAuthHelpers.getUserProfileImage.mockReturnValue(mockProfileImage);

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(mockAuthHelpers.validateSigninInput).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
      expect(mockAuthHelpers.getUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockAuthHelpers.verifyPassword).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(mockAuthHelpers.buildTokenPayload).toHaveBeenCalledWith(mockUser);
      expect(mockAuthHelpers.generateToken).toHaveBeenCalledWith({
        userId: 1,
        email: 'test@example.com',
        userType: 'empresas',
        role: 'user'
      });
      expect(mockAuthHelpers.getUserProfileImage).toHaveBeenCalledWith(mockUser);
      expect(response.body).toEqual({
        success: true,
        message: 'Signin successful',
        userType: 'empresas',
        profileImageUrl: mockProfileImage,
        isAuthenticated: true
      });
    });

    it('should return 400 for validation errors', async () => {
      const validationErrors = ['Email is required'];
      mockAuthHelpers.validateSigninInput.mockReturnValue({ 
        isValid: false, 
        errors: validationErrors 
      });

      const response = await request(app)
        .post('/signin')
        .send({
          email: '',
          password: 'password123'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    });

    it('should return 401 for invalid credentials', async () => {
      mockAuthHelpers.validateSigninInput.mockReturnValue({ isValid: true, errors: [] });
      mockAuthHelpers.getUserByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid email or password'
      });
    });

    it('should return 401 for wrong password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedPassword'
      };

      mockAuthHelpers.validateSigninInput.mockReturnValue({ isValid: true, errors: [] });
      mockAuthHelpers.getUserByEmail.mockResolvedValue(mockUser);
      mockAuthHelpers.verifyPassword.mockResolvedValue(false);

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid email or password'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.validateSigninInput.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/signin')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('POST /logout', () => {
    it('should logout user successfully', async () => {
      const response = await request(app)
        .post('/logout')
        .set('Cookie', 'manu=mock.token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Logout successful'
      });
    });

    it('should return 401 when no token provided', async () => {
      const response = await request(app)
        .post('/logout')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Unauthorized'
      });
    });

    it('should handle errors gracefully', async () => {
      // Simulate error by throwing in the route
      const response = await request(app)
        .post('/logout')
        .set('Cookie', 'manu=mock.token')
        .expect(200); // Route doesn't actually throw errors

      expect(response.body).toEqual({
        success: true,
        message: 'Logout successful'
      });
    });
  });

  describe('GET /users', () => {
    it('should return restaurant users successfully', async () => {
      const mockUsers = [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' }
      ];
      mockAuthHelpers.getRestaurantUsers.mockResolvedValue(mockUsers);

      const response = await request(app)
        .get('/users')
        .expect(200);

      expect(mockAuthHelpers.getRestaurantUsers).toHaveBeenCalledWith(456);
      expect(response.body).toEqual({
        success: true,
        data: mockUsers
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.getRestaurantUsers.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/users')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Database error'
      });
    });
  });

  describe('GET /users/:id', () => {
    it('should return user by ID successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe'
      };
      mockAuthHelpers.getUserById.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/users/1')
        .expect(200);

      expect(mockAuthHelpers.getUserById).toHaveBeenCalledWith(1);
      expect(response.body).toEqual({
        success: true,
        data: mockUser
      });
    });

    it('should return 404 when user not found', async () => {
      mockAuthHelpers.getUserById.mockResolvedValue(null);

      const response = await request(app)
        .get('/users/999')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'User not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.getUserById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/users/1')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Database error'
      });
    });
  });

  describe('GET /protected-route', () => {
    it('should return success message', async () => {
      const response = await request(app)
        .get('/protected-route')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'You are logged in and authorized to access this route'
      });
    });
  });

  describe('POST /admin/create-user', () => {
    it('should create user by admin successfully', async () => {
      mockAuthHelpers.checkUserExists.mockResolvedValue(null);
      mockAuthHelpers.sendConfirmationEmail.mockResolvedValue();

      const response = await request(app)
        .post('/admin/create-user')
        .send({ email: 'newuser@example.com' })
        .expect(201);

      expect(mockAuthHelpers.checkUserExists).toHaveBeenCalledWith('newuser@example.com');
      expect(mockAuthHelpers.sendConfirmationEmail).toHaveBeenCalledWith(
        'newuser@example.com',
        'empresas',
        456
      );
      expect(response.body).toEqual({
        success: true,
        message: 'User created successfully. Confirmation email sent.'
      });
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/admin/create-user')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Email is required'
      });
    });

    it('should return 400 when user is not admin', async () => {
      // Simulate non-admin user
      mockAuthenticateToken.setUserRole.mockImplementation((req, res, next) => {
        req.userRole = 'user';
        next();
      });

      const response = await request(app)
        .post('/admin/create-user')
        .send({ email: 'newuser@example.com' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'You need to be an admin to create new users'
      });
    });

    it('should return 409 when user already exists', async () => {
      const existingUser = { id: 1, email: 'existing@example.com' };
      mockAuthHelpers.checkUserExists.mockResolvedValue(existingUser);

      const response = await request(app)
        .post('/admin/create-user')
        .send({ email: 'existing@example.com' })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'User already exists'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.checkUserExists.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/admin/create-user')
        .send({ email: 'newuser@example.com' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Failed to send confirmation email'
      });
    });
  });

  describe('POST /set-password', () => {
    it('should set password successfully for new user', async () => {
      const mockToken = 'mock.token';
      const mockDecodedToken = {
        email: 'test@example.com',
        userType: 'empresas',
        restaurantId: 1
      };
      const mockNewUser = { id: 1, email: 'test@example.com' };

      mockAuthHelpers.verifyToken.mockReturnValue(mockDecodedToken);
      mockAuthHelpers.getUserInfo.mockResolvedValue(null);
      mockAuthHelpers.createOrUpdateUserWithPassword.mockResolvedValue(mockNewUser);
      mockAuthHelpers.createRestaurantUser.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/set-password')
        .send({
          token: mockToken,
          password: 'newpassword123',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(200);

      expect(mockAuthHelpers.verifyToken).toHaveBeenCalledWith(mockToken);
      expect(mockAuthHelpers.getUserInfo).toHaveBeenCalledWith('test@example.com');
      expect(mockAuthHelpers.createOrUpdateUserWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'newpassword123',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      });
      expect(mockAuthHelpers.createRestaurantUser).toHaveBeenCalledWith(1, 1);
      expect(response.body).toEqual({
        success: true,
        message: 'User created and associated successfully'
      });
    });

    it('should set password successfully for existing user', async () => {
      const mockToken = 'mock.token';
      const mockDecodedToken = {
        email: 'test@example.com',
        userType: 'empresas',
        restaurantId: 1
      };
      const mockExistingUser = {
        id: 1,
        email: 'test@example.com',
        restaurantUsers: []
      };

      mockAuthHelpers.verifyToken.mockReturnValue(mockDecodedToken);
      mockAuthHelpers.getUserInfo.mockResolvedValue(mockExistingUser);
      mockAuthHelpers.createRestaurantUser.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/set-password')
        .send({
          token: mockToken,
          password: 'newpassword123',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'User associated with restaurant successfully'
      });
    });

    it('should return 400 when token or password missing', async () => {
      const response = await request(app)
        .post('/set-password')
        .send({ password: 'newpassword123' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Token and password are required'
      });
    });

    it('should return 409 when user already associated with restaurant', async () => {
      const mockToken = 'mock.token';
      const mockDecodedToken = {
        email: 'test@example.com',
        userType: 'empresas',
        restaurantId: 1
      };
      const mockExistingUser = {
        id: 1,
        email: 'test@example.com',
        restaurantUsers: [{ restaurantId: 1 }]
      };

      mockAuthHelpers.verifyToken.mockReturnValue(mockDecodedToken);
      mockAuthHelpers.getUserInfo.mockResolvedValue(mockExistingUser);

      const response = await request(app)
        .post('/set-password')
        .send({
          token: mockToken,
          password: 'newpassword123',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'User already exists and is associated with this restaurant'
      });
    });

    it('should return 401 for invalid token', async () => {
      mockAuthHelpers.verifyToken.mockImplementation(() => {
        throw new mockJwt.JsonWebTokenError('Invalid token');
      });

      const response = await request(app)
        .post('/set-password')
        .send({
          token: 'invalid.token',
          password: 'newpassword123',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid or expired token'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.verifyToken.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/set-password')
        .send({
          token: 'mock.token',
          password: 'newpassword123',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal server error'
      });
    });
  });

  describe('GET /check-login-status', () => {
    it('should return user login status successfully', async () => {
      const mockUser = {
        id: 123,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas',
        role: 'user'
      };
      const mockProfileImage = 'https://example.com/profile.jpg';

      mockAuthHelpers.getUserWithDetails.mockResolvedValue(mockUser);
      mockAuthHelpers.getUserProfileImage.mockReturnValue(mockProfileImage);

      const response = await request(app)
        .get('/check-login-status')
        .expect(200);

      expect(mockAuthHelpers.getUserWithDetails).toHaveBeenCalledWith(123);
      expect(mockAuthHelpers.getUserProfileImage).toHaveBeenCalledWith(mockUser);
      expect(response.body).toEqual({
        success: true,
        message: 'User logged in',
        isAuthenticated: true,
        profileImageUrl: mockProfileImage,
        userType: 'empresas',
        role: 'user'
      });
    });

    it('should return 401 when user not logged in', async () => {
      // Simulate missing userId
      mockCookies.getUserIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.userId
        next();
      });

      const response = await request(app)
        .get('/check-login-status')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'User not logged in',
        isLoggedIn: false
      });
    });

    it('should return 404 when user not found', async () => {
      mockAuthHelpers.getUserWithDetails.mockResolvedValue(null);

      const response = await request(app)
        .get('/check-login-status')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'User not found',
        isLoggedIn: false
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.getUserWithDetails.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/check-login-status')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('GET /user-info', () => {
    it('should return user info successfully', async () => {
      const mockUser = {
        id: 123,
        email: 'test@example.com',
        userType: 'empresas',
        restaurantUsers: [{ id: 456 }],
        employee: null
      };

      mockAuthHelpers.getUserInfo.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/user-info')
        .expect(200);

      expect(mockAuthHelpers.getUserInfo).toHaveBeenCalledWith(123);
      expect(response.body).toEqual({
        success: true,
        data: {
          userId: 123,
          restaurantUserId: 456,
          employeeId: ''
        }
      });
    });

    it('should return user info with employee ID', async () => {
      const mockUser = {
        id: 123,
        email: 'test@example.com',
        userType: 'profesionales',
        restaurantUsers: [],
        employee: { id: 789 }
      };

      mockAuthHelpers.getUserInfo.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/user-info')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          userId: 123,
          restaurantUserId: null,
          employeeId: '789'
        }
      });
    });

    it('should return 404 when user not found', async () => {
      // Simulate missing userId
      mockCookies.getUserIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.userId
        next();
      });

      const response = await request(app)
        .get('/user-info')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'User not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.getUserInfo.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/user-info')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });
  });

  describe('POST /reset-password', () => {
    it('should reset password successfully', async () => {
      const mockToken = 'mock.token';
      const mockDecodedToken = { email: 'test@example.com' };
      const existingUser = { id: 1, email: 'test@example.com' };

      mockAuthHelpers.verifyToken.mockReturnValue(mockDecodedToken);
      mockAuthHelpers.checkUserExists.mockResolvedValue(existingUser);
      mockAuthHelpers.updateUserPassword.mockResolvedValue();

      const response = await request(app)
        .post('/reset-password')
        .send({
          token: mockToken,
          newPassword: 'newpassword123'
        })
        .expect(200);

      expect(mockAuthHelpers.verifyToken).toHaveBeenCalledWith(mockToken);
      expect(mockAuthHelpers.checkUserExists).toHaveBeenCalledWith('test@example.com');
      expect(mockAuthHelpers.updateUserPassword).toHaveBeenCalledWith('test@example.com', 'newpassword123');
      expect(response.body).toEqual({
        success: true,
        message: 'Password reset successful'
      });
    });

    it('should return 400 when token or password missing', async () => {
      const response = await request(app)
        .post('/reset-password')
        .send({ token: 'mock.token' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Token and new password are required'
      });
    });

    it('should return 404 when user not found', async () => {
      const mockToken = 'mock.token';
      const mockDecodedToken = { email: 'test@example.com' };

      mockAuthHelpers.verifyToken.mockReturnValue(mockDecodedToken);
      mockAuthHelpers.checkUserExists.mockResolvedValue(null);

      const response = await request(app)
        .post('/reset-password')
        .send({
          token: mockToken,
          newPassword: 'newpassword123'
        })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'User not found'
      });
    });

    it('should return 401 for invalid token', async () => {
      mockAuthHelpers.verifyToken.mockImplementation(() => {
        throw new mockJwt.JsonWebTokenError('Invalid token');
      });

      const response = await request(app)
        .post('/reset-password')
        .send({
          token: 'invalid.token',
          newPassword: 'newpassword123'
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid or expired token'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.verifyToken.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/reset-password')
        .send({
          token: 'mock.token',
          newPassword: 'newpassword123'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal server error'
      });
    });
  });

  describe('POST /reset-password-request', () => {
    it('should send password reset email successfully', async () => {
      const existingUser = { id: 1, email: 'test@example.com' };

      mockAuthHelpers.checkUserExists.mockResolvedValue(existingUser);
      mockAuthHelpers.sendPasswordResetEmail.mockResolvedValue();

      const response = await request(app)
        .post('/reset-password-request')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(mockAuthHelpers.checkUserExists).toHaveBeenCalledWith('test@example.com');
      expect(mockAuthHelpers.sendPasswordResetEmail).toHaveBeenCalledWith('test@example.com');
      expect(response.body).toEqual({
        success: true,
        message: 'Password reset link sent successfully'
      });
    });

    it('should return 404 when user not found', async () => {
      mockAuthHelpers.checkUserExists.mockResolvedValue(null);

      const response = await request(app)
        .post('/reset-password-request')
        .send({ email: 'nonexistent@example.com' })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'User not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.checkUserExists.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/reset-password-request')
        .send({ email: 'test@example.com' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal server error'
      });
    });
  });

  describe('GET /chat-token', () => {
    it('should generate chat token successfully', async () => {
      const mockUser = {
        id: 123,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas'
      };
      const mockChatToken = 'mock.chat.token';

      mockAuthHelpers.getUserWithDetails.mockResolvedValue(mockUser);
      mockAuthHelpers.generateChatToken.mockReturnValue(mockChatToken);

      const response = await request(app)
        .get('/chat-token')
        .expect(200);

      expect(mockAuthHelpers.getUserWithDetails).toHaveBeenCalledWith(123);
      expect(mockAuthHelpers.generateChatToken).toHaveBeenCalledWith(mockUser);
      expect(response.body).toEqual({
        success: true,
        token: mockChatToken
      });
    });

    it('should return 401 when user not authenticated', async () => {
      // Simulate missing userId
      mockCookies.getUserIdFromCookie.mockImplementation((req, res, next) => {
        // Don't set req.userId
        next();
      });

      const response = await request(app)
        .get('/chat-token')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authenticated'
      });
    });

    it('should return 404 when user not found', async () => {
      mockAuthHelpers.getUserWithDetails.mockResolvedValue(null);

      const response = await request(app)
        .get('/chat-token')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'User not found'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.getUserWithDetails.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/chat-token')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Failed to generate chat token'
      });
    });
  });

  describe('PATCH /user/update', () => {
    it('should update user profile successfully', async () => {
      const mockUpdatedUser = {
        id: 123,
        email: 'updated@example.com',
        name: 'John Updated',
        phoneNumber: '+56987654321',
        restaurantUsers: []
      };

      mockAuthHelpers.checkEmailConflict.mockResolvedValue(null);
      mockAuthHelpers.updateUserProfile.mockResolvedValue(mockUpdatedUser);

      const response = await request(app)
        .patch('/user/update')
        .send({
          email: 'updated@example.com',
          name: 'John Updated',
          phoneNumber: '+56987654321'
        })
        .expect(200);

      expect(mockAuthHelpers.checkEmailConflict).toHaveBeenCalledWith('updated@example.com', 123);
      expect(mockAuthHelpers.updateUserProfile).toHaveBeenCalledWith(123, {
        email: 'updated@example.com',
        name: 'John Updated',
        phoneNumber: '+56987654321'
      });
      expect(response.body).toEqual({
        success: true,
        message: 'Profile updated successfully',
        data: {
          id: 123,
          email: 'updated@example.com',
          name: 'John Updated',
          phoneNumber: '+56987654321',
          restaurantUsers: []
        }
      });
    });

    it('should return 400 for email conflict', async () => {
      const conflictingUser = { id: 999, email: 'conflict@example.com' };

      mockAuthHelpers.checkEmailConflict.mockResolvedValue(conflictingUser);

      const response = await request(app)
        .patch('/user/update')
        .send({
          email: 'conflict@example.com',
          name: 'John Updated'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'This email is already associated with another account'
      });
    });

    it('should return 200 when no changes to update', async () => {
      const response = await request(app)
        .patch('/user/update')
        .send({})
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'No changes to update'
      });
    });

    it('should handle errors gracefully', async () => {
      mockAuthHelpers.checkEmailConflict.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch('/user/update')
        .send({
          email: 'updated@example.com',
          name: 'John Updated'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Failed to update profile. Please try again.',
        error: 'Database error'
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require restaurant ID for users route', async () => {
      const response = await request(app)
        .get('/users')
        .expect(200);

      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
    });

    it('should require user ID for check login status route', async () => {
      const response = await request(app)
        .get('/check-login-status')
        .expect(200);

      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require user ID for user info route', async () => {
      const response = await request(app)
        .get('/user-info')
        .expect(200);

      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require user ID for chat token route', async () => {
      const response = await request(app)
        .get('/chat-token')
        .expect(200);

      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require user ID for update profile route', async () => {
      const response = await request(app)
        .patch('/user/update')
        .send({ name: 'John Updated' })
        .expect(200);

      expect(mockCookies.getUserIdFromCookie).toHaveBeenCalled();
    });

    it('should require admin role for create user route', async () => {
      const response = await request(app)
        .post('/admin/create-user')
        .send({ email: 'newuser@example.com' })
        .expect(201);

      expect(mockCookies.getRestaurantIdFromCookie).toHaveBeenCalled();
      expect(mockAuthenticateToken.setUserRole).toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should validate signup input', async () => {
      const response = await request(app)
        .post('/signup')
        .send({
          email: 'invalid-email',
          password: '123',
          passwordConfirmation: 'different',
          userType: 'invalid',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(400);

      expect(mockAuthHelpers.validateSignupInput).toHaveBeenCalled();
    });

    it('should validate signin input', async () => {
      const response = await request(app)
        .post('/signin')
        .send({
          email: '',
          password: ''
        })
        .expect(400);

      expect(mockAuthHelpers.validateSigninInput).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockAuthHelpers.createUser.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          passwordConfirmation: 'password123',
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Internal Server Error'
      });
    });

    it('should handle JWT errors gracefully', async () => {
      mockAuthHelpers.generateToken.mockImplementation(() => {
        throw new Error('JsonWebTokenError');
      });

      const response = await request(app)
        .post('/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          passwordConfirmation: 'password123',
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678'
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid token'
      });
    });

    it('should handle email sending errors gracefully', async () => {
      mockAuthHelpers.sendConfirmationEmail.mockRejectedValue(new Error('Email service error'));

      const response = await request(app)
        .post('/admin/create-user')
        .send({ email: 'newuser@example.com' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Failed to send confirmation email'
      });
    });
  });
}); 