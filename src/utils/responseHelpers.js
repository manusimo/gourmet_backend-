/**
 * Standardized response helpers to reduce code duplication
 * Provides consistent error and success responses across all routes
 */

/**
 * Send a standardized error response
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Object} [additionalData] - Additional data to include in response
 */
const sendErrorResponse = (res, statusCode, message, additionalData = {}) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...additionalData
  });
};

/**
 * Send a standardized success response
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {string} message - Success message
 * @param {Object} [data] - Data to include in response
 */
const sendSuccessResponse = (res, statusCode = 200, message, data = null) => {
  const response = {
    success: true,
    ...(message && { message }),
    ...(data && { data })
  };
  return res.status(statusCode).json(response);
};

/**
 * Check if a resource exists, return 404 if not
 * @param {Response} res - Express response object
 * @param {Object|null} resource - Resource to check
 * @param {string} resourceName - Name of the resource (for error message)
 * @returns {boolean} - True if resource exists, false if 404 was sent
 */
const requireResource = (res, resource, resourceName) => {
  if (!resource) {
    sendErrorResponse(res, 404, `${resourceName} no encontrado.`);
    return false;
  }
  return true;
};

/**
 * Check if a resource already exists (for duplicate checks), return 409 if exists
 * @param {Response} res - Express response object
 * @param {Object|null} existingResource - Existing resource to check
 * @param {string} message - Custom error message (default: generic conflict message)
 * @returns {boolean} - True if no conflict, false if 409 was sent
 */
const checkForConflict = (res, existingResource, message = 'Este recurso ya existe.') => {
  if (existingResource) {
    sendErrorResponse(res, 409, message);
    return false;
  }
  return true;
};

/**
 * Validate and parse an ID parameter
 * @param {string} id - ID string to validate
 * @param {string} resourceName - Name of the resource (for error message)
 * @returns {Object} - { isValid: boolean, parsedId: number|null, error: string|null }
 */
const validateId = (id, resourceName = 'ID') => {
  if (!id) {
    return {
      isValid: false,
      parsedId: null,
      error: `${resourceName} es requerido`
    };
  }

  const parsedId = parseInt(id);
  
  if (isNaN(parsedId) || parsedId <= 0 || parsedId > Number.MAX_SAFE_INTEGER) {
    return {
      isValid: false,
      parsedId: null,
      error: `${resourceName} inválido`
    };
  }

  return {
    isValid: true,
    parsedId,
    error: null
  };
};

/**
 * Validate ID and send error response if invalid
 * @param {Response} res - Express response object
 * @param {string} id - ID string to validate
 * @param {string} resourceName - Name of the resource (for error message)
 * @returns {Object|null} - Parsed ID if valid, null if error was sent
 */
const requireValidId = (res, id, resourceName = 'ID') => {
  const validation = validateId(id, resourceName);
  
  if (!validation.isValid) {
    sendErrorResponse(res, 400, validation.error);
    return null;
  }
  
  return validation.parsedId;
};

/**
 * Handle Prisma errors and send appropriate responses
 * @param {Response} res - Express response object
 * @param {Error} error - Prisma error object
 * @param {Object} errorMessages - Custom error messages for specific error codes
 * @returns {boolean} - True if error was handled, false if it should be handled elsewhere
 */
const handlePrismaError = (res, error, errorMessages = {}) => {
  const defaultMessages = {
    'P2025': 'Este recurso ya no está disponible.',
    'P2002': 'Este recurso ya existe.',
    'P2000': 'Formato de datos inválido.',
    'P2003': 'Referencia inválida.',
  };

  if (error.code && (errorMessages[error.code] || defaultMessages[error.code])) {
    const statusCode = error.code === 'P2025' ? 400 : 
                      error.code === 'P2002' ? 409 : 400;
    
    sendErrorResponse(
      res, 
      statusCode, 
      errorMessages[error.code] || defaultMessages[error.code]
    );
    return true;
  }

  return false;
};

/**
 * Handle application errors comprehensively
 * Handles service errors, Prisma errors, and generic errors
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} options - Options for error handling
 * @param {Object} options.context - Additional context for logging (jobPostId, employeeId, etc.)
 * @param {Object} options.customMessages - Custom error messages for specific error codes
 * @param {Function} options.logger - Logger function (optional)
 * @returns {boolean} - True if error was handled
 */
const handleApplicationError = (res, error, options = {}) => {
  const { context = {}, customMessages = {}, logger = null } = options;

  // Log error if logger provided
  if (logger) {
    logger.error('Application error', {
      ...context,
      error: error.message,
      errorCode: error.code,
      stack: error.stack
    });
  }

  // Handle service-level errors (with statusCode)
  if (error.statusCode) {
    return sendErrorResponse(res, error.statusCode, error.message);
  }

  // Handle Prisma unique constraint violation (race condition protection)
  if (error.code === 'P2002') {
    if (logger) {
      logger.warn('Duplicate detected (race condition)', {
        ...context,
        error: error.meta?.target
      });
    }
    return sendErrorResponse(res, 409, 'Ya postulaste a este trabajo.');
  }

  // Handle Prisma-specific errors
  const prismaMessages = {
    'P2025': 'Este trabajo ya no está disponible.',
    'P2003': 'Referencia inválida al trabajo o empleado.',
    ...customMessages
  };

  if (handlePrismaError(res, error, prismaMessages)) {
    return true;
  }

  // Generic error response
  sendErrorResponse(res, 500, 'Hemos tenido un error, intenta más tarde.');
  return true;
};

/**
 * Create a standardized authentication error
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {string} [code] - Error code
 * @returns {Error} Error object with statusCode and code
 */
const createAuthError = (message, statusCode, code = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
};

/**
 * Handle authentication errors comprehensively
 * Handles service errors, Prisma errors, and generic errors for auth endpoints
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} options - Options for error handling
 * @param {Object} options.context - Additional context for logging (email, userId, etc.)
 * @param {Object} options.customMessages - Custom error messages for specific error codes
 * @param {Function} options.logger - Logger function (optional)
 * @returns {boolean} - True if error was handled
 */
const handleAuthError = (res, error, options = {}) => {
  const { context = {}, customMessages = {}, logger = null } = options;

  // Log error if logger provided
  if (logger) {
    logger.error('Auth error', {
      ...context,
      error: error.message,
      errorCode: error.code,
      stack: error.stack
    });
  }

  // Handle service-level errors (with statusCode)
  if (error.statusCode) {
    // Handle account lockout (423) with data
    if (error.statusCode === 423 && error.data) {
      return res.status(423).json({
        success: false,
        message: error.message,
        data: error.data
      });
    }

    // Handle MFA required (403) with requiresMFA flag
    if (error.statusCode === 403 && error.requiresMFA) {
      return res.status(403).json({
        success: false,
        message: error.message,
        requiresMFA: true
      });
    }

    // Handle invalid credentials (401) with attempts remaining data
    if (error.statusCode === 401 && error.data) {
      return res.status(401).json({
        success: false,
        message: error.message,
        data: error.data
      });
    }

    // Default service-level error response
    const responseData = {
      error: error.code || 'AUTH_ERROR'
    };
    return sendErrorResponse(res, error.statusCode, error.message, responseData);
  }

  // Handle email already exists (duplicate signup)
  if (error.code === 'EMAIL_ALREADY_EXISTS' || error.code === 'P2002') {
    if (logger) {
      logger.warn('Duplicate signup detected', { ...context, email: context.email });
    }
    return sendErrorResponse(res, 409, 'Este email ya está registrado. Por favor, inicia sesión o utiliza otro email.', {
      error: 'EMAIL_ALREADY_EXISTS'
    });
  }

  // Handle Prisma-specific errors
  const prismaMessages = {
    'P2002': 'Este email ya está registrado. Por favor, inicia sesión o utiliza otro email.',
    'P2000': 'Formato de datos inválido.',
    'P2003': 'Referencia inválida.',
    ...customMessages
  };

  if (handlePrismaError(res, error, prismaMessages)) {
    return true;
  }

  // Generic error response
  const errorMessage = process.env.NODE_ENV === 'development' 
    ? error.message 
    : 'Ocurrió un error inesperado. Por favor, intenta nuevamente más tarde.';
  
  sendErrorResponse(res, 500, errorMessage);
  return true;
};

/**
 * Handle chat-related errors with consistent response format
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} options - Options for error handling
 * @param {Object} options.context - Additional context for logging
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.customMessages - Custom error messages for specific error codes
 * @returns {boolean} True if error was handled
 */
const handleChatError = (res, error, options = {}) => {
  const { context = {}, customMessages = {}, logger = null } = options;

  if (logger) {
    logger.error('Chat error', {
      ...context,
      error: error.message,
      errorCode: error.code,
      stack: error.stack
    });
  }

  // Handle service-level errors (with statusCode and code)
  if (error.statusCode) {
    const responseData = {
      error: error.code || 'CHAT_ERROR'
    };
    return sendErrorResponse(res, error.statusCode, error.message, responseData);
  }

  // Handle Prisma-specific errors
  const prismaMessages = {
    'P2002': 'Ya existe un registro con estos datos.',
    'P2000': 'Formato de datos inválido.',
    'P2003': 'Referencia inválida.',
    'P2025': 'Registro no encontrado.',
    ...customMessages
  };

  if (handlePrismaError(res, error, prismaMessages)) {
    return true;
  }

  // Generic error response
  const errorMessage = process.env.NODE_ENV === 'development'
    ? error.message
    : 'Ocurrió un error inesperado. Por favor, intenta nuevamente más tarde.';

  sendErrorResponse(res, 500, errorMessage);
  return true;
};

/**
 * Handle company-related errors with consistent response format
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} options - Options for error handling
 * @param {Object} options.context - Additional context for logging
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.customMessages - Custom error messages for specific error codes
 * @returns {boolean} True if error was handled
 */
const handleCompanyError = (res, error, options = {}) => {
  const { context = {}, customMessages = {}, logger = null } = options;

  if (logger) {
    logger.error('Company error', {
      ...context,
      error: error.message,
      errorCode: error.code,
      stack: error.stack
    });
  }

  // Handle service-level errors (with statusCode and code)
  if (error.statusCode) {
    const responseData = {
      error: error.code || 'COMPANY_ERROR'
    };
    return sendErrorResponse(res, error.statusCode, error.message, responseData);
  }

  // Handle Prisma-specific errors
  const prismaMessages = {
    'P2002': 'Ya existe un registro con estos datos.',
    'P2000': 'Formato de datos inválido.',
    'P2003': 'Referencia inválida.',
    'P2025': 'Registro no encontrado.',
    ...customMessages
  };

  if (handlePrismaError(res, error, prismaMessages)) {
    return true;
  }

  // Generic error response
  const errorMessage = process.env.NODE_ENV === 'development'
    ? error.message
    : 'Ocurrió un error inesperado. Por favor, intenta nuevamente más tarde.';

  sendErrorResponse(res, 500, errorMessage);
  return true;
};

/**
 * Handle employee-related errors with consistent response format
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} options - Options for error handling
 * @param {Object} options.context - Additional context for logging
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.customMessages - Custom error messages for specific error codes
 * @returns {boolean} True if error was handled
 */
const handleEmployeeError = (res, error, options = {}) => {
  const { context = {}, customMessages = {}, logger = null } = options;

  if (logger) {
    logger.error('Employee error', {
      ...context,
      error: error.message,
      errorCode: error.code,
      stack: error.stack
    });
  }

  // Handle service-level errors (with statusCode and code)
  if (error.statusCode) {
    const responseData = {
      error: error.code || 'EMPLOYEE_ERROR'
    };
    return sendErrorResponse(res, error.statusCode, error.message, responseData);
  }

  // Handle Prisma-specific errors
  const prismaMessages = {
    'P2002': 'Ya existe un registro con estos datos.',
    'P2000': 'Formato de datos inválido.',
    'P2003': 'Referencia inválida.',
    'P2025': 'Registro no encontrado.',
    ...customMessages
  };

  if (handlePrismaError(res, error, prismaMessages)) {
    return true;
  }

  // Generic error response
  const errorMessage = process.env.NODE_ENV === 'development'
    ? error.message
    : 'Ocurrió un error inesperado. Por favor, intenta nuevamente más tarde.';

  sendErrorResponse(res, 500, errorMessage);
  return true;
};

/**
 * Handle contact-related errors with consistent response format
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} options - Options for error handling
 * @param {Object} options.context - Additional context for logging
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.customMessages - Custom error messages for specific error codes
 * @returns {boolean} True if error was handled
 */
const handleContactError = (res, error, options = {}) => {
  const { context = {}, customMessages = {}, logger = null } = options;

  if (logger) {
    logger.error('Contact error', {
      ...context,
      error: error.message,
      errorCode: error.code,
      stack: error.stack
    });
  }

  // Handle service-level errors (with statusCode and code)
  if (error.statusCode) {
    const responseData = {
      error: error.code || 'CONTACT_ERROR'
    };
    return sendErrorResponse(res, error.statusCode, error.message, responseData);
  }

  // Handle Prisma-specific errors
  const prismaMessages = {
    'P2002': 'Duplicate submission detected',
    'P2000': 'Invalid data format',
    'P2003': 'Invalid reference',
    'P2025': 'Record not found',
    ...customMessages
  };

  if (handlePrismaError(res, error, prismaMessages)) {
    return true;
  }

  // Generic error response
  const errorMessage = process.env.NODE_ENV === 'development'
    ? error.message
    : 'Unable to process contact form. Please try again later.';

  sendErrorResponse(res, 500, errorMessage);
  return true;
};

/**
 * Handle notification-related errors with consistent response format
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} options - Options for error handling
 * @param {Object} options.context - Additional context for logging
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.customMessages - Custom error messages for specific error codes
 * @returns {boolean} True if error was handled
 */
const handleNotificationError = (res, error, options = {}) => {
  const { context = {}, customMessages = {}, logger = null } = options;

  if (logger) {
    logger.error('Notification error', {
      ...context,
      error: error.message,
      errorCode: error.code,
      stack: error.stack
    });
  }

  // Handle service-level errors (with statusCode and code)
  if (error.statusCode) {
    const responseData = {
      error: error.code || 'NOTIFICATION_ERROR'
    };
    return sendErrorResponse(res, error.statusCode, error.message, responseData);
  }

  // Handle Prisma-specific errors
  const prismaMessages = {
    'P2002': 'Duplicate notification detected',
    'P2000': 'Invalid data format',
    'P2003': 'Invalid reference',
    'P2025': 'Notification not found',
    ...customMessages
  };

  if (handlePrismaError(res, error, prismaMessages)) {
    return true;
  }

  // Generic error response
  const errorMessage = process.env.NODE_ENV === 'development'
    ? error.message
    : 'Failed to process notification request';

  sendErrorResponse(res, 500, errorMessage);
  return true;
};

/**
 * Handle RAG-related errors
 * @param {Response} res - Express response object
 * @param {Error} error - Error object
 * @param {Object} options - Options for error handling
 * @param {Object} options.context - Additional context for logging
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.customMessages - Custom error messages for specific error codes
 * @returns {boolean} True if error was handled
 */
const handleRagError = (res, error, options = {}) => {
  const { context = {}, customMessages = {}, logger = null } = options;

  if (logger) {
    logger.error('RAG error', {
      ...context,
      error: error.message,
      errorCode: error.code,
      stack: error.stack
    });
  }

  // Handle service-level errors (with statusCode and code)
  if (error.statusCode) {
    const responseData = {
      error: error.code || 'RAG_ERROR'
    };
    return sendErrorResponse(res, error.statusCode, error.message, responseData);
  }

  // Map common RAG error messages to status codes
  const errorMessage = error.message || '';
  
  if (errorMessage.includes('too short') || errorMessage.includes('Content too short') || errorMessage.includes('required')) {
    const responseData = {
      error: 'VALIDATION_ERROR'
    };
    return sendErrorResponse(res, 400, error.message || 'Invalid input provided', responseData);
  }

  if (errorMessage.includes('too long') || errorMessage.includes('Content too long')) {
    const responseData = {
      error: 'CONTENT_TOO_LONG'
    };
    return sendErrorResponse(res, 400, error.message || 'Content exceeds maximum length', responseData);
  }

  if (errorMessage.includes('Failed to create embedding') || errorMessage.includes('embedding')) {
    const responseData = {
      error: 'EMBEDDING_ERROR'
    };
    return sendErrorResponse(res, 500, 'Failed to process document embedding', responseData);
  }

  // Handle Prisma-specific errors
  const prismaMessages = {
    'P2002': 'Duplicate document detected',
    'P2000': 'Invalid data format',
    'P2003': 'Invalid reference',
    'P2025': 'Document not found',
    ...customMessages
  };

  if (handlePrismaError(res, error, prismaMessages)) {
    return true;
  }

  // Generic error response
  const genericErrorMessage = process.env.NODE_ENV === 'development'
    ? error.message
    : 'Failed to process RAG request';

  sendErrorResponse(res, 500, genericErrorMessage);
  return true;
};

module.exports = {
  sendErrorResponse,
  sendSuccessResponse,
  requireResource,
  checkForConflict,
  validateId,
  requireValidId,
  handlePrismaError,
  handleApplicationError,
  handleAuthError,
  handleChatError,
  handleCompanyError,
  handleEmployeeError,
  handleContactError,
  handleNotificationError,
  handleRagError,
  createAuthError
};

