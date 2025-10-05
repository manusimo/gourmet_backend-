const { prisma } = require('../../db.js');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Conversational AI Agent for Call Scheduling
 * This agent maintains context and can have natural conversations to schedule calls
 */
class ConversationalCallScheduler {
  constructor() {
    this.conversationContexts = new Map(); // Store conversation contexts
  }

  /**
   * Process a message from a candidate and generate AI response
   * @param {Object} params - Message processing parameters
   */
  async processMessage({
    conversationId,
    candidateMessage,
    candidateName,
    jobTitle,
    restaurantName,
    candidateEmail
  }) {
    try {
      console.log(`🤖 [AI AGENT] Processing message from ${candidateName} in conversation ${conversationId}`);

      // Get conversation history
      const conversationHistory = await this.getConversationHistory(conversationId);
      
      // Get or create conversation context
      let context = this.conversationContexts.get(conversationId) || {
        stage: 'greeting',
        candidatePreferences: {},
        proposedTimes: [],
        confirmedTime: null,
        attempts: 0
      };

      // Update context based on candidate message
      context = await this.updateContextFromMessage(context, candidateMessage, conversationHistory);
      
      // Generate AI response using OpenAI
      const aiResponse = await this.generateAIResponse({
        context,
        candidateMessage,
        candidateName,
        jobTitle,
        restaurantName,
        conversationHistory
      });

      // Update conversation context
      this.conversationContexts.set(conversationId, context);

      // Save AI response to database
      const savedMessage = await this.saveAIMessage(conversationId, aiResponse, candidateMessage);

      // Check if call is scheduled
      if (context.stage === 'scheduled') {
        await this.createScheduledCall(conversationId, context.confirmedTime, candidateName, candidateEmail);
      }

      return {
        success: true,
        aiResponse,
        context,
        messageId: savedMessage.id
      };

    } catch (error) {
      console.error('❌ [AI AGENT] Error processing message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get conversation history for context
   */
  async getConversationHistory(conversationId) {
    const messages = await prisma.message.findMany({
      where: { conversationId: parseInt(conversationId) },
      orderBy: { createdAt: 'asc' },
      take: 10 // Last 10 messages for context
    });

    return messages.map(msg => ({
      role: msg.senderEmployeeId ? 'candidate' : 'ai',
      content: msg.text,
      timestamp: msg.createdAt
    }));
  }

  /**
   * Update conversation context based on candidate message
   */
  async updateContextFromMessage(context, candidateMessage, conversationHistory) {
    const message = candidateMessage.toLowerCase();
    
    // Update context based on message content
    if (message.includes('sí') || message.includes('si') || message.includes('yes') || message.includes('ok')) {
      if (context.stage === 'greeting') {
        context.stage = 'scheduling';
      } else if (context.stage === 'confirming') {
        context.stage = 'scheduled';
      }
    }

    if (message.includes('no') || message.includes('no puedo') || message.includes('no disponible')) {
      context.attempts += 1;
      if (context.attempts >= 3) {
        context.stage = 'declined';
      }
    }

    // Extract time preferences
    const timePatterns = [
      /(\d{1,2}):(\d{2})/g, // HH:MM format
      /mañana|morning/i,
      /tarde|afternoon/i,
      /noche|evening/i,
      /lunes|monday/i,
      /martes|tuesday/i,
      /miércoles|wednesday/i,
      /jueves|thursday/i,
      /viernes|friday/i
    ];

    timePatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        context.candidatePreferences.mentionedTimes = matches;
      }
    });

    return context;
  }

  /**
   * Generate AI response using OpenAI
   */
  async generateAIResponse({ context, candidateMessage, candidateName, jobTitle, restaurantName, conversationHistory }) {
    try {
      // Build conversation history for OpenAI
      const messages = [
        {
          role: 'system',
          content: `Eres un asistente de IA profesional y amigable que trabaja para ${restaurantName}. Tu trabajo es programar llamadas de entrevista con candidatos para el puesto de ${jobTitle}.

INSTRUCCIONES:
1. Sé profesional pero amigable y conversacional
2. Mantén el contexto de la conversación
3. Tu objetivo es programar una llamada telefónica o videollamada
4. Ofrece horarios flexibles (mañana, tarde, noche)
5. Si el candidato no puede, ofrece alternativas
6. Una vez que confirmes un horario, confirma los detalles
7. Si después de 3 intentos no se puede programar, respeta su decisión

ETAPAS DE LA CONVERSACIÓN:
- greeting: Saludo inicial y presentación
- scheduling: Proponer horarios y recopilar preferencias
- confirming: Confirmar horario específico
- scheduled: Llamada programada exitosamente
- declined: Candidato no puede o no quiere programar

CONTEXTO ACTUAL:
- Etapa: ${context.stage}
- Intentos: ${context.attempts}
- Preferencias mencionadas: ${context.candidatePreferences.mentionedTimes || 'ninguna'}

Responde en español de manera natural y conversacional.`
        }
      ];

      // Add conversation history
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'candidate' ? 'user' : 'assistant',
          content: msg.content
        });
      });

      // Add current message
      messages.push({
        role: 'user',
        content: candidateMessage
      });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: messages,
        max_tokens: 300,
        temperature: 0.7
      });

      return completion.choices[0].message.content;

    } catch (error) {
      console.error('❌ [AI AGENT] OpenAI error:', error);
      
      // Fallback response based on context
      return this.getFallbackResponse(context, candidateMessage);
    }
  }

  /**
   * Fallback response when OpenAI fails
   */
  getFallbackResponse(context, candidateMessage) {
    const message = candidateMessage.toLowerCase();
    
    if (context.stage === 'greeting') {
      return `¡Hola! Soy un asistente de IA de la empresa. Hemos revisado tu postulación y nos gustaría programar una llamada contigo. ¿Te gustaría que coordinemos una llamada telefónica o videollamada?`;
    }
    
    if (message.includes('sí') || message.includes('si') || message.includes('yes')) {
      return `¡Perfecto! ¿Qué horario te conviene mejor? Podemos programar para mañana, tarde o noche. ¿Tienes alguna preferencia de día?`;
    }
    
    if (message.includes('no') || message.includes('no puedo')) {
      return `Entiendo. ¿Hay algún otro horario que te funcione mejor? Podemos ser flexibles con los horarios.`;
    }
    
    return `Gracias por tu respuesta. ¿Te gustaría que programemos una llamada para conocerte mejor?`;
  }

  /**
   * Save AI message to database
   */
  async saveAIMessage(conversationId, aiResponse, candidateMessage) {
    // Get conversation details
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(conversationId) },
      include: { restaurant: true }
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Save AI response
    const message = await prisma.message.create({
      data: {
        text: aiResponse,
        conversationId: parseInt(conversationId),
        senderRestaurantUserId: conversation.restaurantUserId,
        receiverEmployeeId: conversation.employeeId,
        senderType: 'restaurant',
        receiverType: 'employee',
        isAIGenerated: true
      }
    });

    return message;
  }

  /**
   * Create scheduled call record
   */
  async createScheduledCall(conversationId, confirmedTime, candidateName, candidateEmail) {
    try {
      console.log(`📅 [AI AGENT] Creating scheduled call for ${candidateName} at ${confirmedTime}`);
      
      // Get conversation details
      const conversation = await prisma.conversation.findUnique({
        where: { id: parseInt(conversationId) },
        include: { 
          restaurant: true,
          employee: true
        }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Create scheduled call record using existing ScheduledCall model
      const scheduledCall = await prisma.scheduledCall.create({
        data: {
          agentId: 1, // Default AI agent ID (you might want to create a specific AI agent)
          restaurantId: conversation.restaurantId,
          employeeId: conversation.employeeId,
          title: `Entrevista con ${candidateName}`,
          description: `Llamada de entrevista programada por agente de IA`,
          scheduledDate: new Date(confirmedTime),
          duration: 30, // 30 minutes default
          status: 'scheduled',
          notes: `Programado automáticamente por agente de IA conversacional`
        }
      });

      console.log(`✅ [AI AGENT] Call scheduled successfully: ${scheduledCall.id}`);
      return scheduledCall;

    } catch (error) {
      console.error('❌ [AI AGENT] Error creating scheduled call:', error);
      // Don't throw error - call scheduling shouldn't break the conversation
    }
  }

  /**
   * Start a new AI conversation with a candidate
   */
  async startConversation({ candidateName, candidateEmail, jobTitle, restaurantName, conversationId }) {
    try {
      console.log(`🤖 [AI AGENT] Starting conversation with ${candidateName}`);
      
      // Initialize context
      const context = {
        stage: 'greeting',
        candidatePreferences: {},
        proposedTimes: [],
        confirmedTime: null,
        attempts: 0
      };
      
      this.conversationContexts.set(conversationId, context);

      // Generate initial greeting
      const initialMessage = `¡Hola ${candidateName}! 👋

Soy un asistente de IA de ${restaurantName}. Hemos revisado tu postulación para el puesto de ${jobTitle} y nos gustaría programar una llamada contigo para conocerte mejor.

¿Te gustaría que coordinemos una llamada telefónica o videollamada? Puedes elegir el día y hora que mejor te convenga.`;

      // Save initial message
      const message = await this.saveAIMessage(conversationId, initialMessage, null);

      return {
        success: true,
        initialMessage,
        messageId: message.id,
        context
      };

    } catch (error) {
      console.error('❌ [AI AGENT] Error starting conversation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new ConversationalCallScheduler();
