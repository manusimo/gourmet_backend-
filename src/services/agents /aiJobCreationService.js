const OpenAI = require('openai');
const ragService = require('../ragService.js');

/**
 * Enterprise-Grade AI Job Creation Service
 * Provides reliable, context-aware job creation with RAG integration
 */
class AIJobCreationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.defaultModel = "gpt-4";
    this.maxTokens = 2000;
    this.temperature = 0.7;
    this.ragService = ragService;
    this.maxRetries = 3;
    this.timeout = 30000; // 30 seconds
    
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
   * Process natural language job description and extract structured data
   * @param {string} userMessage - User's job description in natural language
   * @param {Object} conversationHistory - Previous conversation context
   * @param {Object} restaurantContext - Restaurant information
   * @returns {Object} AI response with extracted job data
   */
  async processJobDescription(userMessage, conversationHistory = [], restaurantContext = {}) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    try {
      console.log(`🚀 [AI JOB CREATION] Request ${requestId} started`);
      
      // Validate input
      if (!userMessage || userMessage.trim().length < 3) {
        throw new Error('Invalid input: Message too short');
      }

      // Get context with fallback
      let ragContext = '';
      try {
        const contextResult = await this.ragService.getContextForAgent(
          `restaurant job creation ${userMessage}`,
          'job_creation'
        );
        ragContext = contextResult.context || '';
        console.log(`📚 [AI JOB CREATION] Retrieved RAG context: ${ragContext.length} chars`);
      } catch (ragError) {
        console.warn('⚠️ [AI JOB CREATION] RAG context failed, continuing without context:', ragError.message);
        // Continue without RAG context - graceful degradation
      }

      // Process with retry logic
      const result = await this.processWithRetry(userMessage, conversationHistory, restaurantContext, ragContext);
      
      const duration = Date.now() - startTime;
      console.log(`✅ [AI JOB CREATION] Request ${requestId} completed in ${duration}ms`);
      
      // Log performance metrics
      this.logMetrics({
        requestId,
        duration,
        success: true,
        userMessageLength: userMessage.length,
        hasRAGContext: !!ragContext
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [AI JOB CREATION] Request ${requestId} failed after ${duration}ms:`, error.message);
      
      this.logMetrics({
        requestId,
        duration,
        success: false,
        error: error.message
      });
      
      return {
        status: "error",
        message: "Lo siento, hubo un error procesando tu solicitud. Por favor intenta de nuevo.",
        extractedData: {},
        missingFields: [],
        suggestions: []
      };
    }
  }

  /**
   * Process with retry logic and timeout protection
   */
  async processWithRetry(userMessage, conversationHistory, restaurantContext, ragContext) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.processWithTimeout(userMessage, conversationHistory, restaurantContext, ragContext);
      } catch (error) {
        console.warn(`❌ [AI JOB CREATION] Attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  /**
   * Process with timeout protection
   */
  async processWithTimeout(userMessage, conversationHistory, restaurantContext, ragContext) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, this.timeout);

      try {
        const result = await this.callOpenAI(userMessage, conversationHistory, restaurantContext, ragContext);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Call OpenAI API with enhanced context
   */
  async callOpenAI(userMessage, conversationHistory, restaurantContext, ragContext) {
    try {
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
      console.log('🤖 [AI JOB CREATION] Raw AI response:', responseText);
      
      // Try to parse JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
        console.log('🤖 [AI JOB CREATION] Parsed AI response:', parsedResponse);
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
        status: parsedResponse.status || "complete",
        message: parsedResponse.message || "Información procesada correctamente",
        extractedData: cleanedData,
        missingFields: parsedResponse.missingFields || [],
        suggestions: parsedResponse.suggestions || [],
        tokens: completion.usage.total_tokens
      };

    } catch (error) {
      console.error('❌ Error in AI job creation service:', error);
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
   * Clean and validate extracted data
   * @param {Object} data - Raw extracted data
   * @returns {Object} Cleaned and validated data
   */
  cleanExtractedData(data) {
    const cleaned = {};

    // Clean position
    if (data.position) {
      const validPositions = [
        "Chef Ejecutivo", "Sous Chef", "Jefe de Cocina", "Maestro de Cocina", "Maestro Pastelero", 
        "Pastelero", "Panadero", "Repostero", "Charcutero", "Pizzero", "Itamae", "Sushiman", 
        "Ayudante de Sushi", "Parrillero", "Cocinero Frío", "Cocinero Caliente", "Manipulador de Alimentos", 
        "Encargado de Producción", "Operador de Cocina", "Operador de Planta", "Operador Multifuncional", 
        "Encargado de Reservas", "Recepcionista de Restaurante", "Supervisor de Salón", "Personal de Banquetería", 
        "Encargado de Bodega", "Repositor", "Personal de Mantenimiento", "Jefe de Local", "Administrador de Local", 
        "Jefe de Sucursales", "Administrador de Restaurante", "Encargado de Compras", "Control de Calidad", 
        "Catador de Vinos", "Coordinador de Banquetes", "Montajista", "Mixólogo"
      ];
      cleaned.position = validPositions.includes(data.position) ? data.position : "";
    }

    // Clean schedule
    if (data.schedule) {
      const validSchedules = ["Full-time", "Part-time", "Otro"];
      cleaned.schedule = validSchedules.includes(data.schedule) ? data.schedule : "";
    }

    // Clean contract
    if (data.contract) {
      const validContracts = ["A Plazo", "Indefinido", "Honorarios", "Práctica", "Otros"];
      cleaned.contract = validContracts.includes(data.contract) ? data.contract : "";
    }

    // Clean salary (ensure it's a number)
    if (data.salary) {
      const salaryNum = parseInt(data.salary.toString().replace(/[^\d]/g, ''), 10);
      cleaned.salary = isNaN(salaryNum) ? 0 : salaryNum;
    }

    // Clean propina
    if (data.propina) {
      cleaned.propina = data.propina.toLowerCase() === 'si' ? 'Si' : 'No';
    }

    // Clean vacancies
    if (data.vacancies) {
      const vacanciesNum = parseInt(data.vacancies.toString(), 10);
      cleaned.vacancies = isNaN(vacanciesNum) ? 1 : vacanciesNum;
    }

    // Clean years of experience
    if (data.yearsOfExperience !== undefined) {
      const expNum = parseInt(data.yearsOfExperience.toString(), 10);
      cleaned.yearsOfExperience = isNaN(expNum) ? 0 : expNum;
    }

    // Clean period
    if (data.period) {
      const validPeriods = ["Permanente", "Reemplazo Temporal", "Reemplazo Urgente", "Sin información"];
      cleaned.period = validPeriods.includes(data.period) ? data.period : "Sin información";
    }

    // Clean text fields
    cleaned.description = data.description || "";
    cleaned.requirements = data.requirements || "";
    cleaned.functions = data.functions || "";

    // Clean questions array
    if (Array.isArray(data.questions)) {
      cleaned.questions = data.questions.filter(q => q && q.trim().length > 0);
    } else {
      cleaned.questions = [];
    }

    return cleaned;
  }

  /**
   * Generate follow-up questions for missing information
   * @param {Array} missingFields - Array of missing field names
   * @returns {string} Follow-up question
   */
  generateFollowUpQuestion(missingFields) {
    const fieldQuestions = {
      position: "¿Para qué posición necesitas contratar? (ej: Chef, Garzón, Bartender, etc.)",
      schedule: "¿Qué tipo de horario necesitas? (Full-time, Part-time, u otro)",
      contract: "¿Qué tipo de contrato ofreces? (Indefinido, A Plazo, Honorarios, etc.)",
      salary: "¿Cuál es el salario que ofreces?",
      vacancies: "¿Cuántas vacantes necesitas cubrir?",
      yearsOfExperience: "¿Cuántos años de experiencia requiere el puesto?",
      period: "¿Es un puesto permanente o temporal?",
      description: "¿Podrías describir más detalles sobre el trabajo?",
      requirements: "¿Hay requisitos específicos para el puesto?",
      functions: "¿Cuáles serían las funciones principales del empleado?"
    };

    if (missingFields.length === 1) {
      return fieldQuestions[missingFields[0]] || "¿Podrías proporcionar más información?";
    } else if (missingFields.length > 1) {
      return `Necesito más información sobre: ${missingFields.join(', ')}. ¿Podrías proporcionar estos detalles?`;
    }

    return "¿Hay algo más que te gustaría agregar a la oferta de trabajo?";
  }

  /**
   * Validate if extracted data is complete enough to create a job
   * @param {Object} data - Extracted job data
   * @returns {Object} Validation result
   */
  validateJobData(data) {
    const requiredFields = [
      'position', 'schedule', 'contract', 'salary', 'vacancies', 
      'yearsOfExperience', 'description', 'requirements', 'functions'
    ];

    const missingFields = requiredFields.filter(field => !data[field] || data[field] === "");

    return {
      isValid: missingFields.length === 0,
      missingFields: missingFields,
      completeness: Math.round(((requiredFields.length - missingFields.length) / requiredFields.length) * 100)
    };
  }

  /**
   * Generate AI suggestions for a specific position
   * @param {string} position - Job position
   * @returns {Object} AI-generated suggestions
   */
  async generatePositionSuggestions(position) {
    try {
      const prompt = `Genera sugerencias específicas para el puesto de ${position} en un restaurante. Incluye:

1. Descripción típica del trabajo
2. Requisitos comunes
3. Funciones principales
4. Preguntas de entrevista relevantes
5. Salario promedio sugerido
6. Horario típico

Responde en formato JSON:
{
  "description": "descripción del trabajo",
  "requirements": "requisitos principales",
  "functions": "funciones principales",
  "suggestedQuestions": ["pregunta1", "pregunta2", "pregunta3"],
  "suggestedSalary": número,
  "suggestedSchedule": "Full-time|Part-time",
  "suggestedExperience": número
}`;

      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          { role: "system", content: "Eres un experto en recursos humanos para restaurantes. Proporciona sugerencias profesionales y realistas." },
          { role: "user", content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.7
      });

      const responseText = completion.choices[0].message.content;
      
      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Error parsing position suggestions:', parseError);
        return {
          description: `Trabajo como ${position} en restaurante`,
          requirements: "Experiencia en el área",
          functions: "Funciones específicas del puesto",
          suggestedQuestions: ["¿Cuál es tu experiencia?", "¿Por qué quieres trabajar aquí?"],
          suggestedSalary: 0,
          suggestedSchedule: "Full-time",
          suggestedExperience: 1
        };
      }

    } catch (error) {
      console.error('❌ Error generating position suggestions:', error);
      return {
        description: `Trabajo como ${position} en restaurante`,
        requirements: "Experiencia en el área",
        functions: "Funciones específicas del puesto",
        suggestedQuestions: ["¿Cuál es tu experiencia?", "¿Por qué quieres trabajar aquí?"],
        suggestedSalary: 0,
        suggestedSchedule: "Full-time",
        suggestedExperience: 1
      };
    }
  }

  /**
   * Generate unique request ID for tracking
   * @returns {string} Request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log performance metrics
   * @param {Object} metrics - Performance metrics
   */
  logMetrics(metrics) {
    console.log(`📊 [AI JOB CREATION] Metrics:`, {
      requestId: metrics.requestId,
      duration: `${metrics.duration}ms`,
      success: metrics.success,
      userMessageLength: metrics.userMessageLength,
      hasRAGContext: metrics.hasRAGContext,
      error: metrics.error || 'none'
    });
  }

  /**
   * Validate AI response structure
   * @param {Object} response - AI response to validate
   * @returns {boolean} Validation result
   */
  validateAIResponse(response) {
    const requiredFields = ['status', 'message', 'extractedData'];
    
    // Check required fields
    for (const field of requiredFields) {
      if (!response[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate status
    if (!['complete', 'incomplete', 'error'].includes(response.status)) {
      throw new Error(`Invalid status: ${response.status}`);
    }

    // Validate extracted data structure
    if (response.status === 'complete') {
      const requiredJobFields = ['position', 'schedule', 'contract'];
      for (const field of requiredJobFields) {
        if (!response.extractedData[field]) {
          throw new Error(`Missing required job field: ${field}`);
        }
      }
    }

    return true;
  }

  /**
   * Initialize the service and knowledge base
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('🚀 [AI JOB CREATION] Initializing service...');
      await this.ragService.initializeKnowledgeBase();
      console.log('✅ [AI JOB CREATION] Service initialized successfully');
    } catch (error) {
      console.error('❌ [AI JOB CREATION] Failed to initialize service:', error);
    }
  }
}

module.exports = new AIJobCreationService();