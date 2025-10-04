const OpenAI = require('openai');
const EmbeddedMCPClient = require('../mcp/embeddedClient.js');
const ragService = require('./ragService.js');

/**
 * AI Job Creation Service with MCP Integration
 * Uses MCP to interact with the system instead of direct endpoint calls
 */
class AIJobCreationServiceMCP {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.defaultModel = "gpt-4";
    this.maxTokens = 2000;
    this.temperature = 0.7;
    this.ragService = ragService;
    this.maxRetries = 3;
    this.timeout = 30000;
    
    // Initialize MCP client
    this.mcpClient = new EmbeddedMCPClient();
    
    // Job creation system prompt
    this.systemPrompt = `Eres un asistente de IA especializado en crear ofertas de trabajo para restaurantes. Tu trabajo es analizar descripciones de trabajos en lenguaje natural y extraer información estructurada.

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

EJEMPLOS DE CONTRATOS VÁLIDOS:
- A Plazo, Indefinido, Honorarios, Práctica, Otros

EJEMPLOS DE PERÍODOS VÁLIDOS:
- Permanente, Reemplazo Temporal, Reemplazo Urgente, Sin información

Si el usuario proporciona información incompleta, haz preguntas específicas para completar los campos faltantes.

EJEMPLO DE RESPUESTA CUANDO FALTA INFORMACIÓN:
Usuario: "Necesito un chef"
Respuesta:
{
  "status": "incomplete",
  "message": "Perfecto, necesitas un chef. Para crear la oferta completa, necesito algunos detalles más: ¿Qué tipo de horario necesitas? (Full-time, Part-time), ¿Cuál es el salario que ofreces?, ¿Cuántos años de experiencia requiere el puesto?",
  "extractedData": {
    "position": "Chef",
    "schedule": "",
    "contract": "",
    "salary": 0,
    "propina": "Si",
    "vacancies": 1,
    "yearsOfExperience": 0,
    "period": "Sin información",
    "description": "",
    "requirements": "",
    "functions": "",
    "questions": []
  },
  "missingFields": ["schedule", "salary", "yearsOfExperience", "description", "requirements", "functions"],
  "suggestions": ["Considera incluir beneficios adicionales", "Especifica el tipo de cocina"]
}`;
  }

  /**
   * Process user message and create job offer if complete
   */
  async processMessage(userMessage, conversationHistory = [], restaurantContext = {}, ragContext = null) {
    try {
      console.log('🤖 [AI JOB CREATION MCP] Processing message:', userMessage);

      // Get AI response with enhanced context
      const aiResponse = await this.processWithTimeout(userMessage, conversationHistory, restaurantContext, ragContext);
      
      // If job data is complete, create the job using MCP
      if (aiResponse.status === 'complete' && aiResponse.extractedData) {
        try {
          console.log('🤖 [AI JOB CREATION MCP] Job data complete, creating job via MCP...');
          
          // Prepare job data for MCP
          const jobData = {
            ...aiResponse.extractedData,
            restaurantId: restaurantContext.id,
            restaurantUserId: restaurantContext.userId,
            locationId: restaurantContext.locationId || 1 // Default location
          };

          // Create job using MCP
          const jobResult = await this.mcpClient.createJobOffer(jobData);
          
          if (jobResult.success) {
            aiResponse.message = `¡Perfecto! He creado la oferta de trabajo para ${aiResponse.extractedData.position}. La oferta ha sido publicada exitosamente.`;
            aiResponse.jobCreated = true;
            aiResponse.jobId = jobResult.jobOffer.id;
          } else {
            aiResponse.message = 'Hubo un error al crear la oferta de trabajo. Por favor, intenta de nuevo.';
            aiResponse.status = 'error';
          }
        } catch (mcpError) {
          console.error('❌ [AI JOB CREATION MCP] MCP error:', mcpError);
          aiResponse.message = 'Hubo un error técnico al crear la oferta. Por favor, intenta de nuevo.';
          aiResponse.status = 'error';
        }
      }

      return aiResponse;

    } catch (error) {
      console.error('❌ [AI JOB CREATION MCP] Error processing message:', error);
      return {
        status: "error",
        message: "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
        extractedData: {},
        missingFields: [],
        suggestions: []
      };
    }
  }

  /**
   * Process with timeout and retry logic
   */
  async processWithTimeout(userMessage, conversationHistory, restaurantContext, ragContext) {
    const startTime = Date.now();
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (Date.now() - startTime > this.timeout) {
          throw new Error('Request timeout');
        }

        const result = await this.callOpenAI(userMessage, conversationHistory, restaurantContext, ragContext);
        return result;
      } catch (error) {
        console.error(`❌ [AI JOB CREATION MCP] Attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  /**
   * Call OpenAI API with enhanced context
   */
  async callOpenAI(userMessage, conversationHistory, restaurantContext, ragContext) {
    // Build conversation context
    const messages = [
      { role: "system", content: this.systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage }
    ];

    // Add restaurant context if available
    if (restaurantContext.name) {
      messages[0].content += `\n\nCONTEXTO DEL RESTAURANTE: ${restaurantContext.name}`;
    }

    // Add RAG context if available
    if (ragContext) {
      messages[0].content += `\n\nCONTEXTO RELEVANTE DE LA EMPRESA:\n${ragContext}`;
    }

    const completion = await this.openai.chat.completions.create({
      model: this.defaultModel,
      messages: messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature
    });

    const responseText = completion.choices[0].message.content;
    console.log('🤖 [AI JOB CREATION MCP] Raw AI response:', responseText);
    
    // Try to parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
      console.log('🤖 [AI JOB CREATION MCP] Parsed AI response:', parsedResponse);
    } catch (parseError) {
      console.error('❌ Error parsing AI response:', parseError);
      console.error('❌ Raw response that failed to parse:', responseText);
      return {
        status: "error",
        message: "Lo siento, hubo un error procesando tu solicitud. ¿Podrías intentar de nuevo?",
        extractedData: {},
        missingFields: [],
        suggestions: []
      };
    }

    // Validate and clean extracted data
    const cleanedData = this.cleanExtractedData(parsedResponse.extractedData || {});
    
    return {
      status: parsedResponse.status || "incomplete",
      message: parsedResponse.message || "Procesando tu solicitud...",
      extractedData: cleanedData,
      missingFields: parsedResponse.missingFields || [],
      suggestions: parsedResponse.suggestions || []
    };
  }

  /**
   * Clean and validate extracted data
   */
  cleanExtractedData(data) {
    const cleaned = {};
    
    // Clean string fields
    if (data.position) cleaned.position = data.position.trim();
    if (data.schedule) cleaned.schedule = data.schedule.trim();
    if (data.contract) cleaned.contract = data.contract.trim();
    if (data.propina) cleaned.propina = data.propina.trim();
    if (data.period) cleaned.period = data.period.trim();
    if (data.description) cleaned.description = data.description.trim();
    if (data.requirements) cleaned.requirements = data.requirements.trim();
    if (data.functions) cleaned.functions = data.functions.trim();
    
    // Clean numeric fields
    if (data.salary && !isNaN(data.salary)) cleaned.salary = parseInt(data.salary);
    if (data.vacancies && !isNaN(data.vacancies)) cleaned.vacancies = parseInt(data.vacancies);
    if (data.yearsOfExperience && !isNaN(data.yearsOfExperience)) {
      cleaned.yearsOfExperience = parseInt(data.yearsOfExperience);
    }
    
    // Clean questions array
    if (Array.isArray(data.questions)) {
      cleaned.questions = data.questions.filter(q => q && q.trim()).map(q => q.trim());
    }
    
    return cleaned;
  }

  /**
   * Validate job data completeness
   */
  validateJobData(data) {
    const requiredFields = ['position', 'schedule', 'contract', 'salary', 'description'];
    const missingFields = requiredFields.filter(field => !data[field] || data[field] === '');
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
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
}

module.exports = AIJobCreationServiceMCP;
