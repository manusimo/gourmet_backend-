const { PrismaClient } = require('@prisma/client');
const meetingAgentService = require('../services/meetingAgentService.js');
const aiMeetingService = require('../services/aiMeetingService.js');
const { processMeetingNotifications } = require('../services/meetingNotificationService.js');

const prisma = new PrismaClient();

// Message types for meeting booking
const MESSAGE_TYPES = {
  MEETING_REQUEST: 'meeting_request',
  MEETING_PROPOSAL: 'meeting_proposal',
  MEETING_ACCEPT: 'meeting_accept',
  MEETING_DECLINE: 'meeting_decline',
  MEETING_RESCHEDULE: 'meeting_reschedule',
  MEETING_CONFIRM: 'meeting_confirm',
  MEETING_REMINDER: 'meeting_reminder'
};

// Create a meeting booking message
const createMeetingMessage = async (messageData) => {
  const {
    conversationId,
    senderUserId,
    receiverUserId,
    senderType,
    receiverType,
    messageType,
    meetingData = {},
    text = ''
  } = messageData;

  // Create the base message
  const message = await prisma.message.create({
    data: {
      text: text || getDefaultMessageText(messageType, meetingData),
      conversationId: parseInt(conversationId),
      senderEmployeeId: senderType === 'employee' ? parseInt(senderUserId) : null,
      senderRestaurantUserId: senderType === 'restaurant' ? parseInt(senderUserId) : null,
      receiverEmployeeId: receiverType === 'employee' ? parseInt(receiverUserId) : null,
      receiverRestaurantUserId: receiverType === 'restaurant' ? parseInt(receiverUserId) : null,
      // Store meeting data in a JSON field (we'll need to add this to the schema)
      // For now, we'll encode it in the text or use a separate approach
    }
  });

  // Handle meeting-specific actions based on message type
  await handleMeetingMessageAction(messageType, meetingData, conversationId);

  return message;
};

// Get default message text based on type
const getDefaultMessageText = (messageType, meetingData) => {
  switch (messageType) {
    case MESSAGE_TYPES.MEETING_REQUEST:
      return `📅 Hola! Me gustaría programar una reunión contigo para hablar sobre la posición. ¿Te parece bien?`;
    
    case MESSAGE_TYPES.MEETING_PROPOSAL:
      const { proposedDate, duration, title } = meetingData;
      const dateStr = new Date(proposedDate).toLocaleString('es-CL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Santiago'
      });
      return `📅 Te propongo una reunión para ${title || 'entrevista'} el ${dateStr} (${duration || 30} minutos). ¿Te funciona?`;
    
    case MESSAGE_TYPES.MEETING_ACCEPT:
      return `✅ ¡Perfecto! Acepto la reunión. Te confirmo los detalles por email.`;
    
    case MESSAGE_TYPES.MEETING_DECLINE:
      return `❌ Lamento, pero no puedo en esa fecha. ¿Podríamos encontrar otro horario?`;
    
    case MESSAGE_TYPES.MEETING_RESCHEDULE:
      const { newDate } = meetingData;
      const newDateStr = new Date(newDate).toLocaleString('es-CL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Santiago'
      });
      return `🔄 ¿Te parece si cambiamos la reunión para el ${newDateStr}?`;
    
    case MESSAGE_TYPES.MEETING_CONFIRM:
      return `✅ Reunión confirmada. Te enviaré los detalles por email.`;
    
    case MESSAGE_TYPES.MEETING_REMINDER:
      return `⏰ Recordatorio: Tenemos una reunión programada mañana. ¡Nos vemos pronto!`;
    
    default:
      return text || 'Mensaje de reunión';
  }
};

// Handle meeting-specific actions
const handleMeetingMessageAction = async (messageType, meetingData, conversationId) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: {
        employee: {
          include: { user: true }
        },
        restaurant: true
      }
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    switch (messageType) {
      case MESSAGE_TYPES.MEETING_PROPOSAL:
        // Create a pending meeting when proposing
        await createPendingMeeting(meetingData, conversation);
        break;
      
      case MESSAGE_TYPES.MEETING_ACCEPT:
        // Confirm the meeting when accepted
        await confirmMeeting(meetingData, conversation);
        break;
      
      case MESSAGE_TYPES.MEETING_DECLINE:
        // Handle meeting decline
        await declineMeeting(meetingData, conversation);
        break;
      
      case MESSAGE_TYPES.MEETING_RESCHEDULE:
        // Reschedule the meeting
        await rescheduleMeeting(meetingData, conversation);
        break;
      
      case MESSAGE_TYPES.MEETING_CONFIRM:
        // Final confirmation
        await finalConfirmMeeting(meetingData, conversation);
        break;
    }
  } catch (error) {
    console.error('Error handling meeting message action:', error);
  }
};

// Create a pending meeting
const createPendingMeeting = async (meetingData, conversation) => {
  const {
    proposedDate,
    duration = 30,
    title = 'Entrevista',
    description = '',
    meetingLink = ''
  } = meetingData;

  const meeting = await prisma.scheduledCall.create({
    data: {
      restaurantId: conversation.restaurantId,
      employeeId: conversation.employeeId,
      title,
      description,
      scheduledDate: new Date(proposedDate),
      duration: parseInt(duration),
      meetingLink,
      status: 'pending_confirmation'
    }
  });

  return meeting;
};

// Confirm a meeting
const confirmMeeting = async (meetingData, conversation) => {
  const { meetingId } = meetingData;
  
  if (meetingId) {
    const meeting = await prisma.scheduledCall.update({
      where: { id: parseInt(meetingId) },
      data: { status: 'scheduled' },
      include: {
        employee: {
          include: { user: true }
        },
        restaurant: true
      }
    });

    // Send confirmation notifications
    await processMeetingNotifications({
      meeting,
      type: 'meeting_scheduled',
      restaurantId: conversation.restaurantId,
      employeeId: conversation.employeeId
    });

    return meeting;
  }
};

// Decline a meeting
const declineMeeting = async (meetingData, conversation) => {
  const { meetingId } = meetingData;
  
  if (meetingId) {
    const meeting = await prisma.scheduledCall.update({
      where: { id: parseInt(meetingId) },
      data: { status: 'declined' }
    });

    return meeting;
  }
};

// Reschedule a meeting
const rescheduleMeeting = async (meetingData, conversation) => {
  const { meetingId, newDate } = meetingData;
  
  if (meetingId && newDate) {
    const meeting = await prisma.scheduledCall.update({
      where: { id: parseInt(meetingId) },
      data: {
        scheduledDate: new Date(newDate),
        status: 'rescheduled'
      },
      include: {
        employee: {
          include: { user: true }
        },
        restaurant: true
      }
    });

    // Send reschedule notifications
    await processMeetingNotifications({
      meeting,
      type: 'meeting_rescheduled',
      restaurantId: conversation.restaurantId,
      employeeId: conversation.employeeId
    });

    return meeting;
  }
};

// Final confirm meeting
const finalConfirmMeeting = async (meetingData, conversation) => {
  const { meetingId } = meetingData;
  
  if (meetingId) {
    const meeting = await prisma.scheduledCall.update({
      where: { id: parseInt(meetingId) },
      data: { status: 'confirmed' }
    });

    return meeting;
  }
};

// Get AI-suggested meeting times for chat
const getAISuggestedTimes = async (conversationId) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: {
        employee: {
          include: {
            user: true,
            experiences: true,
            educations: true
          }
        },
        restaurant: true,
        jobOffer: true
      }
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Prepare candidate data for AI analysis
    const candidateData = {
      name: conversation.employee.user.name,
      position: conversation.employee.position,
      yearsOfExperience: conversation.employee.yearsOfExperience,
      location: conversation.employee.location,
      aboutMe: conversation.employee.aboutMe,
      skills: conversation.employee.skills,
      experiences: conversation.employee.experiences,
      educations: conversation.employee.educations,
      profileCompleteness: calculateProfileCompleteness(conversation.employee)
    };

    // Prepare restaurant data
    const restaurantData = {
      name: conversation.restaurant.name,
      specialty: conversation.restaurant.specialty,
      location: conversation.restaurant.region,
      operatingHours: 'No especificados'
    };

    // Use AI to analyze candidate and generate suggestions
    const [aiAnalysis, aiTimeSuggestions] = await Promise.all([
      aiMeetingService.analyzeCandidateForMeeting(candidateData),
      aiMeetingService.generateOptimalMeetingTimes(restaurantData, candidateData, {
        meetingType: conversation.jobOffer?.position || 'initial_screening'
      })
    ]);

    return {
      analysis: {
        ...aiAnalysis,
        employee: conversation.employee,
        confidence: aiAnalysis.confidence || 0.8
      },
      suggestedTimes: aiTimeSuggestions.suggestions || [],
      recommendedDuration: aiAnalysis.duration || 30,
      suggestedTitle: generateMeetingTitle(aiAnalysis.meetingType),
      aiInsights: {
        reasoning: aiAnalysis.reason,
        priority: aiAnalysis.priority,
        experienceLevel: aiAnalysis.experienceLevel
      }
    };
  } catch (error) {
    console.error('Error getting AI suggested times:', error);
    // Fallback to rule-based analysis
    return await getFallbackSuggestedTimes(conversationId);
  }
};

// Create meeting proposal message with AI suggestions
const createAIMeetingProposal = async (conversationId, senderUserId, receiverUserId, senderType, receiverType) => {
  try {
    const suggestions = await getAISuggestedTimes(conversationId);
    const bestTime = suggestions.suggestedTimes[0];

    if (!bestTime) {
      throw new Error('No available time slots found');
    }

    // Get conversation data for AI message generation
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: {
        employee: {
          include: { user: true }
        },
        restaurant: true
      }
    });

    // Generate AI-powered meeting request message
    const candidateData = {
      name: conversation.employee.user.name,
      position: conversation.employee.position
    };

    const restaurantData = {
      name: conversation.restaurant.name,
      specialty: conversation.restaurant.specialty
    };

    const aiMessage = await aiMeetingService.generateMeetingRequestMessage(
      candidateData,
      restaurantData,
      suggestions.analysis.meetingType
    );

    const meetingData = {
      proposedDate: bestTime.date,
      duration: suggestions.recommendedDuration,
      title: suggestions.suggestedTitle,
      description: `Reunión sugerida por IA: ${suggestions.aiInsights.reasoning}`
    };

    const message = await createMeetingMessage({
      conversationId,
      senderUserId,
      receiverUserId,
      senderType,
      receiverType,
      messageType: MESSAGE_TYPES.MEETING_PROPOSAL,
      meetingData,
      text: aiMessage
    });

    return {
      message,
      suggestions,
      meetingData,
      aiInsights: suggestions.aiInsights
    };
  } catch (error) {
    console.error('Error creating AI meeting proposal:', error);
    throw error;
  }
};

// Get meeting status from conversation
const getConversationMeetingStatus = async (conversationId) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) }
    });

    if (!conversation) {
      return null;
    }

    const meetings = await prisma.scheduledCall.findMany({
      where: {
        restaurantId: conversation.restaurantId,
        employeeId: conversation.employeeId,
        status: {
          not: 'cancelled'
        }
      },
      orderBy: {
        scheduledDate: 'desc'
      },
      take: 1
    });

    return meetings.length > 0 ? meetings[0] : null;
  } catch (error) {
    console.error('Error getting conversation meeting status:', error);
    return null;
  }
};

// Generate quick response options for meeting messages
const getMeetingResponseOptions = (messageType, meetingData) => {
  switch (messageType) {
    case MESSAGE_TYPES.MEETING_REQUEST:
      return [
        { text: '✅ Sí, me parece bien', action: 'accept_request' },
        { text: '❌ No, gracias', action: 'decline_request' },
        { text: '🔄 ¿Podemos hablar de horarios?', action: 'discuss_times' }
      ];
    
    case MESSAGE_TYPES.MEETING_PROPOSAL:
      return [
        { text: '✅ Acepto esta fecha', action: 'accept_proposal', meetingId: meetingData.meetingId },
        { text: '❌ No puedo en esa fecha', action: 'decline_proposal', meetingId: meetingData.meetingId },
        { text: '🔄 ¿Otra fecha?', action: 'suggest_alternative' }
      ];
    
    case MESSAGE_TYPES.MEETING_RESCHEDULE:
      return [
        { text: '✅ Perfecto', action: 'accept_reschedule', meetingId: meetingData.meetingId },
        { text: '❌ No me funciona', action: 'decline_reschedule', meetingId: meetingData.meetingId },
        { text: '🔄 Propongo otra fecha', action: 'counter_propose' }
      ];
    
    default:
      return [];
  }
};

// Helper functions
const calculateProfileCompleteness = (employee) => {
  let score = 0;
  const maxScore = 100;

  if (employee.name) score += 10;
  if (employee.aboutMe && employee.aboutMe.length > 50) score += 20;
  if (employee.position) score += 10;
  if (employee.location) score += 10;
  if (employee.skills && employee.skills.length > 0) score += 15;
  if (employee.experiences && employee.experiences.length > 0) score += 20;
  if (employee.educations && employee.educations.length > 0) score += 15;

  return Math.min(score, maxScore);
};

const generateMeetingTitle = (meetingType) => {
  const titles = {
    'phone_screening': 'Llamada de preselección',
    'initial_screening': 'Entrevista inicial',
    'technical_interview': 'Entrevista técnica',
    'final_interview': 'Entrevista final'
  };
  return titles[meetingType] || 'Entrevista de trabajo';
};

const getFallbackSuggestedTimes = async (conversationId) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: {
        employee: {
          include: { user: true }
        },
        restaurant: true
      }
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Fallback to rule-based analysis
    const analysis = await meetingAgentService.analyzeApplicantForMeeting(
      conversation.employeeId,
      conversation.jobOfferId
    );

    const optimalSlots = await meetingAgentService.suggestOptimalTimes(
      conversation.restaurantId,
      conversation.employeeId
    );

    return {
      analysis,
      suggestedTimes: optimalSlots.slice(0, 5),
      recommendedDuration: analysis.recommendedDuration,
      suggestedTitle: generateMeetingTitle(analysis.suggestedMeetingType),
      aiInsights: {
        reasoning: 'Análisis basado en reglas predefinidas',
        priority: analysis.priority,
        experienceLevel: analysis.experienceLevel
      }
    };
  } catch (error) {
    console.error('Error in fallback suggested times:', error);
    throw error;
  }
};

module.exports = {
  MESSAGE_TYPES,
  createMeetingMessage,
  createAIMeetingProposal,
  getAISuggestedTimes,
  getConversationMeetingStatus,
  getMeetingResponseOptions,
  handleMeetingMessageAction
};
