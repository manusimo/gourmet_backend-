import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const companyData = [
  {
    name: 'Restaurante El Rincón',
    specialty: 'Italiana',
    format: 'Restaurant Fino',
    region: 'Metropolitana',
    comuna: 'Las Condes',
    description: 'Restaurante italiano de alta cocina con ambiente elegante y auténtica gastronomía mediterránea.',
    rut: '76.123.456-7',
    legalName: 'El Rincón SpA',
    workers: '25',
    weeklyAverageClients: '800',
    locations: [
      { address: 'Av. Apoquindo 3500, Las Condes', lat: -33.4175, lng: -70.5975 },
      { address: 'Av. Kennedy 5413, Las Condes', lat: -33.4002, lng: -70.5789 }
    ]
  },
  {
    name: 'Sushi Bar Sakura',
    specialty: 'Japonesa',
    format: 'Casual',
    region: 'Metropolitana',
    comuna: 'Providencia',
    description: 'Sushi bar moderno con ambiente casual y los mejores ingredientes frescos importados de Japón.',
    rut: '76.234.567-8',
    legalName: 'Sakura Sushi Bar Ltda',
    workers: '18',
    weeklyAverageClients: '600',
    locations: [
      { address: 'Av. Providencia 1234, Providencia', lat: -33.4285, lng: -70.6159 },
      { address: 'Av. Pedro de Valdivia 1500, Providencia', lat: -33.4242, lng: -70.6099 }
    ]
  },
  {
    name: 'Café Central',
    specialty: 'Internacional',
    format: 'Bistró',
    region: 'Metropolitana',
    comuna: 'Santiago Centro',
    description: 'Café boutique con gastronomía internacional y ambiente acogedor en el corazón de Santiago.',
    rut: '76.345.678-9',
    legalName: 'Café Central Ltda',
    workers: '15',
    weeklyAverageClients: '500',
    locations: [
      { address: 'Av. Libertador Bernardo O\'Higgins 1112, Santiago Centro', lat: -33.4470, lng: -70.6500 },
      { address: 'Huérfanos 1234, Santiago Centro', lat: -33.4377, lng: -70.6505 }
    ]
  },
  {
    name: 'Parrilla Don Carlos',
    specialty: 'Argentina',
    format: 'Casual',
    region: 'Metropolitana',
    comuna: 'Ñuñoa',
    description: 'Parrilla argentina auténtica con las mejores carnes y ambiente familiar.',
    rut: '76.456.789-0',
    legalName: 'Don Carlos Parrilla SpA',
    workers: '20',
    weeklyAverageClients: '700',
    locations: [
      { address: 'Av. Irarrázaval 3333, Ñuñoa', lat: -33.4539, lng: -70.5983 },
      { address: 'Av. Pedro de Valdivia Sur 3456, Ñuñoa', lat: -33.4559, lng: -70.5989 }
    ]
  },
  {
    name: 'Restaurante Mar y Tierra',
    specialty: 'Pescados y Mariscos',
    format: 'Restaurant Fino',
    region: 'Valparaíso',
    comuna: 'Viña del Mar',
    description: 'Restaurante especializado en pescados y mariscos frescos con vista al mar.',
    rut: '76.567.890-1',
    legalName: 'Mar y Tierra Ltda',
    workers: '30',
    weeklyAverageClients: '900',
    locations: [
      { address: 'Av. Marina 123, Viña del Mar', lat: -33.0245, lng: -71.5518 },
      { address: 'Av. Perú 456, Viña del Mar', lat: -33.0156, lng: -71.5523 }
    ]
  }
];

const jobPositions = [
  'Chef Ejecutivo',
  'Sous Chef',
  'Chef de Partie',
  'Cocinero',
  'Ayudante de Cocina',
  'Mesero',
  'Bartender',
  'Barista',
  'Cajero',
  'Host/Hostess',
  'Limpieza',
  'Delivery',
  'Gerente de Restaurante',
  'Supervisor',
  'Recepcionista',
  'Pastelero',
  'Carnicero',
  'Pescadero',
  'Sommelier',
  'Chef de Sushi'
];

const jobDescriptions = [
  'Buscamos un profesional apasionado por la gastronomía con experiencia en cocina internacional.',
  'Se requiere persona responsable y con buena actitud para trabajar en equipo.',
  'Oportunidad de crecimiento en una empresa en expansión con ambiente laboral agradable.',
  'Buscamos talento joven y dinámico para formar parte de nuestro equipo gastronómico.',
  'Se requiere experiencia previa en el rubro con disponibilidad inmediata.',
  'Buscamos profesionales comprometidos con la excelencia en el servicio.',
  'Oportunidad única para trabajar en un ambiente profesional y en crecimiento.'
];

const jobFunctions = [
  'Preparación de platos según estándares de calidad',
  'Atención al cliente con excelencia',
  'Mantenimiento de limpieza y orden en el área de trabajo',
  'Trabajo en equipo y comunicación efectiva',
  'Cumplimiento de protocolos de seguridad e higiene',
  'Gestión de inventario y control de costos',
  'Supervisión del equipo de trabajo'
];

const jobRequirements = [
  'Experiencia mínima de 1 año en el rubro',
  'Disponibilidad para trabajar en horarios rotativos',
  'Buen manejo de inglés (deseable)',
  'Capacidad de trabajo bajo presión',
  'Excelente presentación personal',
  'Conocimientos en HACCP y manipulación de alimentos',
  'Experiencia en cocina internacional'
];

const schedules = [
  'Tiempo completo (8 horas)',
  'Medio tiempo (4 horas)',
  'Part-time (6 horas)',
  'Fines de semana',
  'Turnos rotativos'
];

const contracts = [
  'Indefinido',
  'Plazo fijo',
  'Por obra o faena',
  'Honorarios',
  'Pasantía'
];

const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];
const getRandomElements = (array, num) => array.sort(() => 0.5 - Math.random()).slice(0, num);
const getRandomSalary = () => Math.floor(Math.random() * 800000) + 400000; // 400k to 1.2M CLP
const getRandomExperience = () => Math.floor(Math.random() * 5) + 1; // 1-5 years

async function seedMultipleCompanies() {
  try {
    console.log('🚀 Starting multiple companies seeding...');

    // Clean existing data
    console.log('🧹 Cleaning existing data...');
    await prisma.message.deleteMany({});
    await prisma.conversation.deleteMany({});
    await prisma.talentPool.deleteMany({});
    await prisma.favouriteJob.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.jobOffer.deleteMany({});
    await prisma.location.deleteMany({});
    await prisma.restaurantUser.deleteMany({});
    await prisma.restaurant.deleteMany({});
    await prisma.experience.deleteMany({});
    await prisma.education.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.user.deleteMany({});

    // Create companies
    for (let i = 0; i < companyData.length; i++) {
      const company = companyData[i];
      
      console.log(`🏢 Creating company: ${company.name}...`);
      
      // Create company user
      const companyUser = await prisma.user.create({
        data: {
          email: `admin@${company.name.toLowerCase().replace(/\s+/g, '')}.cl`,
          password: '$2b$10$rQZ8K9mN2pL4xV7yH3jF6t.8sA1bC5dE9fG2hI4jK6lM7nO8pQ9rS0tU1vW2x',
          userType: 'empresas',
          name: `Admin${i + 1}`,
          surname: 'García',
          phoneNumber: `+569${Math.floor(Math.random() * 90000000) + 10000000}`,
          role: 'admin',
          payment_status: getRandomElement(['starter', 'pro', 'plus', 'premium']),
          last_payment: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000) // Último pago entre 0-15 días atrás
        }
      });

      // Create restaurant
      const restaurant = await prisma.restaurant.create({
        data: {
          name: company.name,
          specialty: company.specialty,
          format: company.format,
          region: company.region,
          comuna: company.comuna,
          description: company.description,
          rut: company.rut,
          legalName: company.legalName,
          numberOfRestaurants: Math.floor(Math.random() * 3) + 1,
          profileImageUrl: `https://example.com/${company.name.toLowerCase().replace(/\s+/g, '')}-profile.jpg`,
          profileCarouselUrls: [
            `https://example.com/${company.name.toLowerCase().replace(/\s+/g, '')}-carousel1.jpg`,
            `https://example.com/${company.name.toLowerCase().replace(/\s+/g, '')}-carousel2.jpg`
          ],
          workers: company.workers,
          weeklyAverageClients: company.weeklyAverageClients,
          benefits: getRandomElements(['Seguro de Salud', 'Seguro Dental', 'Bono por Desempeño', 'Transporte', 'Alimentación', 'Capacitación'], 4),
          userId: companyUser.id
        }
      });

      // Create locations
      const locations = await Promise.all(
        company.locations.map(loc => 
          prisma.location.create({
            data: {
              address: loc.address,
              latitude: loc.lat,
              longitude: loc.lng,
              restaurantId: restaurant.id
            }
          })
        )
      );

      // Create restaurant user
      const restaurantUser = await prisma.restaurantUser.create({
        data: {
          userId: companyUser.id,
          restaurantId: restaurant.id,
          role: 'admin'
        }
      });

      // Create job offers for this company
      const jobOffersCount = Math.floor(Math.random() * 8) + 3; // 3-10 job offers per company
      for (let j = 0; j < jobOffersCount; j++) {
        const position = getRandomElement(jobPositions);
        const location = getRandomElement(locations);
        
        const jobOffer = await prisma.jobOffer.create({
          data: {
            position: position,
            locationId: location.id,
            schedule: getRandomElement(schedules),
            period: 'Indefinido',
            contract: getRandomElement(contracts),
            salary: getRandomSalary(),
            tips: Math.random() > 0.5,
            functions: getRandomElement(jobFunctions),
            requirements: getRandomElement(jobRequirements),
            vacancies: Math.floor(Math.random() * 5) + 1,
            yearsOfExperience: getRandomExperience(),
            description: getRandomElement(jobDescriptions),
            restaurantId: restaurant.id,
            restaurantUserId: restaurantUser.id
          }
        });

        // Add questions to some job offers
        if (j % 2 === 0) {
          await prisma.question.create({
            data: {
              question: '¿Cuál es tu experiencia previa en este tipo de posición?',
              jobOfferId: jobOffer.id
            }
          });
          
          await prisma.question.create({
            data: {
              question: '¿Por qué te interesa trabajar en nuestro restaurante?',
              jobOfferId: jobOffer.id
            }
          });
        }
      }
    }

    console.log('✅ Seeding completed successfully!');
    console.log(`📊 Created:`);
    console.log(`   - ${companyData.length} Companies with users`);
    console.log(`   - ${companyData.length} Restaurants with locations`);
    console.log(`   - Multiple job offers per company`);

    console.log('\n🔑 Login credentials:');
    console.log('   Companies:');
    companyData.forEach((company, i) => {
      const email = `admin@${company.name.toLowerCase().replace(/\s+/g, '')}.cl`;
      console.log(`     ${company.name}: ${email} / password123`);
    });

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding
seedMultipleCompanies()
  .then(() => {
    console.log('🎉 Database seeded successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  }); 