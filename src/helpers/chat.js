import { prisma } from '../db.js';

async function checkJoinAuthorization(req, res, next) {
  const { conversationId, userId } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { restaurant: true } });
    if (!user || !user.restaurant || user.restaurant.id !== conversationId) {
      return res.status(403).json({ error: 'You are not authorized to join this conversation.' });
    }
    req.user = user; 
    next();
  } catch (error) {
    console.error('Authorization check error:', error);
    res.status(500).json({ error: 'Authorization check failed.' });
  }
}

async function checkSendMessageAuthorization(req, res, next) {
  const { text, senderId, receiverId, conversationId } = req.body;
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { employeeId: senderId },  
          { restaurantUserId: senderId },  
        ],
      },
      include: { restaurant: true },
    });

    if (!user || !user.restaurant || user.restaurant.id !== conversationId) {
      return res.status(403).json({ error: 'You are not authorized to send messages in this conversation.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authorization check error:', error);
    res.status(500).json({ error: 'Authorization check failed.' });
  }
}


export { checkJoinAuthorization, checkSendMessageAuthorization };
