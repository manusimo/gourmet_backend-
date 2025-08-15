const { body, param, query, validationResult } = require('express-validator');
const xss = require('xss');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

/**
 * Sanitize HTML content to prevent XSS
 */
const sanitizeHtml = (value) => {
  if (typeof value !== 'string') return value;
  return xss(value, {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script']
  });
};

/**
 * Custom sanitizer that escapes HTML and trims whitespace
 */
const sanitizeAndTrim = (value) => {
  if (typeof value !== 'string') return value;
  return sanitizeHtml(value.trim());
};

// ============================================================================
// CONTACT FORM VALIDATION
// ============================================================================
const validateContact = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .customSanitizer(sanitizeAndTrim),
  
  body('phone')
    .optional()
    .trim()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number')
    .customSanitizer(sanitizeAndTrim),
  
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Subject must be between 5 and 200 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('message')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Message must be between 10 and 5000 characters')
    .customSanitizer(sanitizeAndTrim),
  
  handleValidationErrors
];

// ============================================================================
// USER AUTHENTICATION VALIDATION
// ============================================================================
const validateSignup = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('passwordConfirmation')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),
  
  body('userType')
    .isIn(['profesionales', 'empresas'])
    .withMessage('User type must be either profesionales or empresas'),
  
  body('phoneNumber')
    .optional()
    .trim()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number')
    .customSanitizer(sanitizeAndTrim),
  
  handleValidationErrors
];

const validateSignin = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

// ============================================================================
// COMPANY PROFILE VALIDATION
// ============================================================================
const validateCompanyProfile = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('legalName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Legal name must be between 2 and 150 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('rut')
    .optional()
    .trim()
    .matches(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/)
    .withMessage('RUT must be in valid Chilean format (e.g., 12.345.678-9)')
    .customSanitizer(sanitizeAndTrim),
  
  body('region')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Region is required')
    .customSanitizer(sanitizeAndTrim),
  
  body('comuna')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Comuna is required')
    .customSanitizer(sanitizeAndTrim),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must not exceed 2000 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('specialty')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Specialty must not exceed 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('format')
    .optional()
    .isIn(['Restaurante', 'Bar', 'Cafetería', 'Food Truck', 'Catering', 'Hotel', 'Casino', 'Otro'])
    .withMessage('Invalid restaurant format'),
  
  body('numberOfRestaurants')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Number of restaurants must be between 1 and 1000'),
  
  body('workers')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Number of workers must be between 1 and 10000'),
  
  body('weeklyAverageClients')
    .optional()
    .isInt({ min: 0, max: 100000 })
    .withMessage('Weekly average clients must be between 0 and 100000'),
  
  body('benefits')
    .optional()
    .isArray()
    .withMessage('Benefits must be an array'),
  
  body('benefits.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each benefit must be between 1 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  handleValidationErrors
];

// ============================================================================
// EMPLOYEE PROFILE VALIDATION
// ============================================================================
const validateEmployeeProfile = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('surname')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Surname must be between 2 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('position')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Position must be between 2 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('country')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Country is required')
    .customSanitizer(sanitizeAndTrim),
  
  body('region')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Region is required')
    .customSanitizer(sanitizeAndTrim),
  
  body('comuna')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Comuna is required')
    .customSanitizer(sanitizeAndTrim),
  
  body('birthDate')
    .isISO8601()
    .withMessage('Birth date must be a valid date')
    .custom((value) => {
      const age = Math.floor((new Date() - new Date(value)) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 16 || age > 100) {
        throw new Error('Age must be between 16 and 100 years');
      }
      return true;
    }),
  
  body('phoneNumber')
    .trim()
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Please provide a valid phone number')
    .customSanitizer(sanitizeAndTrim),
  
  body('aboutMe')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('About me must not exceed 1000 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('schedule')
    .optional()
    .isIn(['Full-time', 'Part-time', 'Freelance', 'Contract'])
    .withMessage('Invalid schedule type'),
  
  body('available')
    .optional()
    .isIn(['Available', 'Not Available', 'Busy'])
    .withMessage('Invalid availability status'),
  
  body('genre')
    .optional()
    .isIn(['Male', 'Female', 'Other', 'Prefer not to say'])
    .withMessage('Invalid genre'),
  
  body('civilState')
    .optional()
    .isIn(['Single', 'Married', 'Divorced', 'Widowed', 'Other'])
    .withMessage('Invalid civil state'),
  
  handleValidationErrors
];

// ============================================================================
// JOB OFFER VALIDATION
// ============================================================================
const validateJobOffer = [
  body('position')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Position must be between 2 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('locationId')
    .isInt({ min: 1 })
    .withMessage('Location ID must be a valid number'),
  
  body('schedule')
    .isIn(['Full-time', 'Part-time', 'Freelance', 'Contract'])
    .withMessage('Invalid schedule type'),
  
  body('contract')
    .isIn(['Permanent', 'Temporary', 'Freelance', 'Internship'])
    .withMessage('Invalid contract type'),
  
  body('vacancies')
    .isInt({ min: 1, max: 100 })
    .withMessage('Vacancies must be between 1 and 100'),
  
  body('yearsOfExperience')
    .optional()
    .isInt({ min: 0, max: 50 })
    .withMessage('Years of experience must be between 0 and 50'),
  
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('requirements')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Requirements must not exceed 2000 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('functions')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Functions must not exceed 2000 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('salary')
    .isInt({ min: 100000, max: 10000000 })
    .withMessage('Salary must be between 100,000 and 10,000,000'),
  
  body('propina')
    .optional()
    .isIn(['Si', 'No'])
    .withMessage('Propina must be either Si or No'),
  
  body('questions')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Maximum 10 questions allowed'),
  
  body('questions.*.question')
    .optional()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Each question must be between 5 and 500 characters')
    .customSanitizer(sanitizeAndTrim),
  
  handleValidationErrors
];

// ============================================================================
// APPLICATION VALIDATION
// ============================================================================
const validateApplication = [
  body('jobPostId')
    .isInt({ min: 1 })
    .withMessage('Job post ID must be a valid number'),
  
  body('answers')
    .isArray({ min: 1 })
    .withMessage('At least one answer is required'),
  
  body('answers.*.questionId')
    .isInt({ min: 1 })
    .withMessage('Question ID must be a valid number'),
  
  body('answers.*.answer')
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Answer must be between 1 and 10000 characters')
    .customSanitizer(sanitizeAndTrim),
  
  handleValidationErrors
];

// ============================================================================
// CHAT MESSAGE VALIDATION
// ============================================================================
const validateChatMessage = [
  body('receiverId')
    .isInt({ min: 1 })
    .withMessage('Receiver ID must be a valid number'),
  
  body('content')
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Message content must be between 1 and 5000 characters')
    .customSanitizer(sanitizeAndTrim),
  
  body('conversationType')
    .isIn(['talent', 'application'])
    .withMessage('Conversation type must be either talent or application'),
  
  handleValidationErrors
];

// ============================================================================
// SEARCH AND FILTER VALIDATION
// ============================================================================
const validateJobSearch = [
  query('position')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Position search must be between 1 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  query('location')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Location search must be between 1 and 100 characters')
    .customSanitizer(sanitizeAndTrim),
  
  query('salary')
    .optional()
    .isInt({ min: 0, max: 10000000 })
    .withMessage('Salary must be a valid number'),
  
  query('schedule')
    .optional()
    .isIn(['Full-time', 'Part-time', 'Freelance', 'Contract'])
    .withMessage('Invalid schedule type'),
  
  query('experience')
    .optional()
    .isInt({ min: 0, max: 50 })
    .withMessage('Experience must be between 0 and 50 years'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive number'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

// ============================================================================
// ID PARAMETER VALIDATION
// ============================================================================
const validateId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a valid positive number'),
  
  handleValidationErrors
];

const validateJobId = [
  param('jobId')
    .isInt({ min: 1 })
    .withMessage('Job ID must be a valid positive number'),
  
  handleValidationErrors
];

const validateUserId = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a valid positive number'),
  
  handleValidationErrors
];

const validateEmployeeId = [
  param('employeeId')
    .isInt({ min: 1 })
    .withMessage('Employee ID must be a valid positive number'),
  
  handleValidationErrors
];

const validateJobPostId = [
  param('jobPostId')
    .isInt({ min: 1 })
    .withMessage('Job post ID must be a valid positive number'),
  
  handleValidationErrors
];

const validateConversationId = [
  param('conversationId')
    .isInt({ min: 1 })
    .withMessage('Conversation ID must be a valid positive number'),
  
  handleValidationErrors
];

// ============================================================================
// PASSWORD RESET VALIDATION
// ============================================================================
const validatePasswordReset = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  handleValidationErrors
];

const validatePasswordResetConfirm = [
  body('token')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Reset token is required'),
  
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),
  
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateContact,
  validateSignup,
  validateSignin,
  validateCompanyProfile,
  validateEmployeeProfile,
  validateJobOffer,
  validateApplication,
  validateChatMessage,
  validateJobSearch,
  validateId,
  validateJobId,
  validateUserId,
  validateEmployeeId,
  validateJobPostId,
  validateConversationId,
  validatePasswordReset,
  validatePasswordResetConfirm,
}; 