/**
 * Validate Google OAuth request
 * @param {Object} body - Request body
 * @returns {Object} Validation result
 */
const validateGoogleOAuthRequest = (body) => {
  const { credential, userType } = body;
  
  if (!credential) {
    return {
      isValid: false,
      error: {
        success: false,
        message: 'Google credential is required'
      }
    };
  }
  
  if (!userType) {
    return {
      isValid: false,
      error: {
        success: false,
        message: 'User type is required'
      }
    };
  }
  
  if (!['profesionales', 'empresas'].includes(userType)) {
    return {
      isValid: false,
      error: {
        success: false,
        message: 'Invalid user type. Must be "profesionales" or "empresas"'
      }
    };
  }
  
  return { isValid: true };
};

/**
 * Handle Google OAuth errors
 * @param {Error} error - Error object
 * @returns {Object} Error response
 */
const handleGoogleOAuthError = (error) => {
  console.error('Google OAuth error:', error);
  
  // Handle specific error types
  if (error.message.includes('already registered')) {
    return {
      status: 400,
      response: {
        success: false,
        message: error.message
      }
    };
  }
  
  if (error.message.includes('Invalid token')) {
    return {
      status: 401,
      response: {
        success: false,
        message: 'Invalid Google token'
      }
    };
  }
  
  // Default error
  return {
    status: 500,
    response: {
      success: false,
      message: 'Google sign-in failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    }
  };
};

module.exports = {
  validateGoogleOAuthRequest,
  handleGoogleOAuthError
};
