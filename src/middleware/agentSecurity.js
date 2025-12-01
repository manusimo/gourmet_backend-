/**
 * Agent Security Middleware
 * Provides security features for AI agent endpoints:
 * - Rate limiting
 * - Input validation
 * - User context extraction
 * - Request logging
 */

const rateLimit = require('express-rate-limit');
const { prisma } = require('../db.js');

/**
 * Rate limiter for agent endpoints
 * Prevents abuse and cost explosions
 */
const agentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID if available for more granular limiting
  keyGenerator: (req) => {
    return req.userId ? `user:${req.userId}` : req.ip;
  },
});

/**
 * Extract and validate user context for agent
 */
const extractUserContext = async (req, res, next) => {
  try {
    // Extract from JWT token (already validated by auth middleware)
    const userId = req.userId;
    const userType = req.userType;
    const restaurantUserId = req.restaurantUserId;
    const role = req.role || 'user';

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User context required'
      });
    }

    // Build user context object
    req.agentUserContext = {
      userId,
      userType,
      restaurantUserId,
      role,
    };

    next();
  } catch (error) {
    console.error('❌ [Agent Security] Error extracting user context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract user context'
    });
  }
};

/**
 * Validate restaurant access for agent requests
 */
const validateRestaurantAccess = async (req, res, next) => {
  try {
    const { restaurantId } = req.body;
    const userContext = req.agentUserContext;

    if (!restaurantId) {
      return next(); // Some endpoints don't require restaurant
    }

    if (!userContext || !userContext.userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User context required'
      });
    }

    // Verify user has access to restaurant
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        id: parseInt(restaurantId),
        OR: [
          { userId: userContext.userId }, // Owner
          {
            restaurantUsers: {
              some: {
                userId: userContext.userId,
                restaurantId: parseInt(restaurantId),
              }
            }
          } // Staff member
        ]
      },
      select: { id: true },
    });

    if (!restaurant) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have access to this restaurant'
      });
    }

    next();
  } catch (error) {
    console.error('❌ [Agent Security] Error validating restaurant access:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate restaurant access'
    });
  }
};

/**
 * Sanitize user input to prevent prompt injection
 */
const sanitizeAgentInput = (req, res, next) => {
  try {
    if (req.body.message) {
      req.body.message = sanitizeInput(req.body.message);
    }

    if (req.body.conversationHistory && Array.isArray(req.body.conversationHistory)) {
      req.body.conversationHistory = req.body.conversationHistory.map(msg => ({
        ...msg,
        content: msg.content ? sanitizeInput(msg.content) : msg.content,
        message: msg.message ? sanitizeInput(msg.message) : msg.message,
      }));
    }

    next();
  } catch (error) {
    console.error('❌ [Agent Security] Error sanitizing input:', error);
    res.status(400).json({
      success: false,
      error: 'Invalid input format'
    });
  }
};

/**
 * Sanitize input string
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove common prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(previous|all|above)\s+instructions?/gi,
    /forget\s+(previous|all|above)\s+instructions?/gi,
    /you\s+are\s+now\s+a/gi,
    /system\s*:\s*/gi,
    /<\|system\|>/gi,
    /\[INST\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
  ];

  let sanitized = input;
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Limit input length
  const maxLength = 10000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    console.warn('⚠️ [Agent Security] Input truncated due to length limit');
  }

  return sanitized.trim();
}

/**
 * Log agent requests for security monitoring
 */
const logAgentRequest = (req, res, next) => {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    userId: req.userId,
    restaurantId: req.body?.restaurantId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };

  console.log('📊 [Agent Security] Request:', logData);

  // In production, send to logging service (e.g., CloudWatch, Datadog)
  // await logToService(logData);

  next();
};

/**
 * Validate request body structure
 */
const validateAgentRequest = (req, res, next) => {
  const { message, restaurantId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Message is required and must be a non-empty string'
    });
  }

  if (message.length > 10000) {
    return res.status(400).json({
      success: false,
      error: 'Message is too long (max 10000 characters)'
    });
  }

  if (restaurantId && (isNaN(restaurantId) || parseInt(restaurantId) <= 0)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid restaurantId'
    });
  }

  next();
};

module.exports = {
  agentRateLimiter,
  extractUserContext,
  validateRestaurantAccess,
  sanitizeAgentInput,
  logAgentRequest,
  validateAgentRequest,
  sanitizeInput, // Export for use in other files
};

