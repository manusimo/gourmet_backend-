const { prisma } = require("../db.js");
const jwt = require('jsonwebtoken');

/**
 * Get employee profile by ID
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Employee profile or null if not found
 */
const getEmployeeById = async (employeeId) => {
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
const getEmployeeByUserId = async (userId) => {
  return await prisma.employee.findUnique({
    where: { userId },
  });
};

/**
 * Create employee profile
 * @param {Object} employeeData - Employee data
 * @returns {Object} Created employee profile
 */
const createEmployeeProfile = async (employeeData) => {
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

  // Handle skills - can be array (from frontend) or object
  const skillsArray = Array.isArray(skills)
    ? skills.filter(skill => skill && !/^\d+$/.test(skill.toString())) // Filter out numeric strings
    : Object.keys(skills).filter(skill => skills[skill] && !/^\d+$/.test(skill));

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
const generateEmployeeToken = (tokenData) => {
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
const getEmployeeProfile = async (employeeId) => {
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
const filterNewExperiences = (experiences) => {
  return experiences.filter(experience => !experience.id);
};

/**
 * Filter existing experiences from experiences array
 * @param {Array} experiences - All experiences
 * @returns {Array} Existing experiences (with ID)
 */
const filterExistingExperiences = (experiences) => {
  return experiences.filter(experience => experience.id);
};

/**
 * Filter new educations from educations array
 * @param {Array} educations - All educations
 * @returns {Array} New educations (without ID)
 */
const filterNewEducations = (educations) => {
  return educations.filter(education => !education.id);
};

/**
 * Filter existing educations from educations array
 * @param {Array} educations - All educations
 * @returns {Array} Existing educations (with ID)
 */
const filterExistingEducations = (educations) => {
  return educations.filter(education => education.id);
};

/**
 * Update employee profile
 * @param {number} employeeId - Employee ID
 * @param {Object} updateData - Data to update
 * @returns {Object} Updated employee
 */
const updateEmployeeProfile = async (employeeId, updateData) => {
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
      // Handle skills - can be array (from frontend) or object
      skills: Array.isArray(skills) 
        ? skills.filter(skill => skill && !/^\d+$/.test(skill.toString())) // Filter out numeric strings
        : Object.keys(skills).filter(skill => skills[skill] && !/^\d+$/.test(skill)),
    },
  });
};

/**
 * Create new experience
 * @param {Object} experienceData - Experience data
 * @returns {Object} Created experience
 */
const createExperience = async (experienceData) => {
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
const createEducation = async (educationData) => {
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
 * Synchronize experiences: delete removed, update existing, create new
 * @param {number} employeeId - Employee ID
 * @param {Array} incomingExperiences - Experiences from request
 * @param {Object} currentEmployee - Optional current employee data to avoid extra DB call
 * @returns {Object} Result with counts
 */
const synchronizeExperiences = async (employeeId, incomingExperiences = [], currentEmployee = null) => {
  // Get current experiences (use provided data or fetch if needed)
  if (!currentEmployee) {
    currentEmployee = await getEmployeeWithDetails(employeeId);
  }
  const existingExperienceIds = (currentEmployee?.experiences || []).map(exp => exp.id);
  const incomingExperienceIds = incomingExperiences.filter(exp => exp?.id).map(exp => exp.id);
  
  // Find IDs to delete (existing but not in incoming)
  const experienceIdsToDelete = existingExperienceIds.filter(id => !incomingExperienceIds.includes(id));
  
  // Delete removed experiences
  let deletedCount = 0;
  if (experienceIdsToDelete.length > 0) {
    const result = await prisma.experience.deleteMany({
      where: {
        id: { in: experienceIdsToDelete },
        employeeId: employeeId
      }
    });
    deletedCount = result.count;
  }
  
  // Create new experiences (those without IDs)
  const newExperiences = incomingExperiences.filter(exp => !exp?.id);
  let createdCount = 0;
  for (const experience of newExperiences) {
    await createExperience({ ...experience, employeeId });
    createdCount++;
  }
  
  return { deletedCount, createdCount, updatedCount: incomingExperiences.filter(exp => exp?.id).length };
};

/**
 * Synchronize educations: delete removed, update existing, create new
 * @param {number} employeeId - Employee ID
 * @param {Array} incomingEducations - Educations from request
 * @param {Object} currentEmployee - Optional current employee data to avoid extra DB call
 * @returns {Object} Result with counts
 */
const synchronizeEducations = async (employeeId, incomingEducations = [], currentEmployee = null) => {
  // Get current educations (use provided data or fetch if needed)
  if (!currentEmployee) {
    currentEmployee = await getEmployeeWithDetails(employeeId);
  }
  const existingEducationIds = (currentEmployee?.educations || []).map(edu => edu.id);
  const incomingEducationIds = incomingEducations.filter(edu => edu?.id).map(edu => edu.id);
  
  // Find IDs to delete (existing but not in incoming)
  const educationIdsToDelete = existingEducationIds.filter(id => !incomingEducationIds.includes(id));
  
  // Delete removed educations
  let deletedCount = 0;
  if (educationIdsToDelete.length > 0) {
    const result = await prisma.education.deleteMany({
      where: {
        id: { in: educationIdsToDelete },
        employeeId: employeeId
      }
    });
    deletedCount = result.count;
    console.log(`🗑️ Deleted ${deletedCount} education(s)`);
  }
  
  // Create new educations (those without IDs)
  const newEducations = incomingEducations.filter(edu => !edu?.id);
  let createdCount = 0;
  for (const education of newEducations) {
    await createEducation({ ...education, employeeId });
    createdCount++;
  }
  
  return { deletedCount, createdCount, updatedCount: incomingEducations.filter(edu => edu?.id).length };
};

/**
 * Get employee with full details
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Employee with full details or null
 */
const getEmployeeWithDetails = async (employeeId) => {
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
const searchEmployees = async (searchFilters) => {
  const { position, experience, region, comuna, available, schedule } = searchFilters;
  
  // Build where conditions dynamically based on provided filters
  const whereConditions = {};
  
  if (position && position.trim() !== '') {
    whereConditions.position = {
      contains: position,
      mode: 'insensitive',
    };
  }
  
  if (region && region.trim() !== '') {
    whereConditions.region = {
      contains: region,
      mode: 'insensitive',
    };
  }
  
  if (comuna && comuna.trim() !== '') {
    whereConditions.comuna = {
      contains: comuna,
      mode: 'insensitive',
    };
  }
  
  if (available && available.trim() !== '') {
    whereConditions.available = {
      contains: available,
      mode: 'insensitive',
    };
  }
  
  if (schedule && schedule.trim() !== '') {
    whereConditions.schedule = {
      contains: schedule,
      mode: 'insensitive',
    };
  }
  
  if (experience && experience.trim() !== '') {
    whereConditions.yearsOfExperience = {
      contains: experience,
      mode: 'insensitive',
    };
  }
  
  console.log('🔍 Search where conditions:', whereConditions);
  
  return await prisma.employee.findMany({
    where: whereConditions,
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
const getJobOfferById = async (jobPostId) => {
  return await prisma.jobOffer.findFirst({
    where: { id: parseInt(jobPostId), deletedAt: null },
  });
};

/**
 * Get employee by employee ID
 * @param {number} employeeId - Employee ID
 * @returns {Object|null} Employee or null if not found
 */
const getEmployeeByEmployeeId = async (employeeId) => {
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
const checkFavoriteJobExists = async (employeeId, jobPostId) => {
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
const createFavoriteJob = async (employeeId, jobPostId) => {
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
const getFavoriteJobById = async (employeeId, jobPostId) => {
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
const deleteFavoriteJob = async (favoriteJobId) => {
  return await prisma.favouriteJob.delete({
    where: { id: favoriteJobId },
  });
};

/**
 * Get all favorite jobs for employee
 * @param {number} employeeId - Employee ID
 * @returns {Array} Array of favorite jobs
 */
const getFavoriteJobs = async (employeeId) => {
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
const checkTalentPoolRecord = async (employeeId, restaurantId) => {
  
  const record = await prisma.talentPool.findFirst({
    where: {
      employeeId: parseInt(employeeId),
      restaurantId: parseInt(restaurantId),
      deletedAt: null, // Only check for non-deleted records
    },
  });
  
  return record;
};

/**
 * Create talent pool record
 * @param {number} employeeId - Employee ID
 * @param {number} restaurantId - Restaurant ID
 * @returns {Object} Created talent pool record
 */
const createTalentPoolRecord = async (employeeId, restaurantId) => {
  return await prisma.talentPool.create({
    data: {
      employeeId: parseInt(employeeId),
      restaurantId: parseInt(restaurantId),
      status: 'pendent',
    },
  });
}; 

module.exports = {
  getEmployeeById,
  getEmployeeByUserId,
  createEmployeeProfile,
  generateEmployeeToken,
  getEmployeeProfile,
  filterNewExperiences,
  filterExistingExperiences,
  filterNewEducations,
  filterExistingEducations,
  updateEmployeeProfile,
  createExperience,
  createEducation,
  getEmployeeWithDetails,
  synchronizeExperiences,
  synchronizeEducations,
  searchEmployees,
  getJobOfferById,
  getEmployeeByEmployeeId,
  checkFavoriteJobExists,
  createFavoriteJob,
  getFavoriteJobById,
  deleteFavoriteJob,
  getFavoriteJobs,
  checkTalentPoolRecord,
  createTalentPoolRecord,
}; 