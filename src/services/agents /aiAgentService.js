const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');
const { sendMessageNotification } = require('../emailService');

const prisma = new PrismaClient();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * AI Agent Service for Gourmet Jobs Platform
 * Handles AI agent conversations, call scheduling, and intelligent responses
 */
class AiAgentService {
  constructor() {
    this.defaultModel = 'gpt-4';
    this.maxTokens = 500;
    this.temperature = 0.7;
  }

  /**
   * Process incoming message and generate AI response
   * @param {Object} messageData - Message data from chat
   * @returns {Object} AI response with intent and actions
   */
  async processMessage(messageData) {
    try {
      const { 
        text, 
        conversationId, 
        senderUserId, 
        receiverUserId, 
        senderType, 
        receiverType 
      } = messageData;

      // Check if this is an agent conversation
      const agentConversation = await this.getAgentConversation(conversationId);
      
      if (!agentConversation) {
        return { isAgentMessage: false };
      }

      // Get agent configuration
      const agent = await this.getAgentWithConfig(agentConversation.agentId);
      
      // Analyze message intent
      const intent = await this.analyzeIntent(text, agent);
      
      // Generate response based on intent
      const response = await this.generateResponse(text, intent, agent, agentConversation);
      
      // Handle specific actions (like scheduling calls)
      const actions = await this.handleActions(intent, response, agentConversation, messageData);
      
      return {
        isAgentMessage: true,
        response: response.text,
        intent: intent.name,
        confidence: intent.confidence,
        actions: actions,
        agentId: agent.id,
        agentName: agent.name
      };

    } catch (error) {
      console.error('❌ Error processing AI agent message:', error);
      return {
        isAgentMessage: true,
        response: "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
        intent: "error",
        confidence: 0,
        actions: []
      };
    }
  }

  /**
   * Analyze message intent using OpenAI
   */
  async analyzeIntent(text, agent) {
    try {
      const prompt = `
Analiza la intención del siguiente mensaje en el contexto de un agente de IA para restaurantes.
El agente puede: programar llamadas, responder preguntas, recopilar información.

Mensaje: "${text}"

Responde en formato JSON con:
{
  "intent": "schedule_call|question|greeting|goodbye|other",
  "confidence": 0.0-1.0,
  "entities": {
    "date": "fecha mencionada si existe",
    "time": "hora mencionada si existe", 
    "topic": "tema principal",
    "urgency": "low|medium|high"
  }
}`;

      const completion = await openai.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.3
      });

      const result = JSON.parse(completion.choices[0].message.content);
      return result;

    } catch (error) {
      console.error('❌ Error analyzing intent:', error);
      return {
        intent: "other",
        confidence: 0.5,
        entities: {}
      };
    }
  }

  /**
   * Generate AI response based on intent and context
   */
  async generateResponse(text, intent, agent, agentConversation) {
    try {
      const systemPrompt = this.buildSystemPrompt(agent, intent);
      
      // Get conversation history for context
      const conversationHistory = await this.getConversationHistory(agentConversation.id);
      
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: text }
      ];

      const completion = await openai.chat.completions.create({
        model: this.defaultModel,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      return {
        text: completion.choices[0].message.content,
        model: this.defaultModel,
        tokens: completion.usage.total_tokens
      };

    } catch (error) {
      console.error('❌ Error generating response:', error);
      return {
        text: "Disculpa, no pude procesar tu mensaje. ¿Podrías reformularlo?",
        model: this.defaultModel,
        tokens: 0
      };
    }
  }

  /**
   * Build system prompt based on agent configuration and intent
   */
  buildSystemPrompt(agent, intent) {
    const basePrompt = `
Eres ${agent.name}, un asistente de IA especializado en ayudar con operaciones de restaurantes.

Personalidad: ${agent.personality || 'Profesional, amigable y eficiente'}
Capacidades: ${agent.capabilities.join(', ')}

Contexto: Estás ayudando a un restaurante con sus operaciones diarias.
`;

    switch (intent.intent) {
      case 'schedule_call':
        return basePrompt + `
Tu tarea actual es ayudar a programar una llamada o reunión.
- Pregunta por la fecha y hora preferida
- Confirma los detalles de la reunión
- Ofrece opciones de horarios disponibles
- Sé flexible con los horarios
`;
      
      case 'question':
        return basePrompt + `
Responde preguntas sobre:
- Procesos del restaurante
- Políticas de trabajo
- Información general
- Horarios y disponibilidad
`;
      
      default:
        return basePrompt + `
Mantén la conversación natural y útil.
Si no estás seguro de algo, pregunta para aclarar.
`;
    }
  }

  /**
   * Handle specific actions based on intent
   */
  async handleActions(intent, response, agentConversation, messageData) {
    const actions = [];

    if (intent.intent === 'schedule_call') {
      // Extract scheduling information
      const scheduleInfo = await this.extractScheduleInfo(response.text, intent.entities);
      
      if (scheduleInfo.isComplete) {
        // Create scheduled call
        const scheduledCall = await this.createScheduledCall({
          agentId: agentConversation.agentId,
          restaurantId: agentConversation.conversation.restaurantUserId,
          employeeId: messageData.senderType === 'employee' ? messageData.senderUserId : null,
          restaurantUserId: messageData.senderType === 'restaurant' ? messageData.senderUserId : null,
          title: scheduleInfo.title || 'Llamada programada por agente',
          description: scheduleInfo.description,
          scheduledDate: scheduleInfo.date,
          duration: scheduleInfo.duration || 30
        });

        actions.push({
          type: 'call_scheduled',
          data: scheduledCall
        });
      }
    }

    return actions;
  }

  /**
   * Extract scheduling information from conversation
   */
  async extractScheduleInfo(responseText, entities) {
    // This would use NLP to extract date, time, duration, etc.
    // For now, return a basic structure
    return {
      isComplete: false, // Would be true when all required info is gathered
      title: entities.topic || 'Llamada de seguimiento',
      description: 'Llamada programada por el agente de IA',
      date: entities.date ? new Date(entities.date) : null,
      duration: 30
    };
  }

  /**
   * Create a scheduled call
   */
  async createScheduledCall(callData) {
    try {
      const scheduledCall = await prisma.scheduledCall.create({
        data: callData
      });

      // Send notification email
      await this.sendCallScheduledNotification(scheduledCall);

      return scheduledCall;
    } catch (error) {
      console.error('❌ Error creating scheduled call:', error);
      throw error;
    }
  }

  /**
   * Send notification when call is scheduled
   */
  async sendCallScheduledNotification(scheduledCall) {
    try {
      // Get participant details
      const participant = await this.getCallParticipant(scheduledCall);
      
      if (participant) {
        await sendMessageNotification({
          senderName: 'Agente de IA',
          senderEmail: 'noreply@gourmetjobs.cl',
          recipientName: participant.name,
          recipientEmail: participant.email,
          messagePreview: `Llamada programada para ${scheduledCall.scheduledDate.toLocaleDateString()}`,
          restaurantName: scheduledCall.restaurant.name,
          conversationId: scheduledCall.id
        });
      }
    } catch (error) {
      console.error('❌ Error sending call notification:', error);
    }
  }

  /**
   * Get agent conversation by conversation ID
   */
  async getAgentConversation(conversationId) {
    return await prisma.agentConversation.findFirst({
      where: { conversationId: conversationId },
      include: {
        agent: true,
        conversation: true
      }
    });
  }

  /**
   * Get agent with configuration
   */
  async getAgentWithConfig(agentId) {
    return await prisma.aiAgent.findUnique({
      where: { id: agentId },
      include: {
        agentConfigs: true,
        restaurant: true
      }
    });
  }

  /**
   * Get conversation history for context
   */
  async getConversationHistory(agentConversationId) {
    const messages = await prisma.agentMessage.findMany({
      where: { agentConversationId: agentConversationId },
      include: { message: true },
      orderBy: { createdAt: 'asc' },
      take: 10 // Last 10 messages for context
    });

    return messages.map(msg => ({
      role: msg.message.senderEmployeeId ? 'user' : 'assistant',
      content: msg.message.text
    }));
  }

  /**
   * Get call participant details
   */
  async getCallParticipant(scheduledCall) {
    if (scheduledCall.employeeId) {
      const employee = await prisma.employee.findUnique({
        where: { id: scheduledCall.employeeId },
        include: { user: true }
      });
      return {
        name: employee.user.name,
        email: employee.user.email
      };
    } else if (scheduledCall.restaurantUserId) {
      const restaurantUser = await prisma.restaurantUser.findUnique({
        where: { id: scheduledCall.restaurantUserId },
        include: { user: true }
      });
      return {
        name: restaurantUser.user.name,
        email: restaurantUser.user.email
      };
    }
    return null;
  }

  /**
   * Create a new AI agent
   */
  async createAgent(agentData) {
    try {
      const agent = await prisma.aiAgent.create({
        data: {
          name: agentData.name,
          description: agentData.description,
          avatar: agentData.avatar,
          personality: JSON.stringify(agentData.personality || {}),
          capabilities: agentData.capabilities || ['answer_questions'],
          restaurantId: agentData.restaurantId,
          createdByUserId: agentData.createdByUserId
        }
      });

      // Create default configuration
      await this.createDefaultConfig(agent.id);

      return agent;
    } catch (error) {
      console.error('❌ Error creating AI agent:', error);
      throw error;
    }
  }

  /**
   * Create default agent configuration
   */
  async createDefaultConfig(agentId) {
    const defaultConfigs = [
      { key: 'openai_model', value: this.defaultModel },
      { key: 'max_tokens', value: this.maxTokens.toString() },
      { key: 'temperature', value: this.temperature.toString() },
      { key: 'language', value: 'es' },
      { key: 'timezone', value: 'America/Santiago' }
    ];

    for (const config of defaultConfigs) {
      await prisma.agentConfig.create({
        data: {
          agentId: agentId,
          configKey: config.key,
          configValue: config.value,
          description: `Default ${config.key} configuration`
        }
      });
    }
  }
}

module.exports = new AiAgentService();
