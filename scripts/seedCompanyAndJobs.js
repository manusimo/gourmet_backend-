import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

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
  'Recepcionista'
];

const jobDescriptions = [
  'Buscamos un profesional apasionado por la gastronomía con experiencia en cocina internacional.',
  'Se requiere persona responsable y con buena actitud para trabajar en equipo.',
  'Oportunidad de crecimiento en una empresa en expansión con ambiente laboral agradable.',
  'Buscamos talento joven y dinámico para formar parte de nuestro equipo gastronómico.',
  'Se requiere experiencia previa en el rubro con disponibilidad inmediata.'
];

const jobFunctions = [
  'Preparación de platos según estándares de calidad',
  'Atención al cliente con excelencia',
  'Mantenimiento de limpieza y orden en el área de trabajo',
  'Trabajo en equipo y comunicación efectiva',
  'Cumplimiento de protocolos de seguridad e higiene'
];

const jobRequirements = [
  'Experiencia mínima de 1 año en el rubro',
  'Disponibilidad para trabajar en horarios rotativos',
  'Buen manejo de inglés (deseable)',
  'Capacidad de trabajo bajo presión',
  'Excelente presentación personal'
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

async function seedCompanyAndJobs() {
  try {
    console.log('🚀 Starting company and jobs seeding...');

    // Clean existing data (optional - comment out if you want to keep existing data)
    console.log('🧹 Cleaning existing data...');
    await prisma.jobOffer.deleteMany({});
    await prisma.location.deleteMany({});
    await prisma.restaurantUser.deleteMany({});
    await prisma.restaurant.deleteMany({});
    await prisma.user.deleteMany({});

    // Create company user
    console.log('👤 Creating company user...');
    const companyUser = await prisma.user.create({
      data: {
        email: 'admin@gourmetjobs.cl',
        password: '$2b$10$rQZ8K9mN2pL4xV7yH3jF6t.8sA1bC5dE9fG2hI4jK6lM7nO8pQ9rS0tU1vW2x',
        userType: 'empresas',
        name: 'Juan',
        surname: 'García',
        phoneNumber: '+56912345678',
        role: 'admin'
      }
    });

    // Create restaurant/company
    console.log('🏢 Creating restaurant/company...');
    const restaurant = await prisma.restaurant.create({
      data: {
        name: 'Gourmet Jobs Restaurant',
        specialty: 'Internacional',
        format: 'Restaurant Fino',
        region: 'Metropolitana',
        comuna: 'Las Condes',
        description: 'Restaurante de alta cocina especializado en gastronomía internacional con ambiente elegante y servicio de primera calidad.',
        rut: '76.123.456-7',
        legalName: 'Gourmet Jobs Restaurant SpA',
        numberOfRestaurants: 3,
        profileImageUrl: 'https://example.com/restaurant-profile.jpg',
        profileCarouselUrls: [
          'https://example.com/carousel1.jpg',
          'https://example.com/carousel2.jpg',
          'https://example.com/carousel3.jpg'
        ],
        workers: '45',
        weeklyAverageClients: '1200',
        benefits: ['Seguro de Salud', 'Seguro Dental', 'Bono por Desempeño', 'Transporte', 'Alimentación'],
        userId: companyUser.id
      }
    });

    // Create restaurant locations
    console.log('📍 Creating restaurant locations...');
    const locations = await Promise.all([
      prisma.location.create({
        data: {
          address: 'Av. Apoquindo 3500, Las Condes',
          latitude: -33.4175,
          longitude: -70.5975,
          restaurantId: restaurant.id
        }
      }),
      prisma.location.create({
        data: {
          address: 'Av. Kennedy 5413, Las Condes',
          latitude: -33.4002,
          longitude: -70.5789,
          restaurantId: restaurant.id
        }
      }),
      prisma.location.create({
        data: {
          address: 'Isidora Goyenechea 2800, Las Condes',
          latitude: -33.4156,
          longitude: -70.6019,
          restaurantId: restaurant.id
        }
      })
    ]);

    // Create restaurant user (admin)
    console.log('👨‍💼 Creating restaurant admin user...');
    const restaurantUser = await prisma.restaurantUser.create({
      data: {
        userId: companyUser.id,
        restaurantId: restaurant.id,
        role: 'admin'
      }
    });

    // Create job offers
    console.log('💼 Creating job offers...');
    const jobOffers = [];
    
    for (let i = 0; i < 20; i++) {
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
      if (i % 3 === 0) {
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

      jobOffers.push(jobOffer);
    }

    // Create some employee users for testing
    console.log('👥 Creating sample employee users...');
    const employeeUsers = [];
    
    for (let i = 0; i < 10; i++) {
      const employeeUser = await prisma.user.create({
        data: {
          email: `employee${i + 1}@example.com`,
          password: '$2b$10$rQZ8K9mN2pL4xV7yH3jF6t.8sA1bC5dE9fG2hI4jK6lM7nO8pQ9rS0tU1vW2x',
          userType: 'profesionales',
          name: `Empleado${i + 1}`,
          surname: `Apellido${i + 1}`,
          phoneNumber: `+569${Math.floor(Math.random() * 90000000) + 10000000}`,
          role: 'employee'
        }
      });

      const employee = await prisma.employee.create({
        data: {
          name: `Empleado${i + 1}`,
          surname: `Apellido${i + 1}`,
          country: 'Chile',
          location: 'Santiago',
          position: getRandomElement(jobPositions),
          genre: Math.random() > 0.5 ? 'Masculino' : 'Femenino',
          civilState: Math.random() > 0.5 ? 'Soltero' : 'Casado',
          aboutMe: `Soy un profesional apasionado por la gastronomía con ${getRandomExperience()} años de experiencia.`,
          schedule: getRandomElement(schedules),
          region: 'Metropolitana',
          comuna: 'Las Condes',
          available: 'Inmediata',
          profileImageUrl: 'https://example.com/employee-profile.jpg',
          period: 'Indefinido',
          birthDate: new Date(1990 + i, 0, 1),
          phoneNumber: `+569${Math.floor(Math.random() * 90000000) + 10000000}`,
          yearsOfExperience: `${getRandomExperience()} años`,
          skills: getRandomElements(['Cocina italiana', 'Cocina japonesa', 'Cocina francesa', 'Pastelería', 'Carnes', 'Pescados', 'Vinos', 'Servicio al cliente'], 3),
          userId: employeeUser.id
        }
      });

      employeeUsers.push({ user: employeeUser, employee });
    }

    console.log('✅ Seeding completed successfully!');
    console.log(`📊 Created:`);
    console.log(`   - 1 Company user (admin@gourmetjobs.cl)`);
    console.log(`   - 1 Restaurant with 3 locations`);
    console.log(`   - 20 Job offers`);
    console.log(`   - 10 Employee users with profiles`);
    console.log(`   - Sample questions for some job offers`);

    console.log('\n🔑 Login credentials:');
    console.log('   Company: admin@gourmetjobs.cl / password123');
    console.log('   Employees: employee1@example.com to employee10@example.com / password123');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding
seedCompanyAndJobs()
  .then(() => {
    console.log('🎉 Database seeded successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  }); 