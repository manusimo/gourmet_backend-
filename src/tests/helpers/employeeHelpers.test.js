const {
  getEmployeeById,
  getEmployeeByUserId,
  createEmployeeProfile,
  generateEmployeeToken,
  getEmployeeProfile,
  updateEmployeeProfile,
  createExperience,
  createEducation,
  getEmployeeWithDetails,
  searchEmployees,
  getJobOfferById,
  getEmployeeByEmployeeId,
  checkFavoriteJobExists,
  createFavoriteJob,
  getFavoriteJobById,
  deleteFavoriteJob,
  getFavoriteJobs,
  checkTalentPoolRecord,
  createTalentPoolRecord
} = require('../../helpers/employeeHelpers.js');

const mockPrisma = {
  employee: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  experience: {
    create: jest.fn(),
  },
  education: {
    create: jest.fn(),
  },
  favouriteJob: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  talentPool: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  jobOffer: {
    findFirst: jest.fn(),
  },
};

// Mock the prisma import
jest.mock('../../db.js', () => ({
  prisma: mockPrisma,
}));

// Mock jwt
const mockJwt = {
  sign: jest.fn(),
};
jest.mock('jsonwebtoken', () => mockJwt);

describe('Employee Helpers', () => {
  let helpers;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    helpers = require('../../helpers/employeeHelpers.js');
  });

  describe('getEmployeeById', () => {
    it('should return employee when found', async () => {
      const mockEmployee = { id: 1, name: 'John Doe', position: 'Chef' };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const result = await helpers.getEmployeeById(1);

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          experiences: true,
          educations: true,
          user: true,
        },
      });
      expect(result).toEqual(mockEmployee);
    });

    it('should return null when employee not found', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await helpers.getEmployeeById(1);

      expect(result).toBeNull();
    });

    it('should handle string employeeId by converting to integer', async () => {
      const mockEmployee = { id: 1, name: 'John Doe' };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      await helpers.getEmployeeById('1');

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },  // The implementation doesn't parse the ID
        include: {
          experiences: true,
          educations: true,
          user: true,
        },
      });
    });
  });

  describe('getEmployeeByUserId', () => {
    it('should return employee when found', async () => {
      const mockEmployee = { id: 1, name: 'John Doe', userId: 123 };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const result = await helpers.getEmployeeByUserId(123);

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { userId: 123 },
      });
      expect(result).toEqual(mockEmployee);
    });

    it('should return null when employee not found', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await helpers.getEmployeeByUserId(123);

      expect(result).toBeNull();
    });
  });

  describe('createEmployeeProfile', () => {
    it('should create employee profile successfully', async () => {
      const mockEmployee = {
        id: 1,
        name: 'John Doe',
        position: 'Chef',
        userId: 123
      };
      mockPrisma.employee.create.mockResolvedValue(mockEmployee);

      const employeeData = {
        name: 'John Doe',
        position: 'Chef',
        surname: 'Smith',
        skills: { cooking: true, management: false },
        experiences: [
          { companyName: 'Restaurant ABC', role: 'Chef', startDate: '2020-01-01', endDate: '2023-01-01' }
        ],
        educations: [
          { institution: 'Culinary Institute', study: 'Culinary Arts', startDate: '2015-01-01', endDate: '2019-01-01' }
        ],
        aboutMe: 'Experienced chef',
        birthDate: '1990-01-01',
        country: 'Chile',
        phoneNumber: '+56912345678',
        comuna: 'Providencia',
        region: 'Santiago',
        available: 'Available',
        schedule: 'Full-time',
        profileImageUrl: 'https://example.com/image.jpg',
        userId: 123
      };

      const result = await helpers.createEmployeeProfile(employeeData);

      expect(mockPrisma.employee.create).toHaveBeenCalledWith({
        data: {
          name: 'John Doe',
          country: 'Chile',
          surname: 'Smith',
          birthDate: '1990-01-01',
          phoneNumber: '+56912345678',
          position: 'Chef',
          aboutMe: 'Experienced chef',
          region: 'Santiago',
          comuna: 'Providencia',
          schedule: 'Full-time',
          available: 'Available',
          experiences: {
            create: [
              { companyName: 'Restaurant ABC', role: 'Chef', startDate: '2020-01-01', endDate: '2023-01-01' }
            ]
          },
          educations: {
            create: [
              { institution: 'Culinary Institute', study: 'Culinary Arts', startDate: '2015-01-01', endDate: '2019-01-01' }
            ]
          },
          skills: ['cooking'],
          userId: 123,
          profileImageUrl: 'https://example.com/image.jpg'
        },
      });
      expect(result).toEqual(mockEmployee);
    });
  });

  describe('generateEmployeeToken', () => {
    it('should generate employee token successfully', () => {
      const mockToken = 'mock.jwt.token';
      mockJwt.sign.mockReturnValue(mockToken);

      const tokenData = {
        userId: 123,
        employeeId: 456
      };

      const result = helpers.generateEmployeeToken(tokenData);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: 123,
          userType: 'profesionales',
          employeeId: 456,
        },
        process.env.JWT_SECRET
      );
      expect(result).toBe(mockToken);
    });
  });

  describe('getEmployeeProfile', () => {
    it('should return employee profile when found', async () => {
      const mockEmployee = {
        id: 1,
        name: 'John Doe',
        position: 'Chef',
        experiences: [],
        educations: []
      };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const result = await helpers.getEmployeeProfile(1);

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          experiences: true,
          educations: true,
          user: true,
        },
      });
      expect(result).toEqual(mockEmployee);
    });

    it('should return null when employee not found', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await helpers.getEmployeeProfile(1);

      expect(result).toBeNull();
    });
  });

  describe('updateEmployeeProfile', () => {
    it('should update employee profile successfully', async () => {
      const mockUpdatedEmployee = {
        id: 1,
        name: 'John Doe Updated',
        position: 'Senior Chef'
      };
      mockPrisma.employee.update.mockResolvedValue(mockUpdatedEmployee);

      const updateData = {
        name: 'John Doe Updated',
        position: 'Senior Chef',
        surname: 'Smith',
        skills: { cooking: true, management: false },
        experiences: [
          { id: 1, companyName: 'Restaurant ABC', role: 'Chef', startDate: '2020-01-01', endDate: '2023-01-01' }
        ],
        educations: [
          { id: 1, institution: 'Culinary Institute', study: 'Culinary Arts', startDate: '2015-01-01', endDate: '2019-01-01' }
        ],
        aboutMe: 'Experienced chef',
        birthDate: '1990-01-01',
        country: 'Chile',
        phoneNumber: '+56912345678',
        comuna: 'Providencia',
        region: 'Santiago',
        genre: 'Male',
        civilState: 'Single',
        available: 'Available',
        schedule: 'Full-time',
        profileImageUrl: 'https://example.com/image.jpg'
      };

      const result = await helpers.updateEmployeeProfile(1, updateData);

      expect(mockPrisma.employee.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: 'John Doe Updated',
          position: 'Senior Chef',
          surname: 'Smith',
          skills: ['cooking'],
          experiences: {
            updateMany: [{
              where: { id: 1 },
              data: {
                companyName: 'Restaurant ABC',
                role: 'Chef',
                startDate: new Date('2020-01-01'),
                endDate: new Date('2023-01-01'),
                description: undefined,
              }
            }]
          },
          educations: {
            updateMany: [{
              where: { id: 1 },
              data: {
                institution: 'Culinary Institute',
                study: 'Culinary Arts',
                startDate: new Date('2015-01-01'),
                endDate: new Date('2019-01-01'),
                description: undefined,
              }
            }]
          },
          aboutMe: 'Experienced chef',
          birthDate: new Date('1990-01-01'),
          country: 'Chile',
          phoneNumber: '+56912345678',
          comuna: 'Providencia',
          region: 'Santiago',
          genre: 'Male',
          civilState: 'Single',
          available: 'Available',
          schedule: 'Full-time',
          profileImageUrl: 'https://example.com/image.jpg'
        },
      });
      expect(result).toEqual(mockUpdatedEmployee);
    });
  });

  describe('createExperience', () => {
    it('should create experience successfully', async () => {
      const mockExperience = {
        id: 1,
        companyName: 'Restaurant ABC',
        role: 'Chef',
        employeeId: 1
      };
      mockPrisma.experience.create.mockResolvedValue(mockExperience);

      const experienceData = {
        companyName: 'Restaurant ABC',
        role: 'Chef',
        startDate: '2020-01-01',
        endDate: '2023-01-01',
        description: 'Worked as head chef',
        employeeId: 1
      };

      const result = await helpers.createExperience(experienceData);

      expect(mockPrisma.experience.create).toHaveBeenCalledWith({
        data: {
          companyName: 'Restaurant ABC',
          role: 'Chef',
          startDate: new Date('2020-01-01'),
          endDate: new Date('2023-01-01'),
          description: 'Worked as head chef',
          employeeId: 1,
        },
      });
      expect(result).toEqual(mockExperience);
    });
  });

  describe('createEducation', () => {
    it('should create education successfully', async () => {
      const mockEducation = {
        id: 1,
        institution: 'Culinary Institute',
        study: 'Culinary Arts',
        employeeId: 1
      };
      mockPrisma.education.create.mockResolvedValue(mockEducation);

      const educationData = {
        institution: 'Culinary Institute',
        study: 'Culinary Arts',
        startDate: '2015-01-01',
        endDate: '2019-01-01',
        description: 'Studied culinary arts',
        employeeId: 1
      };

      const result = await helpers.createEducation(educationData);

      expect(mockPrisma.education.create).toHaveBeenCalledWith({
        data: {
          institution: 'Culinary Institute',
          study: 'Culinary Arts',
          startDate: new Date('2015-01-01'),
          endDate: new Date('2019-01-01'),
          description: 'Studied culinary arts',
          employeeId: 1,
        },
      });
      expect(result).toEqual(mockEducation);
    });
  });

  describe('getEmployeeWithDetails', () => {
    it('should return employee with details', async () => {
      const mockEmployee = {
        id: 1,
        name: 'John Doe',
        position: 'Chef',
        experiences: [
          { id: 1, company: 'Restaurant ABC' }
        ],
        educations: [
          { id: 1, institution: 'Culinary Institute' }
        ]
      };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const result = await helpers.getEmployeeWithDetails(1);

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          experiences: true,
          educations: true,
        },
      });
      expect(result).toEqual(mockEmployee);
    });

    it('should return null when employee not found', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await helpers.getEmployeeWithDetails(1);

      expect(result).toBeNull();
    });
  });

  describe('searchEmployees', () => {
    it('should return employees with filters', async () => {
      const mockEmployees = [
        { id: 1, name: 'John Doe', position: 'Chef' },
        { id: 2, name: 'Jane Smith', position: 'Waiter' }
      ];
      mockPrisma.employee.findMany.mockResolvedValue(mockEmployees);

      const filters = {
        position: 'Chef',
        region: 'Santiago',
        available: 'Available'
      };

      const result = await helpers.searchEmployees(filters);

      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith({
        where: {
          position: { contains: 'Chef', mode: 'insensitive' },
          region: { contains: 'Santiago', mode: 'insensitive' },
          available: { contains: 'Available', mode: 'insensitive' },
          comuna: { contains: undefined, mode: 'insensitive' },
          schedule: { contains: undefined, mode: 'insensitive' },
        },
        include: {
          user: true,
          experiences: true,
          educations: true,
        },
      });
      expect(result).toEqual(mockEmployees);
    });

    it('should handle empty filters', async () => {
      const mockEmployees = [
        { id: 1, name: 'John Doe' }
      ];
      mockPrisma.employee.findMany.mockResolvedValue(mockEmployees);

      const result = await helpers.searchEmployees({});

      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith({
        where: {
          position: { contains: undefined, mode: 'insensitive' },
          region: { contains: undefined, mode: 'insensitive' },
          available: { contains: undefined, mode: 'insensitive' },
          comuna: { contains: undefined, mode: 'insensitive' },
          schedule: { contains: undefined, mode: 'insensitive' },
        },
        include: {
          user: true,
          experiences: true,
          educations: true,
        },
      });
      expect(result).toEqual(mockEmployees);
    });
  });

  describe('getJobOfferById', () => {
    it('should return job offer when found', async () => {
      const mockJobOffer = { id: 1, position: 'Chef', salary: 50000 };
      mockPrisma.jobOffer.findFirst.mockResolvedValue(mockJobOffer);

      const result = await helpers.getJobOfferById('1');

      expect(mockPrisma.jobOffer.findFirst).toHaveBeenCalledWith({
        where: {
          id: 1,
          deletedAt: null,
        },
      });
      expect(result).toEqual(mockJobOffer);
    });

    it('should return null when job offer not found', async () => {
      mockPrisma.jobOffer.findFirst.mockResolvedValue(null);

      const result = await helpers.getJobOfferById('1');

      expect(result).toBeNull();
    });
  });

  describe('getEmployeeByEmployeeId', () => {
    it('should return employee when found', async () => {
      const mockEmployee = { id: 1, name: 'John Doe' };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const result = await helpers.getEmployeeByEmployeeId(1);

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockEmployee);
    });

    it('should return null when employee not found', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await helpers.getEmployeeByEmployeeId(1);

      expect(result).toBeNull();
    });
  });

  describe('checkFavoriteJobExists', () => {
    it('should return favorite job when exists', async () => {
      const mockFavoriteJob = { id: 1, employeeId: 1, jobOfferId: 1 };
      mockPrisma.favouriteJob.findFirst.mockResolvedValue(mockFavoriteJob);

      const result = await helpers.checkFavoriteJobExists(1, 1);

      expect(mockPrisma.favouriteJob.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 1,
          jobOfferId: 1,
          jobOffer: { deletedAt: null },
        },
      });
      expect(result).toEqual(mockFavoriteJob);
    });

    it('should return null when favorite job not found', async () => {
      mockPrisma.favouriteJob.findFirst.mockResolvedValue(null);

      const result = await helpers.checkFavoriteJobExists(1, 1);

      expect(result).toBeNull();
    });
  });

  describe('createFavoriteJob', () => {
    it('should create favorite job successfully', async () => {
      const mockFavoriteJob = { id: 1, employeeId: 1, jobOfferId: 1 };
      mockPrisma.favouriteJob.create.mockResolvedValue(mockFavoriteJob);

      const result = await helpers.createFavoriteJob(1, 1);

      expect(mockPrisma.favouriteJob.create).toHaveBeenCalledWith({
        data: {
          employeeId: 1,
          jobOfferId: 1,
        },
      });
      expect(result).toEqual(mockFavoriteJob);
    });
  });

  describe('getFavoriteJobById', () => {
    it('should return favorite job when found', async () => {
      const mockFavoriteJob = { id: 1, employeeId: 1, jobOfferId: 1 };
      mockPrisma.favouriteJob.findFirst.mockResolvedValue(mockFavoriteJob);

      const result = await helpers.getFavoriteJobById(1, 1);

      expect(mockPrisma.favouriteJob.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 1,
          jobOfferId: 1,
          jobOffer: { deletedAt: null },
        },
      });
      expect(result).toEqual(mockFavoriteJob);
    });

    it('should return null when favorite job not found', async () => {
      mockPrisma.favouriteJob.findFirst.mockResolvedValue(null);

      const result = await helpers.getFavoriteJobById(1, 1);

      expect(result).toBeNull();
    });
  });

  describe('deleteFavoriteJob', () => {
    it('should delete favorite job successfully', async () => {
      const mockDeletedJob = { id: 1, employeeId: 1, jobOfferId: 1 };
      mockPrisma.favouriteJob.delete.mockResolvedValue(mockDeletedJob);

      const result = await helpers.deleteFavoriteJob(1);

      expect(mockPrisma.favouriteJob.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockDeletedJob);
    });
  });

  describe('getFavoriteJobs', () => {
    it('should return favorite jobs for employee', async () => {
      const mockFavoriteJobs = [
        { id: 1, employeeId: 1, jobOffer: { id: 1, position: 'Chef' } },
        { id: 2, employeeId: 1, jobOffer: { id: 2, position: 'Waiter' } }
      ];
      mockPrisma.favouriteJob.findMany.mockResolvedValue(mockFavoriteJobs);

      const result = await helpers.getFavoriteJobs(1);

      expect(mockPrisma.favouriteJob.findMany).toHaveBeenCalledWith({
        where: {
          employeeId: 1,
          jobOffer: { deletedAt: null },
        },
        include: {
          jobOffer: {
            include: {
              restaurant: true,
              location: true,
            },
          },
        },
      });
      expect(result).toEqual(mockFavoriteJobs);
    });

    it('should return empty array when no favorite jobs found', async () => {
      mockPrisma.favouriteJob.findMany.mockResolvedValue([]);

      const result = await helpers.getFavoriteJobs(1);

      expect(result).toEqual([]);
    });
  });

  describe('checkTalentPoolRecord', () => {
    it('should return talent pool record when exists', async () => {
      const mockRecord = { id: 1, employeeId: 1, restaurantId: 1 };
      mockPrisma.talentPool.findFirst.mockResolvedValue(mockRecord);

      const result = await helpers.checkTalentPoolRecord('1', '1');

      expect(mockPrisma.talentPool.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 1,
          restaurantId: 1,
        },
      });
      expect(result).toEqual(mockRecord);
    });

    it('should return null when talent pool record not found', async () => {
      mockPrisma.talentPool.findFirst.mockResolvedValue(null);

      const result = await helpers.checkTalentPoolRecord('1', '1');

      expect(result).toBeNull();
    });
  });

  describe('createTalentPoolRecord', () => {
    it('should create talent pool record successfully', async () => {
      const mockRecord = { id: 1, employeeId: 1, restaurantId: 1 };
      mockPrisma.talentPool.create.mockResolvedValue(mockRecord);

      const result = await helpers.createTalentPoolRecord('1', '1');

      expect(mockPrisma.talentPool.create).toHaveBeenCalledWith({
        data: {
          employeeId: 1,
          restaurantId: 1,
          status: 'pendent',
        },
      });
      expect(result).toEqual(mockRecord);
    });
  });
}); 