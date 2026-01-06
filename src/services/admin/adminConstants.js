/**
 * Admin Service Constants
 * Shared constants used across admin services
 */

// Time constants
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const JWT_TOKEN_EXPIRY = '7d';
const DEFAULT_FRONTEND_URL = 'http://localhost:3001';

// DDoS thresholds
const DDOS_WARNING_THRESHOLD = 50;
const DDOS_CRITICAL_THRESHOLD = 100;

// Security thresholds
const SECURITY_THRESHOLDS = {
  requestsPerSecondWarning: 50,
  requestsPerSecondCritical: 100,
  requestsPerMinuteWarning: 1000,
  requestsPerMinuteCritical: 2000,
  maxRequestsPerIPPerMinute: 200,
  maxFailedRequestsPerIP: 20
};

// Security settings
const SECURITY_SETTINGS = {
  monitoringWindowSeconds: 60,
  alertCooldownMinutes: 15
};

module.exports = {
  FORTY_EIGHT_HOURS_MS,
  JWT_TOKEN_EXPIRY,
  DEFAULT_FRONTEND_URL,
  DDOS_WARNING_THRESHOLD,
  DDOS_CRITICAL_THRESHOLD,
  SECURITY_THRESHOLDS,
  SECURITY_SETTINGS
};

