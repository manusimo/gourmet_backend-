import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    const submission = await prisma.contactSubmission.create({
      data: { name, email, phone, subject, message },
    });
    res
      .status(201)
      .json({ message: 'Submission received', submissionId: submission.id });
  } catch (error) {
    console.error('Contact submission error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export default router;
