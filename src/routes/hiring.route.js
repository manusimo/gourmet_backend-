const express = require('express');
const { prisma } = require('../db.js');
const { checkCompany, checkEmployee } = require('../helpers/authenticateToken.js');
const { getAuthFromCookie, getEmployeeIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const { convertImageUrls } = require('../utils/imageUrlUtils.js');
const {
  createHiringOffer,
  getHiringById,
  getHiringByConversationId,
  acceptHiringOffer,
  rejectHiringOffer,
  sendHiringOfferMessage,
  getActiveHiringsForEmployee,
  getActiveHiringsForRestaurant,
  getEffectiveHiringValues
} = require('../helpers/hiringHelpers.js');

const router = express.Router();

// POST /hirings - Create hiring offer
router.post('/hirings', checkCompany, getAuthFromCookie, getRestaurantUserIdFromCookie, async (req, res) => {
  try {
    const {
      employeeId,
      conversationId,
      jobOfferId
    } = req.body;

    const restaurantUserId = req.restaurantUserId;
    const restaurantId = req.restaurantId;

    if (!employeeId || !conversationId) {
      return res.status(400).json({
        success: false,
        message: 'employeeId and conversationId are required'
      });
    }

    // Get conversation to verify it exists and get job offer info
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: {
        jobOffer: true,
        employee: true,
        restaurantUser: true
      }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Verify the restaurant user has access to this conversation
    if (conversation.restaurantUserId !== restaurantUserId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this conversation'
      });
    }

    // Use job offer info if available
    const finalJobOfferId = jobOfferId || conversation.jobOfferId;

    // Create hiring offer (all values come from JobOffer)
    const hiring = await createHiringOffer({
      employeeId: parseInt(employeeId),
      restaurantId: restaurantId || conversation.restaurantId,
      jobOfferId: finalJobOfferId,
      conversationId: parseInt(conversationId)
    });

    // Send message to employee (pass hiring to get effective values)
    await sendHiringOfferMessage({
      conversationId: parseInt(conversationId),
      senderUserId: restaurantUserId,
      receiverUserId: parseInt(employeeId),
      senderType: 'restaurant',
      receiverType: 'employee'
    }, hiring);

    res.status(201).json({
      success: true,
      message: 'Hiring offer created and message sent successfully',
      data: hiring
    });
  } catch (error) {
    console.error('Error creating hiring offer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// POST /hirings/:hiringId/accept - Accept hiring offer
router.post('/hirings/:hiringId/accept', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { hiringId } = req.params;
    const employeeId = req.employeeId;

    const hiring = await getHiringById(hiringId);

    if (!hiring) {
      return res.status(404).json({
        success: false,
        message: 'Hiring offer not found'
      });
    }

    // Verify the employee owns this hiring
    if (hiring.employeeId !== employeeId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to accept this hiring offer'
      });
    }

    const updatedHiring = await acceptHiringOffer(hiringId);

    // Send confirmation message if conversation exists
    if (hiring.conversationId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: hiring.conversationId },
        include: {
          restaurantUser: true
        }
      });

      if (conversation) {
        // Get effective values (use override if exists, otherwise JobOffer)
        const effectiveValues = getEffectiveHiringValues(updatedHiring);
        
        // Format dates for the message
        let dateMessage = '';
        if (effectiveValues.startDate) {
          const startDate = new Date(effectiveValues.startDate);
          const formattedStartDate = startDate.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
          
          if (effectiveValues.endDate) {
            const endDate = new Date(effectiveValues.endDate);
            const formattedEndDate = endDate.toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });
            dateMessage = `El período de trabajo comenzará el ${formattedStartDate} y terminará el ${formattedEndDate}.`;
          } else {
            dateMessage = `El período de trabajo comenzará el ${formattedStartDate}.`;
          }
        } else {
          // Fallback if no dates
          dateMessage = `El período de trabajo comenzará ahora y terminará en ${effectiveValues.period} días.`;
        }
        
        // Update message text to be acceptance
        const acceptanceMessage = await prisma.message.create({
          data: {
            text: `He aceptado la oferta de contratación para ${effectiveValues.position}. ${dateMessage}`,
            conversationId: hiring.conversationId,
            senderEmployeeId: employeeId,
            receiverRestaurantUserId: conversation.restaurantUserId
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Hiring offer accepted successfully',
      data: updatedHiring
    });
  } catch (error) {
    console.error('Error accepting hiring offer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// POST /hirings/:hiringId/reject - Reject hiring offer
router.post('/hirings/:hiringId/reject', checkEmployee, getEmployeeIdFromCookie, async (req, res) => {
  try {
    const { hiringId } = req.params;
    const employeeId = req.employeeId;

    const hiring = await getHiringById(hiringId);

    if (!hiring) {
      return res.status(404).json({
        success: false,
        message: 'Hiring offer not found'
      });
    }

    // Verify the employee owns this hiring
    if (hiring.employeeId !== employeeId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to reject this hiring offer'
      });
    }

    const updatedHiring = await rejectHiringOffer(hiringId);

    // Send rejection message if conversation exists
    if (hiring.conversationId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: hiring.conversationId },
        include: {
          restaurantUser: true
        }
      });

      if (conversation) {
        // Get effective values (use override if exists, otherwise JobOffer)
        const effectiveValues = getEffectiveHiringValues(hiring);
        
        const rejectionMessage = await prisma.message.create({
          data: {
            text: `He rechazado la oferta de contratación para ${effectiveValues.position}.`,
            conversationId: hiring.conversationId,
            senderEmployeeId: employeeId,
            receiverRestaurantUserId: conversation.restaurantUserId
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Hiring offer rejected successfully',
      data: updatedHiring
    });
  } catch (error) {
    console.error('Error rejecting hiring offer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// GET /hirings/active - Get active hirings
router.get('/hirings/active', async (req, res) => {
  try {
    const { userType, userId } = req.query;

    if (userType === 'profesionales') {
      // Get employee ID from user ID
      const employee = await prisma.employee.findFirst({
        where: { userId: parseInt(userId) }
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }

      const hirings = await getActiveHiringsForEmployee(employee.id);
      return res.status(200).json({
        success: true,
        data: hirings
      });
    } else if (userType === 'empresas') {
      // Get restaurant ID from user ID
      const restaurantUser = await prisma.restaurantUser.findFirst({
        where: { userId: parseInt(userId) }
      });

      if (!restaurantUser) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant user not found'
        });
      }

      const hirings = await getActiveHiringsForRestaurant(restaurantUser.restaurantId);
      return res.status(200).json({
        success: true,
        data: hirings
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type'
      });
    }
  } catch (error) {
    console.error('Error fetching active hirings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// GET /hirings/conversation/:conversationId - Get hiring by conversation ID
router.get('/hirings/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const hiring = await getHiringByConversationId(conversationId);
    
    if (!hiring) {
      return res.status(404).json({
        success: false,
        message: 'Hiring offer not found for this conversation'
      });
    }
    
    res.status(200).json({
      success: true,
      data: hiring
    });
  } catch (error) {
    console.error('Error fetching hiring by conversation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

// GET /hirings/job/:jobOfferId - Get all hirings for a job offer
router.get('/hirings/job/:jobOfferId', checkCompany, getAuthFromCookie, async (req, res) => {
  try {
    const { jobOfferId } = req.params;
    
    const hirings = await prisma.hiring.findMany({
      where: {
        jobOfferId: parseInt(jobOfferId),
        status: {
          in: ['active', 'accepted'] // Only show active/accepted hirings
        }
      },
      include: {
        employee: {
          include: {
            user: true
          }
        },
        restaurant: true,
        jobOffer: true
      },
      orderBy: {
        acceptanceDate: 'desc'
      }
    });
    
    // Convert employee image URLs to signed URLs
    const hiringsWithSignedUrls = await Promise.all(
      hirings.map(async (hiring) => {
        const convertedHiring = { ...hiring };
        if (convertedHiring.employee) {
          convertedHiring.employee = await convertImageUrls(convertedHiring.employee, ['profileImageUrl']);
        }
        return convertedHiring;
      })
    );
    
    res.status(200).json({
      success: true,
      data: hiringsWithSignedUrls
    });
  } catch (error) {
    console.error('Error fetching hirings for job:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error'
    });
  }
});

module.exports = router;

