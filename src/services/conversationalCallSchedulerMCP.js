const OpenAI = require('openai');
const EmbeddedMCPClient = require('../mcp/embeddedClient.js');
const { prisma } = require('../db.js');

/**
 * Conversational Call Scheduler with MCP Integration
 * Uses MCP to interact with the system instead of direct database calls
 */
class ConversationalCallSchedulerMCP {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.defaultModel = "gpt-4";
    this.maxTokens = 500;
    this.temperature = 0.7;
    this.conversationContexts = new Map(); // Store conversation contexts
    
    // Initialize MCP client
    this.mcpClient = new EmbeddedMCPClient();
  }

  /**
   * Process a message from a candidate and generate AI response
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
      console.log(`🤖 [AI AGENT MCP] Processing message from ${candidateName} in conversation ${conversationId}`);

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
        await this.createScheduledCallViaMCP(conversationId, context.confirmedTime, candidateName, candidateEmail);
      }

      return {
        success: true,
        aiResponse,
        context,
        messageId: savedMessage.id
      };

    } catch (error) {
      console.error('❌ [AI AGENT MCP] Error processing message:', error);
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
      role: msg.senderType === 'employee' ? 'user' : 'assistant',
      content: msg.text
    }));
  }

  /**
   * Update conversation context based on message
   */
  async updateContextFromMessage(context, candidateMessage, conversationHistory) {
    const message = candidateMessage.toLowerCase();
    
    // Update context based on message content
    if (context.stage === 'greeting') {
      if (message.includes('sí') || message.includes('si') || message.includes('yes') || message.includes('ok')) {
        context.stage = 'scheduling';
        context.attempts++;
      } else if (message.includes('no') || message.includes('no puedo')) {
        context.stage = 'declined';
      }
    } else if (context.stage === 'scheduling') {
      // Extract time preferences
      if (message.includes('mañana') || message.includes('morning')) {
        context.candidatePreferences.timeOfDay = 'morning';
      } else if (message.includes('tarde') || message.includes('afternoon')) {
        context.candidatePreferences.timeOfDay = 'afternoon';
      } else if (message.includes('noche') || message.includes('evening')) {
        context.candidatePreferences.timeOfDay = 'evening';
      }
      
      // Extract day preferences
      if (message.includes('lunes') || message.includes('monday')) {
        context.candidatePreferences.day = 'monday';
      } else if (message.includes('martes') || message.includes('tuesday')) {
        context.candidatePreferences.day = 'tuesday';
      } else if (message.includes('miércoles') || message.includes('wednesday')) {
        context.candidatePreferences.day = 'wednesday';
      } else if (message.includes('jueves') || message.includes('thursday')) {
        context.candidatePreferences.day = 'thursday';
      } else if (message.includes('viernes') || message.includes('friday')) {
        context.candidatePreferences.day = 'friday';
      }
      
      // Check if we have enough info to schedule
      if (context.candidatePreferences.timeOfDay && context.candidatePreferences.day) {
        context.stage = 'confirming';
        context.confirmedTime = this.generateTimeSlot(context.candidatePreferences);
      }
    } else if (context.stage === 'confirming') {
      if (message.includes('sí') || message.includes('si') || message.includes('yes') || message.includes('perfecto')) {
        context.stage = 'scheduled';
      } else if (message.includes('no') || message.includes('otro')) {
        context.stage = 'scheduling';
        context.candidatePreferences = {};
      }
    }
    
    return context;
  }

  /**
   * Generate AI response based on context
   */
  async generateAIResponse({ context, candidateMessage, candidateName, jobTitle, restaurantName, conversationHistory }) {
    const systemPrompt = `Eres un asistente de IA especializado en programar llamadas de entrevista para restaurantes. Tu objetivo es coordinar una llamada entre ${candidateName} y ${restaurantName} para el puesto de ${jobTitle}.

INSTRUCCIONES:
1. Mantén un tono profesional pero amigable
2. Sé claro y directo sobre el propósito de la llamada
3. Ofrece opciones de horarios flexibles
4. Confirma los detalles antes de programar
5. Si el candidato no puede, ofrece alternativas

CONTEXTO ACTUAL:
- Etapa: ${context.stage}
- Preferencias del candidato: ${JSON.stringify(context.candidatePreferences)}
- Intentos: ${context.attempts}

Responde de manera natural y conversacional.`;

    try {
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: candidateMessage }
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      return completion.choices[0].message.content;

    } catch (error) {
      console.error('❌ [AI AGENT MCP] OpenAI error:', error);
      
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
      return `¡Hola! Soy un asistente de IA de ${context.restaurantName || 'la empresa'}. Hemos revisado tu postulación y nos gustaría programar una llamada contigo. ¿Te gustaría que coordinemos una llamada telefónica o videollamada?`;
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
   * Create scheduled call using MCP
   */
  async createScheduledCallViaMCP(conversationId, confirmedTime, candidateName, candidateEmail) {
    try {
      console.log(`📅 [AI AGENT MCP] Creating scheduled call for ${candidateName} at ${confirmedTime}`);
      
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

      // Create scheduled call using MCP
      const callData = {
        restaurantId: conversation.restaurantId,
        employeeId: conversation.employeeId,
        title: `Entrevista con ${candidateName}`,
        description: `Llamada de entrevista programada por agente de IA`,
        scheduledDate: new Date(confirmedTime).toISOString(),
        duration: 30,
        notes: `Programado automáticamente por agente de IA conversacional`
      };

      const result = await this.mcpClient.scheduleInterviewCall(callData);
      
      if (result.success) {
        console.log(`✅ [AI AGENT MCP] Call scheduled successfully: ${result.scheduledCall.id}`);
      } else {
        console.error('❌ [AI AGENT MCP] Failed to schedule call via MCP');
      }

      return result;

    } catch (error) {
      console.error('❌ [AI AGENT MCP] Error creating scheduled call:', error);
      throw error;
    }
  }

  /**
   * Generate time slot based on preferences
   */
  generateTimeSlot(preferences) {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Set time based on preference
    let hour = 10; // Default morning
    if (preferences.timeOfDay === 'afternoon') hour = 14;
    if (preferences.timeOfDay === 'evening') hour = 18;
    
    // Set day based on preference
    const dayMap = {
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5
    };
    
    const targetDay = dayMap[preferences.day] || tomorrow.getDay();
    const daysUntilTarget = (targetDay - tomorrow.getDay() + 7) % 7;
    const targetDate = new Date(tomorrow.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);
    
    targetDate.setHours(hour, 0, 0, 0);
    
    return targetDate.toISOString();
  }

  /**
   * Start conversation with candidate
   */
  async startConversation({ candidateName, candidateEmail, jobTitle, restaurantName, conversationId }) {
    try {
      console.log(`🤖 [AI AGENT MCP] Starting conversation with ${candidateName}`);
      
      const initialMessage = `¡Hola ${candidateName}! Soy un asistente de IA de ${restaurantName}. Hemos revisado tu postulación para el puesto de ${jobTitle} y nos gustaría programar una llamada contigo para conocerte mejor. ¿Te gustaría que coordinemos una llamada telefónica o videollamada?`;
      
      // Save initial message
      const savedMessage = await this.saveAIMessage(conversationId, initialMessage, '');
      
      // Initialize context
      this.conversationContexts.set(conversationId, {
        stage: 'greeting',
        candidatePreferences: {},
        proposedTimes: [],
        confirmedTime: null,
        attempts: 0
      });

      return {
        success: true,
        messageId: savedMessage.id,
        initialMessage
      };

    } catch (error) {
      console.error('❌ [AI AGENT MCP] Error starting conversation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initialize MCP connection
   */
  async initialize() {
    try {
      await this.mcpClient.connect();
      console.log('✅ [CONVERSATIONAL CALL SCHEDULER MCP] MCP client initialized');
    } catch (error) {
      console.error('❌ [CONVERSATIONAL CALL SCHEDULER MCP] Failed to initialize MCP client:', error);
      throw error;
    }
  }

  /**
   * Cleanup MCP connection
   */
  async cleanup() {
    try {
      await this.mcpClient.disconnect();
      console.log('✅ [CONVERSATIONAL CALL SCHEDULER MCP] MCP client disconnected');
    } catch (error) {
      console.error('❌ [CONVERSATIONAL CALL SCHEDULER MCP] Error disconnecting MCP client:', error);
    }
  }
}

module.exports = ConversationalCallSchedulerMCP;
