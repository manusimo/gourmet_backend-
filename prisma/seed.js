import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const restaurantId = 75;

  // Define an array of sample positions and descriptions
  const positions = [
    'Chef', 'Sous Chef', 'Pastry Chef', 'Line Cook', 'Prep Cook',
    'Waiter', 'Waitress', 'Bartender', 'Barista', 'Dishwasher',
    'Host', 'Hostess', 'Food Runner', 'Busser', 'Manager',
    'Restaurant Supervisor', 'Delivery Driver', 'Catering Manager', 
    'Food and Beverage Director', 'Event Coordinator'
  ];

  // Create 20 job offers
  const jobOffers = [];

  for (let i = 0; i < 20; i++) {
    const positionIndex = i % positions.length; // Loop through the positions array
    jobOffers.push({
      position: positions[positionIndex],
      location: 'Main Dining Area',
      schedule: i % 2 === 0 ? 'Full-Time' : 'Part-Time', // Alternate between Full-Time and Part-Time
      contract: 'Permanent',
      salary: 2000 + (i * 100), // Incremental salary for each job
      tips: true,
      functions: `Responsibilities include preparing meals and ensuring excellent service for the position of ${positions[positionIndex]}.`,
      requirements: 'Experience preferred, but training available for the right candidate.',
      vacancies: Math.ceil(Math.random() * 5), // Random vacancies between 1 and 5
      yearsOfExperience: Math.floor(Math.random() * 5), // Random experience between 0 and 4 years
      description: `Join our team as a ${positions[positionIndex]}! We are looking for enthusiastic individuals to deliver exceptional service.`,
    });
  }

  // Create job offers in the database
  for (const offer of jobOffers) {
    await prisma.jobOffer.create({
      data: {
        ...offer,
        restaurantId, // Use the specific restaurant ID here
      },
    });
  }

  console.log(`Seeded ${jobOffers.length} job offers for restaurant ID ${restaurantId}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
