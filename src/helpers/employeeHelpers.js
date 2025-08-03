import { prisma } from "../db.js";
import jwt from 'jsonwebtoken';

/**
 * Get employee profile by ID
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Employee profile or null if not found
 */
export const getEmployeeById = async (employeeId) => {
  return await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      experiences: true,
      educations: true,
      user: true,
    },
  });
};

/**
 * Check if employee profile exists for user
 * @param {number} userId - User ID
 * @returns {Object|null} Employee profile or null if not found
 */
export const getEmployeeByUserId = async (userId) => {
  return await prisma.employee.findUnique({
    where: { userId },
  });
};

/**
 * Create employee profile
 * @param {Object} employeeData - Employee data
 * @returns {Object} Created employee profile
 */
export const createEmployeeProfile = async (employeeData) => {
  const {
    name,
    position,
    experiences,
    surname,
    skills,
    educations,
    aboutMe,
    birthDate,
    country,
    phoneNumber,
    comuna,
    region,
    genre,
    civilState,
    available,
    schedule,
    profileImageUrl,
    userId
  } = employeeData;

  const skillsArray = Object.keys(skills).filter(skill => skills[skill]);

  return await prisma.employee.create({
    data: {
      name,
      country,
      surname,
      birthDate,
      phoneNumber,
      position,
      aboutMe,
      region,
      comuna,
      schedule,
      available,
      experiences: { create: experiences },
      educations: { create: educations },
      skills: skillsArray,
      userId,
      profileImageUrl
    },
  });
};

/**
 * Generate JWT token for employee
 * @param {Object} tokenData - Token data
 * @returns {string} JWT token
 */
export const generateEmployeeToken = (tokenData) => {
  const { userId, employeeId } = tokenData;
  
  return jwt.sign(
    {
      userId: userId,
      userType: 'profesionales',
      employeeId: employeeId,
    },
    process.env.JWT_SECRET
  );
};

/**
 * Get employee profile by employee ID
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Employee profile or null if not found
 */
export const getEmployeeProfile = async (employeeId) => {
  return await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      experiences: true,
      educations: true,
      user: true,
    },
  });
};

/**
 * Filter new experiences from experiences array
 * @param {Array} experiences - All experiences
 * @returns {Array} New experiences (without ID)
 */
export const filterNewExperiences = (experiences) => {
  return experiences.filter(experience => !experience.id);
};

/**
 * Filter existing experiences from experiences array
 * @param {Array} experiences - All experiences
 * @returns {Array} Existing experiences (with ID)
 */
export const filterExistingExperiences = (experiences) => {
  return experiences.filter(experience => experience.id);
};

/**
 * Filter new educations from educations array
 * @param {Array} educations - All educations
 * @returns {Array} New educations (without ID)
 */
export const filterNewEducations = (educations) => {
  return educations.filter(education => !education.id);
};

/**
 * Filter existing educations from educations array
 * @param {Array} educations - All educations
 * @returns {Array} Existing educations (with ID)
 */
export const filterExistingEducations = (educations) => {
  return educations.filter(education => education.id);
};

/**
 * Update employee profile
 * @param {number} employeeId - Employee ID
 * @param {Object} updateData - Data to update
 * @returns {Object} Updated employee
 */
export const updateEmployeeProfile = async (employeeId, updateData) => {
  const {
    name,
    position,
    experiences,
    surname,
    period,
    yearsOfExperience,
    educations,
    skills,
    aboutMe,
    birthDate,
    region,
    comuna,
    country,
    phoneNumber,
    genre,
    civilState,
    available,
    schedule,
    profileImageUrl
  } = updateData;

  const newExperiences = filterNewExperiences(experiences);
  const existingExperiences = filterExistingExperiences(experiences);
  const newEducations = filterNewEducations(educations);
  const existingEducations = filterExistingEducations(educations);

  return await prisma.employee.update({
    where: { id: employeeId },
    data: {
      name,
      surname,
      country,
      birthDate: new Date(birthDate),
      phoneNumber,
      position,
      aboutMe,
      period,
      yearsOfExperience,
      region,
      comuna,
      schedule,
      available,
      genre,
      civilState,
      profileImageUrl,
      experiences: {
        updateMany: existingExperiences.map(exp => ({
          where: { id: exp.id },
          data: {
            companyName: exp.companyName,
            description: exp.description,
            startDate: new Date(exp.startDate),
            endDate: new Date(exp.endDate),
            role: exp.role,
          },
        })),
      },
      educations: {
        updateMany: existingEducations.map(edu => ({
          where: { id: edu.id },
          data: {
            institution: edu.institution,
            startDate: new Date(edu.startDate),
            study: edu.study,
            endDate: new Date(edu.endDate),
            description: edu.description,
          },
        })),
      },
      skills: Object.keys(skills).filter(skill => skills[skill]),
    },
  });
};

/**
 * Create new experience
 * @param {Object} experienceData - Experience data
 * @returns {Object} Created experience
 */
export const createExperience = async (experienceData) => {
  const { companyName, description, startDate, endDate, role, employeeId } = experienceData;
  
  return await prisma.experience.create({
    data: {
      companyName,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      role,
      employeeId,
    },
  });
};

/**
 * Create new education
 * @param {Object} educationData - Education data
 * @returns {Object} Created education
 */
export const createEducation = async (educationData) => {
  const { study, institution, startDate, endDate, description, employeeId } = educationData;
  
  return await prisma.education.create({
    data: {
      study,
      institution,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      description,
      employeeId,
    },
  });
};

/**
 * Get employee with full details
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Employee with full details or null
 */
export const getEmployeeWithDetails = async (employeeId) => {
  return await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      experiences: true,
      educations: true,
    },
  });
};

/**
 * Search employees with filters
 * @param {Object} searchFilters - Search filters
 * @returns {Array} Array of employees matching filters
 */
export const searchEmployees = async (searchFilters) => {
  const { position, experience, region, comuna, available, schedule } = searchFilters;
  
  return await prisma.employee.findMany({
    where: {
      position: {
        contains: position,
        mode: 'insensitive',
      },
      region: {
        contains: region,
        mode: 'insensitive',
      },
      comuna: {
        contains: comuna,
        mode: 'insensitive',
      },
      available: {
        contains: available,
        mode: 'insensitive',
      },
      schedule: {
        contains: schedule,
        mode: 'insensitive',
      },
    },
    include: {
      user: true,
      experiences: true,
      educations: true,
    },
  });
};

/**
 * Get job offer by ID
 * @param {number} jobPostId - Job post ID
 * @returns {Object|null} Job offer or null if not found
 */
export const getJobOfferById = async (jobPostId) => {
  return await prisma.jobOffer.findFirst({
    where: { id: parseInt(jobPostId), deletedAt: null },
  });
};

/**
 * Get employee by employee ID
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Employee or null if not found
 */
export const getEmployeeByEmployeeId = async (employeeId) => {
  return await prisma.employee.findUnique({
    where: { id: employeeId },
  });
};

/**
 * Check if favorite job exists
 * @param {number} employeeId - Employee ID
 * @param {number} jobPostId - Job post ID
 * @returns {Object|null} Favorite job or null if not found
 */
export const checkFavoriteJobExists = async (employeeId, jobPostId) => {
  return await prisma.favouriteJob.findFirst({
    where: {
      employeeId: employeeId,
      jobOfferId: parseInt(jobPostId),
      jobOffer: { deletedAt: null },
    },
  });
};

/**
 * Create favorite job
 * @param {number} employeeId - Employee ID
 * @param {number} jobPostId - Job post ID
 * @returns {Object} Created favorite job
 */
export const createFavoriteJob = async (employeeId, jobPostId) => {
  return await prisma.favouriteJob.create({
    data: {
      employeeId: employeeId,
      jobOfferId: parseInt(jobPostId),
    },
  });
};

/**
 * Get favorite job by ID
 * @param {number} employeeId - Employee ID
 * @param {number} jobPostId - Job post ID
 * @returns {Object|null} Favorite job or null if not found
 */
export const getFavoriteJobById = async (employeeId, jobPostId) => {
  return await prisma.favouriteJob.findFirst({
    where: {
      jobOfferId: parseInt(jobPostId),
      employeeId: employeeId,
      jobOffer: { deletedAt: null },
    },
  });
};

/**
 * Delete favorite job
 * @param {number} favoriteJobId - Favorite job ID
 * @returns {Object} Deleted favorite job
 */
export const deleteFavoriteJob = async (favoriteJobId) => {
  return await prisma.favouriteJob.delete({
    where: { id: favoriteJobId },
  });
};

/**
 * Get all favorite jobs for employee
 * @param {number} employeeId - Employee ID
 * @returns {Array} Array of favorite jobs
 */
export const getFavoriteJobs = async (employeeId) => {
  return await prisma.favouriteJob.findMany({
    where: {
      employeeId: employeeId,
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
};

/**
 * Check if talent pool record exists
 * @param {number} employeeId - Employee ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object|null} Talent pool record or null if not found
 */
export const checkTalentPoolRecord = async (employeeId, restaurantId) => {
  return await prisma.talentPool.findFirst({
    where: {
      employeeId: parseInt(employeeId),
      restaurantId: parseInt(restaurantId),
    },
  });
};

/**
 * Create talent pool record
 * @param {number} employeeId - Employee ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Created talent pool record
 */
export const createTalentPoolRecord = async (employeeId, restaurantId) => {
  return await prisma.talentPool.create({
    data: {
      employeeId: parseInt(employeeId),
      restaurantId: parseInt(restaurantId),
      status: 'pendent',
    },
  });
}; 