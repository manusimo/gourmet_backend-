const OpenAI = require('openai');

class AIJobCreationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.defaultModel = "gpt-4";
    this.maxTokens = 2000;
    this.temperature = 0.7;
    
    // Job creation system prompt
    this.systemPrompt = `Eres un asistente de IA especializado en crear ofertas de trabajo para restaurantes. Tu trabajo es analizar descripciones de trabajos en lenguaje natural y extraer información estructurada.

INSTRUCCIONES:
1. Analiza la descripción del trabajo proporcionada por el usuario
2. Extrae la información relevante y organízala en campos estructurados
3. Si falta información importante, haz preguntas específicas al usuario
4. Mantén un tono profesional y amigable
5. Siempre confirma los detalles antes de proceder

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

Si el usuario proporciona información incompleta, haz preguntas específicas para completar los campos faltantes.`;
  }

  /**
   * Process natural language job description and extract structured data
   * @param {string} userMessage - User's job description in natural language
   * @param {Object} conversationHistory - Previous conversation context
   * @param {Object} restaurantContext - Restaurant information
   * @returns {Object} AI response with extracted job data
   */
  async processJobDescription(userMessage, conversationHistory = [], restaurantContext = {}) {
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

      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      const responseText = completion.choices[0].message.content;
      
      // Try to parse JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Error parsing AI response:', parseError);
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
        "Garzón", "Runner", "Chef", "Ayudante de Cocina", "Anfitrión", 
        "Delivery", "Cajero", "Copero", "Barista", "Bartender", 
        "Sommelier", "Maitre", "Jefe de salón", "Limpieza"
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
}

module.exports = new AIJobCreationService();
