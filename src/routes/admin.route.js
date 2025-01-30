import { Router } from "express";
import { prisma } from "../db.js";
import jwt from 'jsonwebtoken';

const router = Router();


router.get('/metrics', async (req, res) => {
    try {
      const [
        registeredCompanies,
        registeredProfessionals,
        publishedOffers,
        totalApplications
      ] = await Promise.all([
        prisma.restaurant.count(),
        prisma.employee.count(),
        prisma.jobOffer.count(),
        prisma.application.count()
      ]);
  
      res.json({
        registeredCompanies: registeredCompanies || 0,
        registeredProfessionals: registeredProfessionals || 0,
        publishedOffers: publishedOffers || 0,
        totalApplications: totalApplications || 0
      });
    } catch (error) {
      console.error('Error fetching metrics:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  });

export default router;