import Router from "express";
import csrf from 'csurf';
import { prisma } from "../db.js";
import jwt from 'jsonwebtoken';
import { checkCompany, setUserRole }  from '../helpers/authenticateToken.js';
import { getUserIdFromCookie, getRestaurantIdFromCookie } from '../helpers/cookies.js';
import { buildFilters, buildSearchConditions } from "../helpers/filterHelpers.js";
import { deleteLocations, updateCompanyProfile, createNewLocations } from '../helpers/company.js'
import {getOrderByCriteriaCompanies} from '../helpers/orderBy.js'
import { verifyCSRFToken } from "../helpers/csrf.js";

const csrfProtection = csrf({ cookie: true });
const router = Router();

router.get('/companies', async (req, res) => {
  const {
    q,
    page = 1,
    limit = 10,
    orderBy
  } = req.query;

  const pageInt = parseInt(page, 10);
  const limitInt = parseInt(limit, 10);

  if (orderBy && !['popularity', 'scale'].includes(orderBy)) {
    console.error(`Invalid orderBy value: ${orderBy}`);
    return res.status(400).json({ error: "Invalid orderBy value. Must be 'popularity' or 'scale'" });
  }

  try {
    const filters = buildFilters(req.query, ['format', 'specialty']);
    const searchConditions = buildSearchConditions(q, 'name');
    console.log('Filters:', filters);
    console.log('Search Conditions:', searchConditions);

    const companies = await prisma.restaurant.findMany({
      where: {
        ...filters,
        ...searchConditions,
      },
      take: limitInt,
      skip: (pageInt - 1) * limitInt,
    });

    const totalCompanies = await prisma.restaurant.count({
      where: {
        ...filters,
        ...searchConditions,
      },
    });

    res.json({
      companies,
      totalCompanies,
      currentPage: pageInt,
      totalPages: Math.ceil(totalCompanies / limitInt),
    });
  } catch (error) {
    console.error('Internal Server Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/api/company/restaurantUser/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid or missing userId' });
  }

  try {
    const restaurantUser = await prisma.restaurantUser.findUnique({
      where: {
        userId: parseInt(userId),
      },
      include: {
        user: true,
        restaurant: true,
      },
    });

    if (!restaurantUser) {
      return res.status(404).json({ error: 'Restaurant user not found' });
    }

    // Return the restaurant user data
    return res.status(200).json({ data: restaurantUser });
  } catch (error) {
    console.error('Error fetching restaurant user:', error);
    return res.status(500).json({ error: 'Failed to fetch restaurant user' });
  }
});

router.get('/company/locations', getRestaurantIdFromCookie, async (req, res) => {
  const restaurantId = req.restaurantId;

  if (!restaurantId) {
    return res.status(400).json({
      success: false,
      message: 'companyId is required',
    });
  }

  try {
    const locations = await prisma.location.findMany({
      where: { restaurantId: parseInt(restaurantId) },
      select: { id: true, address: true },
    });

    if (!locations.length) {
      return res.status(404).json({
        success: false,
        message: 'No locations found for this company.',
      });
    }

    const formattedLocations = locations.map(({ id, address }) => ({
      locationId: id,
      address
    }));

    return res.status(200).json(formattedLocations);
  } catch (error) {
    console.error('Error fetching company locations:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

router.get('/company/top-rated-companies', async (req, res) => {
  const {
    page = 1,
    limit = 4,
  } = req.query;

  const skip = (page - 1) * limit;

  try {
    const companies = await prisma.restaurant.findMany({
      orderBy: {
        jobOffers: {
          _count: 'desc',
        },
      },
      take: parseInt(limit, 10),
      skip: skip,
      include: {
        _count: {
          select: { jobOffers: { where: { deletedAt: null } } },
        },
      },
    });

    const totalCompanies = await prisma.restaurant.count();

    res.json({
      companies: companies.map(company => ({
        ...company,
        jobOffersCount: company._count.jobOffers,
      })),
      totalCompanies,
      currentPage: page,
      totalPages: Math.ceil(totalCompanies / limit),
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/company/talents-application', getRestaurantIdFromCookie, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    const talents = await prisma.talentPool.findMany({
      where: {
        status: "pendent",
        restaurantId: parseInt(restaurantId, 10),
      },
      include: {
        employee: true,
      }
    });

    console.log('here you have some talents', talents)

    res.status(200).json({ message: 'Some talents want to be part of this company', talents });
  } catch (error) {
    console.error('Error fetching talents:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post('/company', checkCompany, getUserIdFromCookie, setUserRole, async (req, res) => {
  try {
    const {
      name,
      specialty,
      format,
      description,
      rut,
      legalName,
      region,
      comuna,
      numberOfRestaurants,
      workers,
      weeklyAverageClients,
      benefits,
      locations,
      jobOffers,
      profileImageUrl,
      profileCarouselUrls
    } = req.body;

    const benefitsArray = Object.keys(benefits).filter(benefit => benefits[benefit]);
    const userId = req.userId;
    const role = req.userRole;

    const formattedLocations = locations.map(location => ({
      address: location.address,
      longitude: parseFloat(location.longitude),
      latitude: parseFloat(location.latitude),
    }));

    const companyProfile = await prisma.restaurant.create({
      data: {
        name,
        specialty,
        format,
        description,
        rut,
        legalName,
        region,
        comuna,
        numberOfRestaurants: parseInt(numberOfRestaurants, 10),
        workers,
        weeklyAverageClients,
        profileImageUrl,
        profileCarouselUrls,
        benefits: benefitsArray,
        locations: { create: formattedLocations },
        jobOffers: { create: jobOffers },
        userId,
      },
    });

    const restaurantUser = await prisma.restaurantUser.create({
      data: {
        userId,
        restaurantId: companyProfile.id,
        role: 'admin'
      }
    });

    const updateUser = await prisma.user.update({
      where: { id: userId },
      data: {
        restaurant: { connect: { id: companyProfile.id } }
      }
    });

    const newToken = jwt.sign({
      userId: userId,
      userType: 'empresas',
      restaurantId: companyProfile.id,
      restaurantUserId: restaurantUser.id,
      role: role,
    }, process.env.JWT_SECRET);

    res.cookie('manu', newToken, {
      httpOnly: true,
      sameSite: 'None',
      secure: true,
    });

    res.status(201).json({ message: 'Company created successfully', companyProfile });
  } catch (error) {
    console.error('Error creating company:', error.message, error.stack);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/company/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        locations: true,
        jobOffers: { where: { deletedAt: null } },
      },
    });

    console.log('this is the restaurant', restaurant.benefits)

    if (restaurant) {
      res.status(200).json({ company: restaurant });
    } else {
      res.status(404).send('Restaurant not found');
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.get('/company', getRestaurantIdFromCookie, async (req, res) => {
  try {
    const restaurantId = req.restaurantId

    const company = await prisma.restaurant.findUnique({
      where: {
        id: parseInt(restaurantId),
      },
      include: {
        locations: true,
        jobOffers: { where: { deletedAt: null } },
      },
    });

    if (company) {
      res.status(200).json(company);
    } else {
      res.status(404).send('Company not found');
    }
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

router.patch('/company', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const {
      legalName,
      rut,
      name,
      format,
      specialty,
      region,
      comuna,
      numberOfRestaurants,
      workers,
      weeklyAverageClients,
      description,
      benefits,
      locations,
      profileImageUrl,
      profileCarouselUrls,
    } = req.body;

    const restaurantId = req.restaurantId;

    const newLocations = locations.filter(location => !location.id).map(location => ({
      ...location,
      longitude: parseFloat(location.longitude),
      latitude: parseFloat(location.latitude),
    }));

    const existingLocations = locations.filter(location => location.id);

    const currentLocations = await prisma.location.findMany({
      where: { restaurantId },
    });

    const locationsToDelete = currentLocations.filter(currentLocation =>
      !locations.some(location => location.id === currentLocation.id)
    );

    await prisma.$transaction(async () => {
      await deleteLocations(locationsToDelete);
      await updateCompanyProfile(restaurantId, {
        legalName,
        rut,
        name,
        format,
        specialty,
        numberOfRestaurants,
        workers,
        profileImageUrl,
        weeklyAverageClients,
        description,
        region,
        comuna,
        benefits,
        existingLocations,
        profileCarouselUrls,
      });
      await createNewLocations(newLocations, restaurantId);
    });

    res.status(200).json({ message: 'Company profile updated successfully' });
  } catch (error) {
    console.error('Error updating company profile:', error.message, error.stack);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export default router
