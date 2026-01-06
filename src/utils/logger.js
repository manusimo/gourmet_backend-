/**
 * Logger utility with data sanitization for security
 * Exports a sanitized Logger wrapper that removes sensitive data before logging
 */
const { Logger: BaseLogger } = require('../middleware/errorTracking.js');

/**
 * Fields that should be sanitized in logs (never log these values)
 * Note: In production, consider also sanitizing emails and phone numbers
 * for GDPR compliance depending on your requirements
 */
const SENSITIVE_FIELDS = [
  'password',
  'hashedPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'secretKey',
  'privateKey',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
  'socialSecurityNumber',
  'authorization',
  'cookie',
  'set-cookie',
  'jwt',
  'sessionId'
];

/**
 * Sanitize sensitive data from log metadata
 * @param {Object} meta - Metadata object to sanitize
 * @returns {Object} Sanitized metadata
 */
function sanitizeLogData(meta = {}) {
  if (typeof meta !== 'object' || meta === null) {
    return meta;
  }

  const sanitized = { ...meta };

  // Remove sensitive fields
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }

  // Sanitize error objects (remove stack traces in production)
  if (sanitized.error && typeof sanitized.error === 'object') {
    const errorCopy = { ...sanitized.error };
    if (process.env.NODE_ENV === 'production' && errorCopy.stack) {
      errorCopy.stack = '[REDACTED]';
    }
    sanitized.error = errorCopy;
  }

  // Sanitize stack traces in production
  if (process.env.NODE_ENV === 'production' && sanitized.stack) {
    sanitized.stack = '[REDACTED]';
  }

  return sanitized;
}

/**
 * Sanitized Logger wrapper
 * Automatically removes sensitive data before logging
 */
class Logger {
  static log(level, message, meta = {}) {
    const sanitizedMeta = sanitizeLogData(meta);
    return BaseLogger.log(level, message, sanitizedMeta);
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
    // Only log debug in development
    if (process.env.NODE_ENV !== 'production') {
      return this.log('debug', message, meta);
    }
  }
}

module.exports = Logger;

