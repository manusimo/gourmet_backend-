const { PrismaClient } = require('@prisma/client');
const { createMessage } = require('../helpers/chatHelpers.js');

const prisma = new PrismaClient();

class ConversationalAgent {
  constructor() {
    this.activeConversations = new Map(); // Track active agent conversations
    this.conversationStates = new Map(); // Track conversation flow states
  }

  // Start agent for a specific conversation
  async startAgentForConversation(conversationId, restaurantId) {
    try {
      console.log(`🤖 Starting conversational agent for conversation ${conversationId}`);

      // Get conversation details
      const conversation = await prisma.conversation.findUnique({
        where: { id: parseInt(conversationId) },
        include: {
          employee: {
            include: { user: true }
          },
          restaurant: true,
          jobOffer: true
        }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Check if agent is already active for this conversation
      if (this.activeConversations.has(conversationId)) {
        console.log(`⚠️ Agent already active for conversation ${conversationId}`);
        return { success: false, message: 'Agent already active for this conversation' };
      }

      // Initialize conversation state
      const initialState = {
        step: 'greeting',
        employeeName: conversation.employee.user.name,
        jobTitle: conversation.jobOffer?.position || 'trabajo',
        restaurantName: conversation.restaurant.name,
        attempts: 0,
        maxAttempts: 5,
        lastMessageTime: new Date(),
        scheduledCall: null
      };

      this.conversationStates.set(conversationId, initialState);
      this.activeConversations.set(conversationId, {
        conversationId,
        restaurantId,
        employeeId: conversation.employeeId,
        restaurantUserId: conversation.restaurantUserId,
        startTime: new Date()
      });

      // Send initial greeting
      await this.sendAgentMessage(conversationId, 'greeting');

      console.log(`✅ Conversational agent started for conversation ${conversationId}`);
      return { success: true, message: 'Agent started successfully' };

    } catch (error) {
      console.error('❌ Error starting conversational agent:', error);
      throw error;
    }
  }

  // Stop agent for a specific conversation
  stopAgentForConversation(conversationId) {
    this.activeConversations.delete(conversationId);
    this.conversationStates.delete(conversationId);
    console.log(`🛑 Conversational agent stopped for conversation ${conversationId}`);
  }

  // Process incoming message and generate response
  async processMessage(conversationId, messageText, senderType) {
    try {
      // Only process messages from employees (not from restaurant users)
      if (senderType !== 'employee') {
        return;
      }

      const state = this.conversationStates.get(conversationId);
      if (!state) {
        console.log(`⚠️ No active agent for conversation ${conversationId}`);
        return;
      }

      console.log(`💬 Processing message from employee: "${messageText}"`);
      console.log(`📊 Current state:`, state);

      // Update last message time
      state.lastMessageTime = new Date();
      state.attempts++;

      // Process based on current step
      let response = null;
      let nextStep = state.step;

      switch (state.step) {
        case 'greeting':
          response = await this.handleGreetingResponse(messageText, state);
          nextStep = 'availability';
          break;

        case 'availability':
          response = await this.handleAvailabilityResponse(messageText, state);
          if (response.includes('perfecto') || response.includes('programado')) {
            nextStep = 'confirmation';
          } else {
            nextStep = 'alternative_times';
          }
          break;

        case 'alternative_times':
          response = await this.handleAlternativeTimesResponse(messageText, state);
          if (response.includes('perfecto') || response.includes('programado')) {
            nextStep = 'confirmation';
          } else {
            nextStep = 'fallback';
          }
          break;

        case 'confirmation':
          response = await this.handleConfirmationResponse(messageText, state);
          nextStep = 'completed';
          break;

        case 'fallback':
          response = await this.handleFallbackResponse(messageText, state);
          nextStep = 'completed';
          break;

        default:
          response = "Gracias por tu mensaje. Te contactaremos pronto.";
          nextStep = 'completed';
      }

      // Update state
      state.step = nextStep;

      // Send response if we have one
      if (response) {
        await this.sendAgentMessage(conversationId, 'response', response);
      }

      // Check if conversation should end
      if (state.attempts >= state.maxAttempts || nextStep === 'completed') {
        this.stopAgentForConversation(conversationId);
      }

    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  }

  // Handle greeting response
  async handleGreetingResponse(messageText, state) {
    const lowerText = messageText.toLowerCase();
    
    if (lowerText.includes('hola') || lowerText.includes('buenos') || lowerText.includes('gracias')) {
      return `¡Perfecto ${state.employeeName}! Me alegra saber de ti. 

¿Te gustaría programar una llamada para hablar sobre la posición de ${state.jobTitle} en ${state.restaurantName}? 

¿Qué día y hora te funciona mejor?`;
    }
    
    return `Hola ${state.employeeName}, gracias por tu respuesta. 

¿Te interesa programar una llamada para hablar sobre la oportunidad en ${state.restaurantName}?`;
  }

  // Handle availability response
  async handleAvailabilityResponse(messageText, state) {
    const lowerText = messageText.toLowerCase();
    
    // Check for specific times/days
    if (lowerText.includes('lunes') || lowerText.includes('martes') || 
        lowerText.includes('miércoles') || lowerText.includes('jueves') || 
        lowerText.includes('viernes') || lowerText.includes('sábado') || 
        lowerText.includes('domingo')) {
      
      // Extract time if mentioned
      const timeMatch = messageText.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/i);
      
      if (timeMatch) {
        const time = timeMatch[0];
        state.scheduledCall = {
          day: this.extractDay(messageText),
          time: time,
          confirmed: false
        };
        
        return `¡Perfecto! Entiendo que prefieres ${state.scheduledCall.day} a las ${state.scheduledCall.time}.

¿Te parece bien si programamos la llamada para ese día y hora? Será una conversación de unos 15-20 minutos para conocernos mejor.`;
      } else {
        return `Entiendo que prefieres ${this.extractDay(messageText)}. 

¿A qué hora te funciona mejor? Por ejemplo: 10:00 AM, 2:00 PM, etc.`;
      }
    }
    
    // Check for general availability
    if (lowerText.includes('mañana') || lowerText.includes('tarde') || 
        lowerText.includes('noche') || lowerText.includes('fin de semana')) {
      
      return `Perfecto, entiendo tu disponibilidad. 

¿Podrías ser más específico? Por ejemplo: "Lunes por la mañana" o "Martes a las 2 PM"?`;
    }
    
    // Check for rejection
    if (lowerText.includes('no') || lowerText.includes('no puedo') || 
        lowerText.includes('no estoy interesado') || lowerText.includes('no gracias')) {
      
      return `Entiendo ${state.employeeName}. No hay problema.

Si cambias de opinión en el futuro, no dudes en contactarnos. 

¡Que tengas un buen día!`;
    }
    
    return `Gracias por tu respuesta. 

¿Podrías decirme qué día de la semana te funciona mejor? Por ejemplo: Lunes, Martes, etc.`;
  }

  // Handle alternative times response
  async handleAlternativeTimesResponse(messageText, state) {
    const lowerText = messageText.toLowerCase();
    
    if (lowerText.includes('sí') || lowerText.includes('perfecto') || 
        lowerText.includes('está bien') || lowerText.includes('ok')) {
      
      if (state.scheduledCall) {
        state.scheduledCall.confirmed = true;
        
        // Create actual scheduled call in database
        await this.createScheduledCall(state);
        
        return `¡Excelente! Hemos programado la llamada para ${state.scheduledCall.day} a las ${state.scheduledCall.time}.

Te enviaremos un recordatorio antes de la llamada. 

¡Nos vemos pronto! 😊`;
      }
    }
    
    if (lowerText.includes('no') || lowerText.includes('cambiar')) {
      return `No hay problema. 

¿Qué día y hora te funcionaría mejor? Puedo ofrecerte:
- Lunes a las 10:00 AM
- Martes a las 2:00 PM  
- Miércoles a las 4:00 PM

¿Cuál prefieres?`;
    }
    
    return `¿Te parece bien el horario que mencioné? Responde "sí" si está perfecto, o dime qué día y hora prefieres.`;
  }

  // Handle confirmation response
  async handleConfirmationResponse(messageText, state) {
    return `Perfecto ${state.employeeName}. 

La llamada está confirmada. Te contactaremos en el horario acordado.

¡Que tengas un excelente día! 👋`;
  }

  // Handle fallback response
  async handleFallbackResponse(messageText, state) {
    return `Entiendo ${state.employeeName}. 

Si en el futuro te interesa programar una llamada, no dudes en contactarnos.

¡Gracias por tu tiempo! 😊`;
  }

  // Send agent message
  async sendAgentMessage(conversationId, messageType, customText = null) {
    try {
      const state = this.conversationStates.get(conversationId);
      const agentData = this.activeConversations.get(conversationId);
      
      if (!state || !agentData) {
        console.log(`⚠️ No active agent data for conversation ${conversationId}`);
        return;
      }

      let messageText = customText;

      if (!messageText) {
        switch (messageType) {
          case 'greeting':
            messageText = `¡Hola ${state.employeeName}! 👋

Soy el asistente de ${state.restaurantName}. Hemos revisado tu aplicación para la posición de ${state.jobTitle} y nos gustaría conocerte mejor.

¿Te gustaría programar una llamada para hablar sobre la oportunidad?`;
            break;
          default:
            messageText = "Gracias por tu mensaje.";
        }
      }

      // Add agent signature
      messageText += `\n\n🤖 *Mensaje enviado por el asistente de ${state.restaurantName}*`;

      // Send message through existing chat system
      await createMessage({
        text: messageText,
        conversationId: parseInt(conversationId),
        senderUserId: agentData.restaurantUserId,
        receiverUserId: agentData.employeeId,
        senderType: 'restaurant',
        receiverType: 'employee'
      });

      console.log(`📤 Agent message sent to conversation ${conversationId}`);

    } catch (error) {
      console.error('❌ Error sending agent message:', error);
    }
  }

  // Create scheduled call in database
  async createScheduledCall(state) {
    try {
      // This would create a scheduled call record
      // For now, just log it
      console.log(`📅 Scheduled call created:`, state.scheduledCall);
      
      // TODO: Implement actual scheduled call creation
      // await prisma.scheduledCall.create({...});
      
    } catch (error) {
      console.error('❌ Error creating scheduled call:', error);
    }
  }

  // Extract day from text
  extractDay(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('lunes')) return 'Lunes';
    if (lowerText.includes('martes')) return 'Martes';
    if (lowerText.includes('miércoles')) return 'Miércoles';
    if (lowerText.includes('jueves')) return 'Jueves';
    if (lowerText.includes('viernes')) return 'Viernes';
    if (lowerText.includes('sábado')) return 'Sábado';
    if (lowerText.includes('domingo')) return 'Domingo';
    return 'el día que mencionaste';
  }

  // Get agent status
  getAgentStatus() {
    return {
      activeConversations: this.activeConversations.size,
      conversations: Array.from(this.activeConversations.keys())
    };
  }

  // Get conversation state
  getConversationState(conversationId) {
    return this.conversationStates.get(conversationId);
  }
}

// Create singleton instance
const conversationalAgent = new ConversationalAgent();

module.exports = conversationalAgent;
