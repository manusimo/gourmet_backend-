/**
 * Secure Cookie Configuration Helper
 * Handles cross-domain cookies for decoupled architecture
 * 
 * For cross-domain cookies (gourmetjobs.cl <-> api.makisoftwareagency.com):
 * - sameSite: 'none' (required for cross-site cookies)
 * - secure: true (required when sameSite is 'none', must use HTTPS)
 * - httpOnly: true (security best practice)
 */

/**
 * Get secure cookie options for cross-domain architecture
 * @param {Object} options - Additional cookie options
 * @returns {Object} Cookie configuration object
 */
const getSecureCookieOptions = (options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isHeroku = process.env.DYNO || process.env.HEROKU_APP_NAME;
  
  // In production/Heroku, we're using cross-domain (gourmetjobs.cl <-> api.makisoftwareagency.com)
  // So we need sameSite: 'none' and secure: true
  const isCrossDomain = isProduction || isHeroku;
  
  const cookieOptions = {
    httpOnly: true, // Prevent JavaScript access (XSS protection)
    secure: isCrossDomain ? true : false, // HTTPS required for cross-domain
    sameSite: isCrossDomain ? 'none' : 'lax', // 'none' for cross-domain, 'lax' for same-domain
    path: '/',
    maxAge: options.maxAge || 24 * 60 * 60 * 1000, // 24 hours default
  };
  
  // Only set domain if explicitly provided (for cross-subdomain cookies)
  // Note: For completely different domains, don't set domain attribute
  if (options.domain) {
    cookieOptions.domain = options.domain;
  }
  
  return cookieOptions;
};

/**
 * Set a secure authentication cookie
 * @param {Object} res - Express response object
 * @param {string} token - JWT token to set
 * @param {Object} options - Additional cookie options
 */
const setSecureAuthCookie = (res, token, options = {}) => {
  const cookieOptions = getSecureCookieOptions(options);
  res.cookie('manu', token, cookieOptions);
};

/**
 * Clear authentication cookie securely
 * @param {Object} res - Express response object
 */
const clearAuthCookie = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isHeroku = process.env.DYNO || process.env.HEROKU_APP_NAME;
  const isCrossDomain = isProduction || isHeroku;
  
  res.clearCookie('manu', {
    httpOnly: true,
    secure: isCrossDomain ? true : false,
    sameSite: isCrossDomain ? 'none' : 'lax',
    path: '/'
  });
};

module.exports = {
  getSecureCookieOptions,
  setSecureAuthCookie,
  clearAuthCookie
};

