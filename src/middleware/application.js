const { checkEmployee } = require('../helpers/authenticateToken.js');
const { getEmployeeIdFromCookie } = require('../helpers/cookies.js');
const { validateApplication } = require('./validation.js');

// Verify validateApplication is imported correctly
if (!validateApplication || !Array.isArray(validateApplication)) {
  throw new Error('validateApplication middleware not properly imported from validation.js');
}

/**
 * Combined middleware for application creation
 * Combines: authentication check + employee ID extraction + validation
 */
const authenticateAndValidateApplication = [
  checkEmployee,
  getEmployeeIdFromCookie,
  ...validateApplication  // Spread the validation array
];

module.exports = {
  authenticateAndValidateApplication
};

