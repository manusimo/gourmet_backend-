import { Router } from 'express';
import { generateCSRFToken, verifyCSRFToken } from '../helpers/csrf.js';

const router = Router();

router.get('/csrf-token', (req, res) => {
    const csrfToken = generateCSRFToken();

    res.cookie('csrfToken', csrfToken, {
        httpOnly: true,
        secure: false, 
        sameSite: 'Lax', 
    });

    res.json({ csrfToken }); 
});


export default router;

