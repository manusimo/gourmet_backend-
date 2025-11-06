/**
 * Secure Cookie Configuration Helper
 * Handles cookies for subdomain architecture (gourmetjobs.cl <-> api.gourmetjobs.cl)
 * 
 * Automatically detects subdomain setup and configures cookies accordingly:
 * - Subdomains: domain: '.gourmetjobs.cl', sameSite: 'lax' (works on mobile!)
 * - Different domains: sameSite: 'none', secure: true (mobile may block)
 * - httpOnly: true (security best practice)
 */


/**
 * Check if frontend and backend are on the same domain (subdomains)
 * @returns {Object} { isSubdomain: boolean, domain: string | null }
 */
const checkSubdomainSetup = () => {
  const frontendUrl = process.env.FRONTEND_URL || '';
  const backendUrl = process.env.BACKEND_URL || '';
  
  // Extract base domains (e.g., 'gourmetjobs.cl' from 'https://api.gourmetjobs.cl')
  const extractBaseDomain = (url) => {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      // Remove subdomain (e.g., 'api.gourmetjobs.cl' -> 'gourmetjobs.cl')
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        return parts.slice(-2).join('.'); // Get last 2 parts (domain.tld)
      }
      return hostname;
    } catch {
      return null;
    }
  };
  
  const frontendDomain = extractBaseDomain(frontendUrl);
  const backendDomain = extractBaseDomain(backendUrl);
  
  // Check if they share the same base domain (subdomain setup)
  const isSubdomain = frontendDomain && backendDomain && frontendDomain === backendDomain;
  
  return {
    isSubdomain,
    domain: isSubdomain ? `.${frontendDomain}` : null
  };
};

/**
 * Get secure cookie options for cross-domain architecture
 * @param {Object} options - Additional cookie options
 * @returns {Object} Cookie configuration object
 */
const getSecureCookieOptions = (options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isHeroku = process.env.DYNO || process.env.HEROKU_APP_NAME;
  
  // Check if we're using subdomains (same domain) vs different domains
  const { isSubdomain, domain: subdomainDomain } = checkSubdomainSetup();
  
  // Subdomain setup (e.g., gourmetjobs.cl <-> api.gourmetjobs.cl): Works on mobile!
  // Different domains (e.g., gourmetjobs.cl <-> api.makisoftwareagency.com): Mobile blocks cookies
  const isCrossDomain = (isProduction || isHeroku) && !isSubdomain;
  
  const cookieOptions = {
    httpOnly: true, // Prevent JavaScript access (XSS protection)
    secure: (isProduction || isHeroku) ? true : false, // HTTPS required in production
    sameSite: isCrossDomain ? 'none' : 'lax', // 'none' for different domains, 'lax' for subdomains
    path: '/',
    maxAge: options.maxAge || 24 * 60 * 60 * 1000, // 24 hours default
  };
  
  // For subdomain setup, set domain attribute (e.g., '.gourmetjobs.cl')
  // This allows cookies to work across subdomains on mobile!
  if (isSubdomain && subdomainDomain) {
    cookieOptions.domain = subdomainDomain;
  } else if (options.domain) {
    // Allow explicit domain override
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
  const { isSubdomain, domain: subdomainDomain } = checkSubdomainSetup();
  const isCrossDomain = (isProduction || isHeroku) && !isSubdomain;
  
  const clearOptions = {
    httpOnly: true,
    secure: (isProduction || isHeroku) ? true : false,
    sameSite: isCrossDomain ? 'none' : 'lax',
    path: '/'
  };
  
  // Include domain for subdomain setup
  if (isSubdomain && subdomainDomain) {
    clearOptions.domain = subdomainDomain;
  }
  
  res.clearCookie('manu', clearOptions);
};

module.exports = {
  getSecureCookieOptions,
  setSecureAuthCookie,
  clearAuthCookie
};

