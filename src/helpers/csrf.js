const crypto = require('crypto');

const generateCSRFToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

const verifyCSRFToken = (token, sessionToken) => {
    const csrfTokenFromHeader = req.headers['x-csrf-token'];
    const csrfTokenFromCookie = req.cookies['csrfToken'];
   
    if (!csrfTokenFromHeader || csrfTokenFromHeader !== csrfTokenFromCookie) {
        console.error('Invalid or missing CSRF token');
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
};

module.exports = {
  generateCSRFToken,
  verifyCSRFToken,
};

