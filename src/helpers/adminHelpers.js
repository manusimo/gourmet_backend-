const { prisma } = require('../db.js');

async function getMetrics() {
  try {
    const [registeredCompanies, registeredProfessionals, publishedOffers, totalApplications] = await Promise.all([
      prisma.restaurant.count(),
      prisma.employee.count(),
      prisma.jobOffer.count(),
      prisma.application.count(),
    ]);
    return {
      registeredCompanies: registeredCompanies ?? 0,
      registeredProfessionals: registeredProfessionals ?? 0,
      publishedOffers: publishedOffers ?? 0,
      totalApplications: totalApplications ?? 0,
    };
  } catch (err) {
    throw err;
  }
}

module.exports = { getMetrics }; 