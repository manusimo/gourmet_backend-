import { jest } from '@jest/globals';
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
} from '../../helpers/authHelpers.js';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  restaurantUser: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
};

// Mock the prisma import
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

// Mock bcrypt
const mockBcrypt = {
  hash: jest.fn(),
  compare: jest.fn(),
};
jest.mock('bcrypt', () => mockBcrypt);

// Mock jwt
const mockJwt = {
  sign: jest.fn(),
  verify: jest.fn(),
};
jest.mock('jsonwebtoken', () => mockJwt);

// Mock nodemailer
const mockNodemailer = {
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(),
  })),
};
jest.mock('nodemailer', () => mockNodemailer);

describe('Auth Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateSignupInput', () => {
    it('should validate valid signup input', () => {
      const input = {
        email: 'test@example.com',
        password: 'password123',
        passwordConfirmation: 'password123',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const result = validateSignupInput(input);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject invalid email', () => {
      const input = {
        email: 'invalid-email',
        password: 'password123',
        passwordConfirmation: 'password123',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const result = validateSignupInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should reject weak password', () => {
      const input = {
        email: 'test@example.com',
        password: '123',
        passwordConfirmation: '123',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const result = validateSignupInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 6 characters long');
    });

    it('should reject password mismatch', () => {
      const input = {
        email: 'test@example.com',
        password: 'password123',
        passwordConfirmation: 'different',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const result = validateSignupInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Passwords do not match');
    });

    it('should reject invalid user type', () => {
      const input = {
        email: 'test@example.com',
        password: 'password123',
        passwordConfirmation: 'password123',
        userType: 'invalid',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const result = validateSignupInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid user type');
    });
  });

  describe('validateSigninInput', () => {
    it('should validate valid signin input', () => {
      const input = {
        email: 'test@example.com',
        password: 'password123'
      };

      const result = validateSigninInput(input);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject missing email', () => {
      const input = {
        email: '',
        password: 'password123'
      };

      const result = validateSigninInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Email is required');
    });

    it('should reject missing password', () => {
      const input = {
        email: 'test@example.com',
        password: ''
      };

      const result = validateSigninInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });
  });

  describe('getUserByEmail', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas'
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await getUserByEmail('test@example.com');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: {
          restaurantUsers: {
            include: {
              restaurant: true,
            },
          },
          employee: true,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await getUserByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('should create user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas'
      };
      const hashedPassword = 'hashedPassword123';
      mockBcrypt.hash.mockResolvedValue(hashedPassword);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const result = await createUser(userData);

      expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          password: hashedPassword,
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678',
          role: 'user'
        },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for valid password', async () => {
      mockBcrypt.compare.mockResolvedValue(true);

      const result = await verifyPassword('password123', 'hashedPassword');

      expect(mockBcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(result).toBe(true);
    });

    it('should return false for invalid password', async () => {
      mockBcrypt.compare.mockResolvedValue(false);

      const result = await verifyPassword('wrongpassword', 'hashedPassword');

      expect(result).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate token successfully', () => {
      const mockToken = 'mock.jwt.token';
      mockJwt.sign.mockReturnValue(mockToken);

      const payload = {
        userId: 1,
        email: 'test@example.com',
        userType: 'empresas',
        role: 'user'
      };

      const result = generateToken(payload);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      expect(result).toBe(mockToken);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const mockPayload = {
        userId: 1,
        email: 'test@example.com'
      };
      mockJwt.verify.mockReturnValue(mockPayload);

      const result = verifyToken('valid.token.here');

      expect(mockJwt.verify).toHaveBeenCalledWith('valid.token.here', process.env.JWT_SECRET);
      expect(result).toEqual(mockPayload);
    });

    it('should throw error for invalid token', () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => verifyToken('invalid.token')).toThrow('Invalid token');
    });
  });

  describe('getUserProfileImage', () => {
    it('should return employee profile image', () => {
      const user = {
        userType: 'profesionales',
        employee: {
          profileImageUrl: 'https://example.com/employee.jpg'
        }
      };

      const result = getUserProfileImage(user);

      expect(result).toBe('https://example.com/employee.jpg');
    });

    it('should return restaurant profile image', () => {
      const user = {
        userType: 'empresas',
        restaurantUsers: [{
          restaurant: {
            profileImageUrl: 'https://example.com/restaurant.jpg'
          }
        }]
      };

      const result = getUserProfileImage(user);

      expect(result).toBe('https://example.com/restaurant.jpg');
    });

    it('should return null when no profile image', () => {
      const user = {
        userType: 'empresas',
        restaurantUsers: [{
          restaurant: {}
        }]
      };

      const result = getUserProfileImage(user);

      expect(result).toBeNull();
    });
  });

  describe('buildTokenPayload', () => {
    it('should build token payload for employee', () => {
      const user = {
        id: 1,
        email: 'test@example.com',
        userType: 'profesionales',
        role: 'user',
        employee: { id: 123 }
      };

      const result = buildTokenPayload(user);

      expect(result).toEqual({
        userId: 1,
        email: 'test@example.com',
        userType: 'profesionales',
        role: 'user',
        employeeId: 123
      });
    });

    it('should build token payload for restaurant user', () => {
      const user = {
        id: 1,
        email: 'test@example.com',
        userType: 'empresas',
        role: 'admin',
        restaurantUsers: [{ id: 456, restaurantId: 789 }]
      };

      const result = buildTokenPayload(user);

      expect(result).toEqual({
        userId: 1,
        email: 'test@example.com',
        userType: 'empresas',
        role: 'admin',
        restaurantUserId: 456,
        restaurantId: 789
      });
    });
  });

  describe('getRestaurantUsers', () => {
    it('should return restaurant users', async () => {
      const mockUsers = [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' }
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await getRestaurantUsers(1);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          restaurantUsers: {
            some: {
              restaurantId: 1,
            },
          },
        },
        include: {
          restaurantUsers: {
            where: { restaurantId: 1 },
          },
        },
      });
      expect(result).toEqual(mockUsers);
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe'
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await getUserById(1);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          restaurantUsers: {
            include: {
              restaurant: true,
            },
          },
          employee: true,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await getUserById(999);

      expect(result).toBeNull();
    });
  });

  describe('checkUserExists', () => {
    it('should return user when exists', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com'
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await checkUserExists('test@example.com');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await checkUserExists('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('sendConfirmationEmail', () => {
    it('should send confirmation email successfully', async () => {
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({ messageId: '123' })
      };
      mockNodemailer.createTransport.mockReturnValue(mockTransport);

      await sendConfirmationEmail('test@example.com', 'empresas', 1);

      expect(mockNodemailer.createTransport).toHaveBeenCalled();
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Confirmación de cuenta'),
          html: expect.stringContaining('test@example.com')
        })
      );
    });
  });

  describe('createOrUpdateUserWithPassword', () => {
    it('should create new user with password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe'
      };
      const hashedPassword = 'hashedPassword123';
      mockBcrypt.hash.mockResolvedValue(hashedPassword);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        userType: 'empresas',
        name: 'John Doe',
        phoneNumber: '+56912345678'
      };

      const result = await createOrUpdateUserWithPassword(userData);

      expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          password: hashedPassword,
          userType: 'empresas',
          name: 'John Doe',
          phoneNumber: '+56912345678',
          role: 'user'
        },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('createRestaurantUser', () => {
    it('should create restaurant user successfully', async () => {
      const mockRestaurantUser = {
        id: 1,
        userId: 123,
        restaurantId: 456
      };
      mockPrisma.restaurantUser.create.mockResolvedValue(mockRestaurantUser);

      const result = await createRestaurantUser(123, 456);

      expect(mockPrisma.restaurantUser.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: 123 } },
          restaurant: { connect: { id: 456 } },
        },
      });
      expect(result).toEqual(mockRestaurantUser);
    });
  });

  describe('getUserWithDetails', () => {
    it('should return user with details', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        restaurantUsers: [],
        employee: null
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await getUserWithDetails(1);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          restaurantUsers: {
            include: {
              restaurant: true,
            },
          },
          employee: true,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await getUserWithDetails(999);

      expect(result).toBeNull();
    });
  });

  describe('getUserInfo', () => {
    it('should return user info', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        restaurantUsers: []
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await getUserInfo(1);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          restaurantUsers: {
            include: {
              restaurant: true,
            },
          },
          employee: true,
        },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('updateUserPassword', () => {
    it('should update user password successfully', async () => {
      const hashedPassword = 'newHashedPassword123';
      mockBcrypt.hash.mockResolvedValue(hashedPassword);
      mockPrisma.user.update.mockResolvedValue({ id: 1, email: 'test@example.com' });

      await updateUserPassword('test@example.com', 'newPassword123');

      expect(mockBcrypt.hash).toHaveBeenCalledWith('newPassword123', 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        data: { password: hashedPassword },
      });
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email successfully', async () => {
      const mockTransport = {
        sendMail: jest.fn().mockResolvedValue({ messageId: '123' })
      };
      mockNodemailer.createTransport.mockReturnValue(mockTransport);

      await sendPasswordResetEmail('test@example.com');

      expect(mockNodemailer.createTransport).toHaveBeenCalled();
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Restablecer contraseña'),
          html: expect.stringContaining('test@example.com')
        })
      );
    });
  });

  describe('generateChatToken', () => {
    it('should generate chat token successfully', () => {
      const mockToken = 'mock.chat.token';
      mockJwt.sign.mockReturnValue(mockToken);

      const user = {
        id: 1,
        email: 'test@example.com',
        name: 'John Doe',
        userType: 'empresas'
      };

      const result = generateChatToken(user);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: 1,
          email: 'test@example.com',
          name: 'John Doe',
          userType: 'empresas'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      expect(result).toBe(mockToken);
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
      const mockUpdatedUser = {
        id: 1,
        email: 'updated@example.com',
        name: 'John Updated',
        phoneNumber: '+56987654321'
      };
      mockPrisma.user.update.mockResolvedValue(mockUpdatedUser);

      const updateData = {
        email: 'updated@example.com',
        name: 'John Updated',
        phoneNumber: '+56987654321'
      };

      const result = await updateUserProfile(1, updateData);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updateData,
        include: {
          restaurantUsers: {
            include: {
              restaurant: true,
            },
          },
          employee: true,
        },
      });
      expect(result).toEqual(mockUpdatedUser);
    });
  });

  describe('checkEmailConflict', () => {
    it('should return user when email conflict exists', async () => {
      const mockUser = {
        id: 2,
        email: 'conflict@example.com'
      };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await checkEmailConflict('conflict@example.com', 1);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: 'conflict@example.com',
          id: { not: 1 },
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when no email conflict', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await checkEmailConflict('unique@example.com', 1);

      expect(result).toBeNull();
    });
  });
}); 