const OpenAI = require('openai');
const EmbeddedMCPClient = require('../../mcp/embeddedClient.js');
const ragService = require('../ragService.js');

/**
 * AI Job Creation Service with MCP Integration
 * Clean, organized service for handling job creation requests
 */
class AIJobCreationServiceMCP {
  constructor() {
    this.initializeOpenAI();
    this.initializeMCPClient();
    this.setupConfiguration();
    this.systemPrompt = this.buildSystemPrompt();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initializeOpenAI() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  initializeMCPClient() {
    this.mcpClient = new EmbeddedMCPClient();
  }

  setupConfiguration() {
    this.config = {
      model: "gpt-4",
      maxTokens: 2000,
      temperature: 0.7,
      maxRetries: 3,
      timeout: 30000
    };
  }

  buildSystemPrompt() {
    return `Eres un asistente de IA especializado en crear ofertas de trabajo para restaurantes.

INSTRUCCIONES:
1. Analiza la descripción del trabajo proporcionada por el usuario
2. Extrae la información relevante y organízala en campos estructurados
3. Si falta información importante, haz preguntas específicas al usuario
4. Mantén un tono profesional y amigable
5. Siempre confirma los detalles antes de proceder
6. IMPORTANTE: Si falta información crítica (como posición, horario, salario), pregunta específicamente por ella
7. Usa el status "incomplete" cuando necesites más información del usuario

CAMPOS DISPONIBLES:
- position: Posición del trabajo (Garzón, Chef, Bartender, etc.)
- schedule: Horario (Full-time, Part-time, Otro)
- contract: Tipo de contrato (A Plazo, Indefinido, Honorarios, Práctica, Otros)
- salary: Salario (número)
- propina: Si incluye propinas (Si/No)
- vacancies: Número de vacantes
- yearsOfExperience: Años de experiencia requeridos (0-5+)
- period: Período (Permanente, Reemplazo Temporal, Reemplazo Urgente, Sin información)
- description: Descripción del trabajo
- requirements: Requisitos específicos
- functions: Funciones principales
- questions: Preguntas para la entrevista (array de strings)

RESPUESTA ESPERADA:
Siempre responde en formato JSON con esta estructura:
{
  "status": "complete|incomplete|question",
  "message": "Mensaje para el usuario",
  "extractedData": {
    "position": "string",
    "schedule": "string", 
    "contract": "string",
    "salary": number,
    "propina": "Si|No",
    "vacancies": number,
    "yearsOfExperience": number,
    "period": "string",
    "description": "string",
    "requirements": "string",
    "functions": "string",
    "questions": ["string"]
  },
  "missingFields": ["field1", "field2"],
  "suggestions": ["sugerencia1", "sugerencia2"]
}

EJEMPLOS DE POSICIONES VÁLIDAS:
- Garzón, Runner, Chef, Ayudante de Cocina, Anfitrión, Delivery, Cajero, Copero, Barista, Bartender, Sommelier, Maitre, Jefe de salón, Limpieza

EJEMPLOS DE HORARIOS VÁLIDOS:
- Full-time, Part-time, Otro

EJEMPLOS DE CONTRATOS VÁLIDAS:
- A Plazo, Indefinido, Honorarios, Práctica, Otros

EJEMPLOS DE PERÍODOS VÁLIDOS:
- Permanente, Reemplazo Temporal, Reemplazo Urgente, Sin información

Si el usuario proporciona información incompleta, haz preguntas específicas para completar los campos faltantes.`;
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * Process job creation request from route handler
   */
  async processJobCreationRequest(requestBody, restaurantUserId) {
    try {
      const { message, conversationHistory = [], restaurantId, locationId } = requestBody;

      // Validate input
      const validation = this.validateRequestInput(message, restaurantId);
      if (!validation.isValid) {
        return this.createErrorResponse(validation.error, validation.statusCode);
      }

      // Get restaurant context
      const restaurant = await this.getRestaurantContext(restaurantId);
      if (!restaurant) {
        return this.createErrorResponse('Restaurant not found', 404);
      }

      // Build context and process
      const restaurantContext = this.buildRestaurantContext(restaurant, restaurantUserId, locationId);
      const result = await this.processMessage(message.trim(), conversationHistory, restaurantContext);

      return { success: true, data: result };

    } catch (error) {
      console.error('❌ [AI JOB CREATION] Error:', error);
      return this.createErrorResponse('Failed to process job creation request', 500);
    }
  }

  /**
   * Validate job data request from route handler
   */
  async validateJobDataRequest(requestBody) {
    try {
      const { extractedData } = requestBody;

      if (!extractedData) {
        return this.createErrorResponse('Job data is required', 400);
      }

      const validation = this.validateJobData(extractedData);
      return { success: true, validation };

    } catch (error) {
      console.error('❌ [AI JOB CREATION] Validation error:', error);
      return this.createErrorResponse('Failed to validate job data', 500);
    }
  }

  /**
   * Initialize MCP connection
   */
  async initialize() {
    try {
      await this.mcpClient.connect();
      console.log('✅ [AI JOB CREATION MCP] MCP client initialized');
    } catch (error) {
      console.error('❌ [AI JOB CREATION MCP] Failed to initialize MCP client:', error);
      throw error;
    }
  }

  /**
   * Cleanup MCP connection
   */
  async cleanup() {
    try {
      await this.mcpClient.disconnect();
      console.log('✅ [AI JOB CREATION MCP] MCP client disconnected');
    } catch (error) {
      console.error('❌ [AI JOB CREATION MCP] Error disconnecting MCP client:', error);
    }
  }

  // ============================================================================
  // CORE PROCESSING METHODS
  // ============================================================================

  /**
   * Process user message and create job offer if complete
   */
  async processMessage(userMessage, conversationHistory = [], restaurantContext = {}) {
    try {
      console.log('🤖 [AI JOB CREATION MCP] Processing message:', userMessage);

      // Get AI response
      const aiResponse = await this.getAIResponse(userMessage, conversationHistory, restaurantContext);
      
      // If complete, create job via MCP
      if (aiResponse.status === 'complete' && aiResponse.extractedData) {
        return await this.createJobIfComplete(aiResponse, restaurantContext);
      }

      return aiResponse;

    } catch (error) {
      console.error('❌ [AI JOB CREATION MCP] Error processing message:', error);
      return this.createErrorAIResponse();
    }
  }

  /**
   * Get AI response with retry logic
   */
  async getAIResponse(userMessage, conversationHistory, restaurantContext) {
    const startTime = Date.now();
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (Date.now() - startTime > this.config.timeout) {
          throw new Error('Request timeout');
        }

        return await this.callOpenAI(userMessage, conversationHistory, restaurantContext);
      } catch (error) {
        console.error(`❌ [AI JOB CREATION MCP] Attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.config.maxRetries) {
          throw error;
        }
        
        await this.delay(1000 * attempt);
      }
    }
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(userMessage, conversationHistory, restaurantContext) {
    const messages = this.buildMessages(userMessage, conversationHistory, restaurantContext);

    const completion = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature
    });

    const responseText = completion.choices[0].message.content;
    return this.parseAIResponse(responseText);
  }

  /**
   * Create job if data is complete
   */
  async createJobIfComplete(aiResponse, restaurantContext) {
    try {
      console.log('🤖 [AI JOB CREATION MCP] Job data complete, creating job via MCP...');
      
      const jobData = this.prepareJobData(aiResponse.extractedData, restaurantContext);
      const jobResult = await this.mcpClient.createJobOffer(jobData);
      
      if (jobResult.success) {
        aiResponse.message = `¡Perfecto! He creado la oferta de trabajo para ${aiResponse.extractedData.position}. La oferta ha sido publicada exitosamente.`;
        aiResponse.jobCreated = true;
        aiResponse.jobId = jobResult.jobOffer.id;
      } else {
        aiResponse.message = 'Hubo un error al crear la oferta de trabajo. Por favor, intenta de nuevo.';
        aiResponse.status = 'error';
      }

      return aiResponse;

    } catch (mcpError) {
      console.error('❌ [AI JOB CREATION MCP] MCP error:', mcpError);
      aiResponse.message = 'Hubo un error técnico al crear la oferta. Por favor, intenta de nuevo.';
      aiResponse.status = 'error';
      return aiResponse;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  validateRequestInput(message, restaurantId) {
    if (!message?.trim()) {
      return { isValid: false, error: 'Message is required', statusCode: 400 };
    }
    if (!restaurantId) {
      return { isValid: false, error: 'Restaurant ID is required', statusCode: 400 };
    }
    return { isValid: true };
  }

  async getRestaurantContext(restaurantId) {
    const { prisma } = require('../../db.js');
    return await prisma.restaurant.findUnique({
      where: { id: parseInt(restaurantId) },
      include: { user: true }
    });
  }

  buildRestaurantContext(restaurant, restaurantUserId, locationId) {
    return {
      id: restaurant.id,
      name: restaurant.name,
      userId: restaurantUserId,
      locationId: locationId || 1
    };
  }

  buildMessages(userMessage, conversationHistory, restaurantContext) {
    const messages = [
      { role: "system", content: this.systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage }
    ];

    // Add restaurant context
    if (restaurantContext.name) {
      messages[0].content += `\n\nCONTEXTO DEL RESTAURANTE: ${restaurantContext.name}`;
    }

    return messages;
  }

  parseAIResponse(responseText) {
    try {
      const parsedResponse = JSON.parse(responseText);
      const cleanedData = this.cleanExtractedData(parsedResponse.extractedData || {});
      
      return {
        status: parsedResponse.status || "incomplete",
        message: parsedResponse.message || "Procesando tu solicitud...",
        extractedData: cleanedData,
        missingFields: parsedResponse.missingFields || [],
        suggestions: parsedResponse.suggestions || []
      };
    } catch (parseError) {
      console.error('❌ Error parsing AI response:', parseError);
      return this.createErrorAIResponse();
    }
  }

  prepareJobData(extractedData, restaurantContext) {
    return {
      ...extractedData,
      restaurantId: restaurantContext.id,
      restaurantUserId: restaurantContext.userId,
      locationId: restaurantContext.locationId || 1
    };
  }

  cleanExtractedData(data) {
    const cleaned = {};
    
    // Clean string fields
    const stringFields = ['position', 'schedule', 'contract', 'propina', 'period', 'description', 'requirements', 'functions'];
    stringFields.forEach(field => {
      if (data[field]) cleaned[field] = data[field].trim();
    });
    
    // Clean numeric fields
    const numericFields = ['salary', 'vacancies', 'yearsOfExperience'];
    numericFields.forEach(field => {
      if (data[field] && !isNaN(data[field])) {
        cleaned[field] = parseInt(data[field]);
      }
    });
    
    // Clean questions array
    if (Array.isArray(data.questions)) {
      cleaned.questions = data.questions.filter(q => q && q.trim()).map(q => q.trim());
    }
    
    return cleaned;
  }

  validateJobData(data) {
    const requiredFields = ['position', 'schedule', 'contract', 'salary', 'description'];
    const missingFields = requiredFields.filter(field => !data[field] || data[field] === '');
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }

  createErrorResponse(message, statusCode) {
    return {
      success: false,
      error: message,
      statusCode
    };
  }

  createErrorAIResponse() {
    return {
      status: "error",
      message: "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
      extractedData: {},
      missingFields: [],
      suggestions: []
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AIJobCreationServiceMCP;