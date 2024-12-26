import express from 'express';
import { checkJoinAuthorization, checkSendMessageAuthorization } from '../helpers/chat.js';
import  { checkCompany, setUserRole }  from '../helpers/authenticateToken.js';
import { 
  getUserIdFromCookie, 
  getRestaurantIdFromCookie, 
  getEmployeeIdFromCookie, 
  getRestaurantUserIdFromCookie,
  validateTokenAndIdentifyUser 
} from '../helpers/cookies.js';
import { prisma } from "../db.js";

const router = express.Router();

router.get('/conversations/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: {
        messages: true,
        jobOffer: true,
        talentPool: true,
        employee: true,
        restaurantUser: true,
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // if (employeeId && conversation.employeeId !== employeeId) {
    //   console.log(`Employee with ID ${employeeId} is not authorized for conversation ${conversationId}`);
    //   return res.status(403).json({ error: 'Employee not authorized for this conversation' });
    // }

    // if (restaurantUserId && conversation.restaurantUserId !== restaurantUserId) {
    //   console.log(`Restaurant user with ID ${restaurantUserId} is not authorized for conversation ${conversationId}`);
    //   return res.status(403).json({ error: 'Restaurant user not authorized for this conversation' });
    // }

    res.status(200).json({ conversation });
  } catch (error) {
    console.error('Failed to fetch conversation:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/conversations/:conversationId/messages', validateTokenAndIdentifyUser, async (req, res) => {
  const { conversationId } = req.params;
  const { employeeId, restaurantUserId } = req;

  if (!employeeId && !restaurantUserId) {
    console.log('Unauthorized access: No valid user ID found');
    return res.status(403).json({ error: 'Unauthorized access. You must be either an employee or a restaurant user.' });
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: { messages: true }
    });

    if (!conversation) {
      console.log(`Conversation with ID ${conversationId} not found`);
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    if (employeeId && conversation.employeeId !== employeeId) {
      console.log(`Employee with ID ${employeeId} is not authorized for conversation ${conversationId}`);
      return res.status(404).json({ error: 'Employee not authorized for this conversation' });
    }

    if (restaurantUserId && conversation.restaurantUserId !== restaurantUserId) {
      console.log(`Restaurant user with ID ${restaurantUserId} is not authorized for conversation ${conversationId}`);
      return res.status(404).json({ error: 'Restaurant user not authorized for this conversation' });
    }

    res.status(200).json({ messages: conversation.messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/send-message', async (req, res) => {
  const { text, senderUserId, receiverUserId, conversationId, senderType, receiverType } = req.body;

  try {
    const senderRelation = senderType === 'employee' 
      ? { senderEmployee: { connect: { id: parseInt(senderUserId) } } } 
      : { senderRestaurantUser: { connect: { id: parseInt(senderUserId) } } };

    const receiverRelation = receiverType === 'employee' 
      ? { receiverEmployee: { connect: { id: parseInt(receiverUserId) } } } 
      : { receiverRestaurantUser: { connect: { id: parseInt(receiverUserId) } } };

    console.log('Sender Relation:', senderRelation);
    console.log('Receiver Relation:', receiverRelation);

    const message = await prisma.message.create({
      data: {
        text,
        conversation: { connect: { id: parseInt(conversationId) } },
        ...senderRelation,
        ...receiverRelation,
      },
    });

    console.log('Message Created:', message);

    res.status(200).json({ message: 'Message sent successfully.', data: message });
  } catch (error) {
    console.error('Error sending message:', error);

    res.status(500).json({ error: 'Failed to send message.' });
  }
});

router.get('/check-conversation/:employeeId/:type', checkCompany, getRestaurantUserIdFromCookie, async (req, res) => {
  const { employeeId, type } = req.params;
  const restaurantUserId = req.restaurantUserId;
  console.log('checking the existence of the conversation in the backend', employeeId, restaurantUserId, type)
 
  if (!restaurantUserId) {
    return res.status(400).json({ error: 'Restaurant user ID not found in cookies.' });
  }

  try {
      let conversation;

      if (type === 'talent') {
        conversation = await prisma.conversation.findFirst({
          where: {
            employeeId: parseInt(employeeId),
            restaurantUserId: parseInt(restaurantUserId),
            type: 'talent'
          },
        });
      } 
      
      if (type === 'application') {
        console.log('check the application conversation')
        conversation = await prisma.conversation.findFirst({
          where: {
            employeeId: parseInt(employeeId),
            restaurantUserId: parseInt(restaurantUserId),
            type: 'applicant'
          },
        });

        console.log('this is the conversation', conversation)
      }

      if (conversation) {
        res.status(200).json({ message: 'Conversation found.', conversation });
      } else {
        res.status(404).json({ message: 'Conversation not found.' });
      }
  } catch (error) {
      console.error('Error checking conversation:', error);
      res.status(500).json({ error: 'Failed to check conversation.' });
  }
});

router.post('/create-conversation', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  const { employeeId, jobPostId, talentPoolId, type } = req.body;
  const userId = req.userId;
  const restaurantUserId = req.restaurantUserId;

  try {
    let conversation;
    
    const parsedEmployeeId = parseInt(employeeId, 10);

    if (jobPostId) {
      conversation = await prisma.conversation.findFirst({
        where: {
          employeeId: parsedEmployeeId,
          jobOfferId: jobPostId,
          restaurantUserId: restaurantUserId,
          type
        },
      });
    }
    
    if (talentPoolId) {
      conversation = await prisma.conversation.findFirst({
        where: {
          employeeId: parsedEmployeeId,  
          talentPoolId,
          restaurantUserId: restaurantUserId,
          type
        },
      });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          employeeId: parsedEmployeeId,  
          jobOfferId: jobPostId,
          talentPoolId: talentPoolId,
          restaurantUserId,
          type
        },
      });
    }

    res.status(200).json({ message: 'Conversation created/ensured.', conversation });
  } catch (error) {
    console.error('Error creating/ensuring conversation:', error);
    res.status(500).json({ error: 'Failed to create/ensure conversation.' });
  }
});

router.get('/conversations/:employeeId/:type', checkCompany, getUserIdFromCookie, async (req, res) => {
  const { employeeId, type } = req.params;
  const { restaurantUserId } = req.cookies; 
  
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        restaurantUserId: parseInt(restaurantUserId),
        employeeId: parseInt(employeeId),
        type: type.toLowerCase(),
      },
      include: {
        messages: true,
        jobOffer: true,
        talentPool: true,
        employee: true,
        restaurantUser: true,
      },
    });

    res.status(200).json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

router.get('/conversations', validateTokenAndIdentifyUser, async (req, res) => {
  try {
    if (req.employeeId) {
      console.log(`Fetching conversations for employee with ID: ${req.employeeId}`);

      const employeeConversations = await prisma.conversation.findMany({
        where: { 
          employeeId: req.employeeId,
          type: req.query.type || 'none',
        },
        include: { 
          messages: true, 
          jobOffer: true,
          employee: true,
          restaurantUser: { 
            include: {
              restaurant: true,
            },
          },  
        },
      });

      console.log(`Found ${employeeConversations.length} conversations for employee ${req.employeeId}`);
      return res.status(200).json({ conversations: employeeConversations });
    }

    if (req.restaurantUserId) {
      console.log(`Fetching conversations for restaurant user with ID: ${req.restaurantUserId}`);

      const restaurantConversations = await prisma.conversation.findMany({
        where: { 
          restaurantUserId: parseInt(req.restaurantUserId),
          type: req.query.type || '', 
        },
        include: { 
          messages: true, 
          jobOffer: true,
          employee: true,  
        },
      });

      console.log(`Found ${restaurantConversations.length} conversations for restaurant user ${req.restaurantUserId}`);
      return res.status(200).json({ conversations: restaurantConversations });
    }

    console.log('No valid user type found in the request. Unable to fetch conversations.');
    return res.status(400).json({ message: 'Invalid user type or ID' });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.delete('/conversations/:conversationId', getEmployeeIdFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  const { conversationId } = req.params;
  const employeeId = req.employeeId;
  const restaurantUserId = req.restaurantUserId;

  if (!employeeId && !restaurantUserId) {
    return res.status(403).json({ error: 'Unauthorized access.' });
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: { messages: true }, 
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    await prisma.message.deleteMany({
      where: { conversationId: parseInt(conversationId) },
    });

    const conversationDeleted = await prisma.conversation.delete({
      where: { id: parseInt(conversationId) },
    });

    console.log('conversation deleted', conversationDeleted)

    res.status(200).json({ message: 'Conversation deleted successfully.' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

export default router;

