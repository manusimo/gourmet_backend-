import Router from "express";
import { prisma } from "../db.js";
import { checkCompany, setUserRole } from '../helpers/authenticateToken.js';
import { getUserIdFromCookie, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie } from '../helpers/cookies.js';
import { getTalentPool } from "../helpers/pool.js";

const router = Router();

router.get('/talent-pool/check', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  try {
    const { employeeId } = req.query;
    const restaurantId = req.restaurantId;

    const existingEntry = await prisma.talentPool.findFirst({
      where: {
        employeeId: parseInt(employeeId),
        restaurantId,
      }
    });

    if (existingEntry) {
      return res.status(200).json({ exists: true });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking talent existence:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post('/talent-pool', checkCompany, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { employeeId } = req.body;
    const restaurantId = req.restaurantId;
    const restaurantUserId = req.restaurantUserId;

    console.log('this is the employee id', employeeId)

    console.log('This is the restaurant user id:', restaurantUserId);

    const existingEntry = await prisma.talentPool.findFirst({
      where: {
        employeeId,
        restaurantId,
      }
    });

    if (existingEntry) {
      return res.status(409).json({ message: "Employee already exists in the talent pool." });
    }

    const talentEntry = await prisma.talentPool.create({
      data: {
        employee: { connect: { id: employeeId } },
        restaurant: { connect: { id: restaurantId } },
        addedByUser: { connect: { id: restaurantUserId } },
        status: 'accepted', 
      }
    });

    res.status(201).json({ message: "Employee added to talent pool successfully", talentEntry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get('/talent-pool', setUserRole, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { restaurantId, restaurantUserId, userRole } = req;
    const { position, experience, region, comuna, available, schedule } = req.query;

    let filter = {};
    if (position) filter.position = position;
    if (available) filter.available = available;
    if (schedule) filter.schedule = schedule;
    if (region) filter.region = region;
    if (comuna) filter.comuna = comuna;

    const talentPool = await getTalentPool(restaurantId,filter);

    res.status(200).json(talentPool);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete('/talent-pool/:talentId', checkCompany, getRestaurantIdFromCookie, async (req, res) => {
  const talentId = parseInt(req.params.talentId);
  console.log('about to delete', talentId);

  try {
    const existingEntry = await prisma.talentPool.findUnique({
      where: { id: talentId },
      include: { conversations: true }
    });

    if (!existingEntry) {
      return res.status(404).json({ message: "Talent not found in the pool." });
    }

    await prisma.$transaction(async (tx) => {
      const conversationIds = existingEntry.conversations.map(conversation => conversation.id);

      // Delete messages in batch
      await tx.message.deleteMany({
        where: { conversationId: { in: conversationIds } }
      });

      // Delete conversations in batch
      await tx.conversation.deleteMany({
        where: { id: { in: conversationIds } }
      });

      // Delete the talent pool entry
      await tx.talentPool.delete({
        where: { id: talentId }
      });
    });

    res.status(200).json({ message: "Talent and associated conversations successfully removed from the pool." });
  } catch (error) {
    console.error('Error removing talent:', error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.patch('/talent-pool/:id/approve', checkCompany, getRestaurantIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantUserId = req.restaurantUserId;

    const talentEntry = await prisma.talentPool.update({
      where: { id: parseInt(id) },
      data: {
        status: "approved",
        addedByUser: { connect: { id: restaurantUserId } }
      }
    });

    res.status(200).json({ message: "Talent pool entry approved successfully", talentEntry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
