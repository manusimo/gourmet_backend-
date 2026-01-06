const express = require('express');
const { validateContact } = require('../middleware/validation.js');
const { sendSuccessResponse, handleContactError } = require('../utils/responseHelpers.js');
const Logger = require('../utils/logger.js');
const ContactService = require('../services/contactService.js');

const router = express.Router();

// POST /contact - Submit contact form with comprehensive validation
router.post('/contact', validateContact, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    const result = await ContactService.submitContact({
      name,
      email,
      phone,
      subject,
      message
    });

    sendSuccessResponse(res, 201, 'Contact form submitted successfully', result);
  } catch (error) {
    handleContactError(res, error, {
      context: {
        email: req.body.email,
        subject: req.body.subject
      },
      logger: Logger
    });
  }
});

module.exports = router;
