import { Router } from 'express';
import { prisma } from '../db.js';
import { validateContact } from '../middleware/validation.js';

const router = Router();

// POST /contact - Submit contact form with comprehensive validation
router.post('/contact', validateContact, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    // Additional server-side validation (defense in depth)
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        success: false,
        message: 'All required fields must be provided' 
      });
    }

    // Create contact submission
    const submission = await prisma.contactSubmission.create({
      data: { 
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone ? phone.trim() : null,
        subject: subject.trim(),
        message: message.trim()
      },
    });

    // Success response
    res.status(201).json({ 
      success: true,
      message: 'Contact form submitted successfully',
      data: {
        submissionId: submission.id,
        timestamp: submission.createdAt
      }
    });

  } catch (error) {
    console.error('Contact submission error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        success: false,
        message: 'Duplicate submission detected' 
      });
    }
    
    if (error.code === 'P2000') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid data format' 
      });
    }

    // Generic error response
    res.status(500).json({ 
      success: false,
      message: 'Unable to process contact form. Please try again later.' 
    });
  }
});

export default router;
