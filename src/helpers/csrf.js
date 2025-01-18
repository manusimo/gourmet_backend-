import crypto from 'crypto';

// Function to generate a CSRF token
export const generateCSRFToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Middleware to verify CSRF token
export const verifyCSRFToken = (req, res, next) => {
    const csrfTokenFromHeader = req.headers['x-csrf-token'];
    const csrfTokenFromCookie = req.cookies['csrfToken'];
    console.log('Request Headers:', req.headers);


    console.log('CSRF Token from Header:', csrfTokenFromHeader);
    console.log('CSRF Token from Cookie:', csrfTokenFromCookie);

    if (!csrfTokenFromHeader || csrfTokenFromHeader !== csrfTokenFromCookie) {
        console.error('Invalid or missing CSRF token');
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
};

