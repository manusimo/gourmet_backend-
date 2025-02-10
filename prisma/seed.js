import {PrismaClient} from '@prisma/client'
const prisma = new PrismaClient()

const restaurantNames = [
  'El Rincón', 'La Terraza', 'Sabores', 'Mar y Tierra', 'La Bodega',
  'El Fogón', 'Casa Vieja', 'La Esquina', 'El Patio', 'Don Alberto',
  'La Cocina', 'El Mercado', 'Vista Mar', 'El Jardín', 'La Plaza'
]

const specialties = ['Italiana', 'Japonesa', 'Mexicana', 'Peruana', 'China']
const formats = ['Restaurant Fino', 'Casual', 'Fast Casual', 'Bistró', 'Buffet']
const regions = ['Metropolitana', 'Valparaíso', 'Biobío']
const comunas = {
  'Metropolitana': ['Las Condes', 'Providencia', 'Santiago Centro', 'Vitacura', 'Ñuñoa'],
  'Valparaíso': ['Viña del Mar', 'Valparaíso', 'Concón'],
  'Biobío': ['Concepción', 'Talcahuano', 'San Pedro de la Paz']
}

const benefits = [
  'Seguro de Salud', 'Seguro Dental', 'Seguro de Vida',
  'Bono por Desempeño', 'Transporte', 'Alimentación'
]

const addresses = {
  'Las Condes': [
    { street: 'Av. Apoquindo 3500', lat: -33.4175, lng: -70.5975 },
    { street: 'Av. Kennedy 5413', lat: -33.4002, lng: -70.5789 },
    { street: 'Isidora Goyenechea 2800', lat: -33.4156, lng: -70.6019 }
  ],
  'Providencia': [
    { street: 'Av. Providencia 1234', lat: -33.4285, lng: -70.6159 },
    { street: 'Av. Pedro de Valdivia 1500', lat: -33.4242, lng: -70.6099 },
    { street: 'Av. Suecia 0142', lat: -33.4225, lng: -70.6095 }
  ],
  'Santiago Centro': [
    { street: 'Av. Libertador Bernardo O\'Higgins 1112', lat: -33.4470, lng: -70.6500 },
    { street: 'Huérfanos 1234', lat: -33.4377, lng: -70.6505 }
  ],
  'Vitacura': [
    { street: 'Av. Vitacura 2345', lat: -33.4023, lng: -70.6089 },
    { street: 'Av. Alonso de Córdova 3456', lat: -33.4033, lng: -70.5989 }
  ],
  'Ñuñoa': [
    { street: 'Av. Irarrázaval 3333', lat: -33.4539, lng: -70.5983 },
    { street: 'Av. Pedro de Valdivia Sur 3456', lat: -33.4559, lng: -70.5989 }
  ]
}

// Add new constants for images
const sampleImages = [
  'https://example.com/restaurant1.jpg',
  'https://example.com/restaurant2.jpg',
  'https://example.com/restaurant3.jpg',
  'https://example.com/restaurant4.jpg',
  'https://example.com/restaurant5.jpg'
]

const sampleCarouselImages = [
  ['https://example.com/carousel1-1.jpg', 'https://example.com/carousel1-2.jpg', 'https://example.com/carousel1-3.jpg'],
  ['https://example.com/carousel2-1.jpg', 'https://example.com/carousel2-2.jpg'],
  ['https://example.com/carousel3-1.jpg', 'https://example.com/carousel3-2.jpg', 'https://example.com/carousel3-3.jpg'],
]

const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)]
const getRandomElements = (array, num) => array.sort(() => 0.5 - Math.random()).slice(0, num)

async function main() {
  // Delete existing data
  await prisma.location.deleteMany({})
  await prisma.restaurant.deleteMany({})
  await prisma.user.deleteMany({})

  for (let i = 0; i < 15; i++) {
    const region = getRandomElement(regions)
    const comuna = getRandomElement(comunas[region])

    // 1. Create User
    const user = await prisma.user.create({
      data: {
        email: `restaurant${i + 1}@example.com`,
        password: 'hashedPassword123',
        userType: 'empresas',
        name: `Admin${i + 1}`,
        surname: `Surname${i + 1}`,
        role: 'admin'
      }
    })

    // 2. Create Restaurant
    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantNames[i],
        specialty: getRandomElement(specialties),
        format: getRandomElement(formats),
        region,
        comuna,
        description: `Restaurante especializado en comida ${getRandomElement(specialties).toLowerCase()}`,
        rut: `${76000000 + i}-${i % 9 + 1}`,
        legalName: `${restaurantNames[i]} SpA`,
        numberOfRestaurants: Math.floor(Math.random() * 5) + 1,
        workers: `${Math.floor(Math.random() * 100) + 20}`,
        weeklyAverageClients: `${Math.floor(Math.random() * 1000) + 300}`,
        benefits: getRandomElements(benefits, Math.floor(Math.random() * 3) + 2),
        userId: user.id,
        locations: {
          create: [
            {
              address: `${comuna} Address 1`,
              latitude: -33.4 + (Math.random() * 0.1),
              longitude: -70.6 + (Math.random() * 0.1)
            },
            {
              address: `${comuna} Address 2`,
              latitude: -33.4 + (Math.random() * 0.1),
              longitude: -70.6 + (Math.random() * 0.1)
            }
          ]
        }
      }
    })

    // 3. Create RestaurantUser (linking user to restaurant with admin role)
    await prisma.restaurantUser.create({
      data: {
        userId: user.id,
        restaurantId: restaurant.id,
        role: 'admin'
      }
    })

    console.log(`Created restaurant: ${restaurantNames[i]} with user and restaurant user`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
