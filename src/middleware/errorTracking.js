const fs = require('fs');
const path = require('path');

// Error tracking storage
const errorStorage = {
  errors: [],
  errorCounts: new Map(),
  errorsByEndpoint: new Map(),
  userErrors: new Map(),
  criticalErrors: [],
};

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Structured logger
 */
class Logger {
  static log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta,
      pid: process.pid,
      memory: process.memoryUsage().heapUsed,
    };

    // Console output with colors
    const colors = {
      ERROR: '\x1b[31m',   // Red
      WARN: '\x1b[33m',    // Yellow
      INFO: '\x1b[36m',    // Cyan
      DEBUG: '\x1b[35m',   // Magenta
      RESET: '\x1b[0m'
    };

    const color = colors[level.toUpperCase()] || colors.INFO;
    console.log(
      `${color}[${timestamp}] ${level.toUpperCase()}${colors.RESET}: ${message}`,
      Object.keys(meta).length > 0 ? meta : ''
    );

    // Write to file
    const logFile = path.join(logsDir, `${level.toLowerCase()}.log`);
    const logLine = JSON.stringify(logEntry) + '\n';
    
    fs.appendFile(logFile, logLine, (err) => {
      if (err) console.error('Failed to write to log file:', err);
    });

    // Also write to combined log
    const combinedLogFile = path.join(logsDir, 'combined.log');
    fs.appendFile(combinedLogFile, logLine, () => {});

    return logEntry;
  }

  static error(message, meta = {}) {
    return this.log('error', message, meta);
  }

  static warn(message, meta = {}) {
    return this.log('warn', message, meta);
  }

  static info(message, meta = {}) {
    return this.log('info', message, meta);
  }

  static debug(message, meta = {}) {
    return this.log('debug', message, meta);
  }
}

/**
 * Error categorization
 */
const categorizeError = (error, req) => {
  // Database errors
  if (error.code && error.code.startsWith('P')) {
    return {
      category: 'database',
      severity: 'high',
      type: getPrismaErrorType(error.code)
    };
  }

  // Validation errors
  if (error.name === 'ValidationError' || error.status === 400) {
    return {
      category: 'validation',
      severity: 'low',
      type: 'invalid_input'
    };
  }

  // Authentication errors
  if (error.status === 401 || error.status === 403) {
    return {
      category: 'authentication',
      severity: 'medium',
      type: 'unauthorized'
    };
  }

  // Rate limiting errors
  if (error.status === 429) {
    return {
      category: 'rate_limit',
      severity: 'medium',
      type: 'too_many_requests'
    };
  }

  // Server errors
  if (error.status >= 500) {
    return {
      category: 'server',
      severity: 'critical',
      type: 'internal_server_error'
    };
  }

  // Default
  return {
    category: 'unknown',
    severity: 'medium',
    type: 'unhandled_error'
  };
};

/**
 * Get Prisma error type
 */
const getPrismaErrorType = (code) => {
  const prismaErrors = {
    'P2000': 'value_too_long',
    'P2001': 'record_not_found',
    'P2002': 'unique_constraint_violation',
    'P2003': 'foreign_key_constraint_violation',
    'P2004': 'constraint_violation',
    'P2025': 'record_not_found',
    'P1001': 'database_unreachable',
    'P1002': 'database_timeout',
  };
  return prismaErrors[code] || 'unknown_database_error';
};

/**
 * Error tracking middleware
 */
const errorTrackingMiddleware = (error, req, res, next) => {
  const errorId = generateErrorId();
  const timestamp = new Date().toISOString();
  const category = categorizeError(error, req);
  
  const errorInfo = {
    id: errorId,
    timestamp,
    message: error.message,
    stack: error.stack,
    ...category,
    endpoint: `${req.method} ${req.originalUrl}`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.userId || null,
    statusCode: error.status || 500,
    requestBody: sanitizeRequestBody(req.body),
    query: req.query,
    headers: sanitizeHeaders(req.headers),
  };

  // Store error
  errorStorage.errors.push(errorInfo);
  
  // Track error counts
  const errorKey = `${category.category}:${category.type}`;
  errorStorage.errorCounts.set(
    errorKey, 
    (errorStorage.errorCounts.get(errorKey) || 0) + 1
  );

  // Track errors by endpoint
  const endpoint = errorInfo.endpoint;
  if (!errorStorage.errorsByEndpoint.has(endpoint)) {
    errorStorage.errorsByEndpoint.set(endpoint, []);
  }
  errorStorage.errorsByEndpoint.get(endpoint).push(errorInfo);

  // Track user errors
  if (errorInfo.userId) {
    if (!errorStorage.userErrors.has(errorInfo.userId)) {
      errorStorage.userErrors.set(errorInfo.userId, []);
    }
    errorStorage.userErrors.get(errorInfo.userId).push(errorInfo);
  }

  // Track critical errors
  if (category.severity === 'critical') {
    errorStorage.criticalErrors.push(errorInfo);
    
    // Send immediate alert for critical errors
    Logger.error('🚨 CRITICAL ERROR DETECTED', {
      errorId,
      endpoint,
      message: error.message,
      userId: errorInfo.userId,
      ip: errorInfo.ip
    });
  } else {
    // Log the error (only if not critical, since critical errors are already logged above)
    Logger.error(`Error ${errorId}: ${error.message}`, {
      errorId,
      category: category.category,
      severity: category.severity,
      endpoint,
      statusCode: errorInfo.statusCode,
      userId: errorInfo.userId,
      stack: error.stack
    });
  }

  // Clean old data
  if (errorStorage.errors.length > 1000) {
    errorStorage.errors = errorStorage.errors.slice(-1000);
  }

  // Continue with normal error handling
  next(error);
};

/**
 * Generate unique error ID
 */
const generateErrorId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Sanitize request body for logging
 */
const sanitizeRequestBody = (body) => {
  if (!body) return null;
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

/**
 * Sanitize headers for logging
 */
const sanitizeHeaders = (headers) => {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

/**
 * Get error statistics
 */
const getErrorStats = () => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const recentErrors = errorStorage.errors.filter(
    err => new Date(err.timestamp).getTime() > oneHourAgo
  );

  const dailyErrors = errorStorage.errors.filter(
    err => new Date(err.timestamp).getTime() > oneDayAgo
  );

  // Error rate by category
  const errorsByCategory = {};
  recentErrors.forEach(error => {
    errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
  });

  // Top error endpoints
  const endpointErrors = Array.from(errorStorage.errorsByEndpoint.entries())
    .map(([endpoint, errors]) => ({
      endpoint,
      count: errors.length,
      lastError: errors[errors.length - 1]?.timestamp
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Error trends
  const errorTrend = getErrorTrend(dailyErrors);

  return {
    overview: {
      totalErrors: errorStorage.errors.length,
      errorsLastHour: recentErrors.length,
      errorsLast24Hours: dailyErrors.length,
      criticalErrors: errorStorage.criticalErrors.length,
      errorRate: calculateErrorRate(recentErrors),
      topErrorType: getMostCommonError(recentErrors)
    },
    errorsByCategory,
    topErrorEndpoints: endpointErrors,
    recentCriticalErrors: errorStorage.criticalErrors.slice(-5),
    errorTrend,
    uniqueUsers: errorStorage.userErrors.size
  };
};

/**
 * Calculate error rate
 */
const calculateErrorRate = (errors) => {
  // This would need to be calculated against total requests
  // For now, return the number of errors per hour
  return errors.length;
};

/**
 * Get most common error type
 */
const getMostCommonError = (errors) => {
  const errorCounts = {};
  errors.forEach(error => {
    const key = `${error.category}:${error.type}`;
    errorCounts[key] = (errorCounts[key] || 0) + 1;
  });

  const [topError] = Object.entries(errorCounts)
    .sort(([,a], [,b]) => b - a);

  return topError ? { type: topError[0], count: topError[1] } : null;
};

/**
 * Get error trend over time
 */
const getErrorTrend = (errors) => {
  const hourlyBuckets = {};
  
  errors.forEach(error => {
    const hour = new Date(error.timestamp).getHours();
    hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
  });

  return hourlyBuckets;
};

/**
 * Search errors
 */
const searchErrors = (query = {}) => {
  let filteredErrors = [...errorStorage.errors];

  if (query.category) {
    filteredErrors = filteredErrors.filter(err => err.category === query.category);
  }

  if (query.severity) {
    filteredErrors = filteredErrors.filter(err => err.severity === query.severity);
  }

  if (query.endpoint) {
    filteredErrors = filteredErrors.filter(err => 
      err.endpoint.includes(query.endpoint)
    );
  }

  if (query.userId) {
    filteredErrors = filteredErrors.filter(err => err.userId === query.userId);
  }

  if (query.timeRange) {
    const timeAgo = Date.now() - (query.timeRange * 60 * 60 * 1000);
    filteredErrors = filteredErrors.filter(err => 
      new Date(err.timestamp).getTime() > timeAgo
    );
  }

  return filteredErrors.slice(0, 100); // Limit results
};

module.exports = {
  errorTrackingMiddleware,
  getErrorStats,
  searchErrors,
  Logger,
}; 