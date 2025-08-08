const express = require('express');
const { generateCSRFToken, verifyCSRFToken } = require('../helpers/csrf.js');

const router = express.Router();

router.get('/csrf-token', (req, res) => {
    const csrfToken = generateCSRFToken();

    res.cookie('csrfToken', csrfToken, {
        httpOnly: true,
        secure: false, 
        sameSite: 'Lax', 
    });

    res.json({ csrfToken }); 
});


module.exports = router;

