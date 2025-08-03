// Test setup file
import { jest } from '@jest/globals';

// Global test configuration
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: jest.fn(),
  // error: jest.fn(),
  // warn: jest.fn(),
};

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

// Global test utilities
global.createMockRequest = (data = {}) => ({
  body: {},
  query: {},
  params: {},
  headers: {},
  ...data,
});

global.createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

global.createMockNext = () => jest.fn();

// Helper function to create test data
global.createTestJobOffer = (overrides = {}) => ({
  id: 1,
  position: 'Chef',
  salary: 50000,
  schedule: 'Full-time',
  contract: 'Permanent',
  vacancies: 2,
  yearsOfExperience: 5,
  description: 'Looking for experienced chef',
  requirements: '5 years experience',
  functions: 'Cooking and management',
  tips: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: null,
  ...overrides,
});

global.createTestEmployee = (overrides = {}) => ({
  id: 1,
  name: 'John Doe',
  surname: 'Smith',
  position: 'Chef',
  country: 'Chile',
  birthDate: new Date('1990-01-01'),
  phoneNumber: '+56912345678',
  aboutMe: 'Experienced chef',
  region: 'Santiago',
  comuna: 'Providencia',
  schedule: 'Full-time',
  available: 'Available',
  genre: 'Male',
  civilState: 'Single',
  profileImageUrl: 'https://example.com/image.jpg',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

global.createTestRestaurant = (overrides = {}) => ({
  id: 1,
  name: 'Test Restaurant',
  specialty: 'Italian',
  format: 'Restaurant',
  description: 'A great restaurant',
  rut: '12345678-9',
  legalName: 'Test Restaurant LLC',
  region: 'Santiago',
  comuna: 'Providencia',
  numberOfRestaurants: 1,
  workers: 20,
  weeklyAverageClients: 500,
  benefits: ['Health Insurance', 'Meals'],
  profileImageUrl: 'https://example.com/restaurant.jpg',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

global.createTestTalentPoolEntry = (overrides = {}) => ({
  id: 1,
  employeeId: 1,
  restaurantId: 1,
  status: 'accepted',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// Mock Prisma client for testing
global.mockPrismaClient = {
  jobOffer: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  employee: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  restaurant: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  talentPool: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  application: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  restaurantUser: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  location: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  experience: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  education: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  favouriteJob: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  conversation: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  message: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  question: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  answer: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// Export for use in tests
export {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createTestJobOffer,
  createTestEmployee,
  createTestRestaurant,
  createTestTalentPoolEntry,
  mockPrismaClient,
}; 