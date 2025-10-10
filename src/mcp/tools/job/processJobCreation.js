const { createJobOffer } = require('../../../helpers/jobHelpers.js');
const BaseTool = require('../baseTool');
const OpenAI = require('openai');
const { JOB_CREATION_SYSTEM_PROMPT } = require('./aiPrompts');
const JobDataCleaner = require('./dataCleaner');
const { JobRAGService } = require('../../../services/rag');
const ProcessJobCreationHelpers = require('./helpers/processJobCreationHelpers');
const OpenAIService = require('./services/openaiService');

/**
 * Process Job Creation Tool - Pure MCP approach
 * Handles AI-powered job creation from natural language
 */
class ProcessJobCreationTool extends BaseTool {
  constructor() {
    super(
      'process_job_creation',
      'Process natural language job creation requests using AI',
      {
        type: 'object',
        properties: {
          userMessage: { type: 'string', description: 'User message in natural language' },
          conversationHistory: { type: 'array', items: { type: 'object' }, description: 'Previous conversation context' },
          restaurantContext: { type: 'object', description: 'Restaurant context information' }
        },
        required: ['userMessage', 'restaurantContext']
      }
    );
    
    this.openai = null;
    this.ragService = new JobRAGService();
    this.openaiService = new OpenAIService();
  }

  getOpenAI() {
    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        fetch: fetch, // Pass fetch explicitly
      });
    }
    return this.openai;
  }

  async handle(args, { prisma }) {
    const { userMessage, conversationHistory = [], restaurantContext } = args;
    
    try {
      ProcessJobCreationHelpers.logRequestStart(userMessage, conversationHistory, restaurantContext);
      
      // Validate API key
      ProcessJobCreationHelpers.validateOpenAIApiKey();
      
      // Get RAG context (optional)
      const ragContext = await ProcessJobCreationHelpers.getRAGContextSafely(this.ragService, userMessage, restaurantContext);
      
      // Process with OpenAI
      const aiResponse = await ProcessJobCreationHelpers.processWithOpenAI(this.openaiService, userMessage, conversationHistory, restaurantContext, ragContext);
      
      // Clean and validate response
      const cleanedResponse = ProcessJobCreationHelpers.cleanAndValidateResponse(aiResponse, JobDataCleaner);
      
      // Create job if complete
      if (cleanedResponse.status === 'complete') {
        await this.createJobIfComplete(cleanedResponse, restaurantContext);
      }

      return this.createSuccessResponse(cleanedResponse);

    } catch (error) {
      ProcessJobCreationHelpers.logError(error, userMessage, conversationHistory, restaurantContext);
      return this.createErrorResponse(`Failed to process job creation request: ${error.message}`);
    }
  }


  async getRAGContext(userMessage, restaurantContext) {
    try {
      // Use job-specific RAG service for enhanced context
      const ragResult = await this.ragService.getJobCreationContext(userMessage, restaurantContext);
      
      console.log(`📚 [Job-RAG] Retrieved ${ragResult.sources.length} job-related documents`);
      
      return ragResult;
    } catch (error) {
      console.error('❌ [Job-RAG] Error retrieving context:', error);
      return { context: '', sources: [] };
    }
  }

  buildMessages(userMessage, conversationHistory, restaurantContext, ragContext) {
    let systemPrompt = JOB_CREATION_SYSTEM_PROMPT;
    
    // Add restaurant context
    if (restaurantContext.name) {
      systemPrompt += `\n\nCONTEXTO DEL RESTAURANTE: ${restaurantContext.name}`;
    }
    
    // Add RAG context if available
    if (ragContext.context && ragContext.context.trim()) {
      systemPrompt += `\n\nCONTEXTO ENRIQUECIDO (RAG):\n${ragContext.context}`;
    }

    // Add conversation context instructions
    systemPrompt += `\n\nIMPORTANTE - GESTIÓN DE CONTEXTO:
- Mantén y acumula la información extraída de mensajes anteriores
- NO pierdas datos ya extraídos en conversaciones previas
- Solo pregunta por información que realmente falta
- Si el usuario proporciona información adicional, agrégala a los datos existentes
- Usa el status "incomplete" solo cuando falten campos críticos
- Usa el status "complete" cuando tengas suficiente información para crear el trabajo

EJEMPLO DE FLUJO DE CONVERSACIÓN:
Usuario: "quiero postular un trabajo de garzon"
AI: Extrae position: "Garzón", pregunta por horario y salario

Usuario: "el horario es tiempo completo, el salario es de 1200000"  
AI: Mantiene position: "Garzón", agrega schedule: "Full-time", salary: 1200000, pregunta por descripción y funciones

Usuario: "necesito que atienda mesas y sea amable"
AI: Mantiene todo lo anterior, agrega description y functions, status: "complete"`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
      { role: "user", content: userMessage }
    ];

    return messages;
  }

  async callOpenAI(messages) {
    try {
      console.log('🔗 [MCP] Creating OpenAI client...');
      const openai = this.getOpenAI();
      console.log('🔗 [MCP] OpenAI client created successfully');
      
      console.log('📤 [MCP] Sending request to OpenAI:', {
        model: "gpt-3.5-turbo",
        messagesCount: messages.length,
        maxTokens: 2000,
        temperature: 0.7
      });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7
      });

      console.log('📥 [MCP] OpenAI response received:', {
        hasChoices: !!completion.choices,
        choicesCount: completion.choices?.length || 0,
        hasContent: !!completion.choices?.[0]?.message?.content
      });

      const responseText = completion.choices[0].message.content;
      console.log('📝 [MCP] Raw response text:', {
        length: responseText.length,
        preview: responseText.substring(0, 200) + '...'
      });
      
      // Parse AI response
      try {
        const parsedResponse = JSON.parse(responseText);
        console.log('✅ [MCP] Successfully parsed AI response:', {
          hasStatus: !!parsedResponse.status,
          status: parsedResponse.status,
          hasMessage: !!parsedResponse.message,
          hasExtractedData: !!parsedResponse.extractedData,
          extractedDataKeys: parsedResponse.extractedData ? Object.keys(parsedResponse.extractedData) : []
        });
        
        // Validate that we have the required structure
        if (!parsedResponse.status || !parsedResponse.message) {
          throw new Error('AI response missing required fields: status or message');
        }
        
        return parsedResponse;
      } catch (parseError) {
        console.error('❌ [MCP] Error parsing AI response:', {
          error: parseError.message,
          responseText: responseText.substring(0, 1000),
          responseLength: responseText.length
        });
        throw new Error(`Error processing AI response: ${parseError.message}`);
      }
    } catch (error) {
      console.error('❌ [MCP] OpenAI API call failed:', {
        error: error.message,
        name: error.name,
        status: error.status,
        code: error.code
      });
      throw error;
    }
  }

  createFallbackResponse(userMessage, conversationHistory = [], restaurantContext) {
    console.log('🔄 [MCP] Creating fallback response for:', userMessage);
    
    // Extract data from current message
    const lowerMessage = userMessage.toLowerCase();
    const currentPosition = this.extractPositionFromMessage(lowerMessage);
    const currentSalary = this.extractSalaryFromMessage(lowerMessage);
    const currentSchedule = this.extractScheduleFromMessage(lowerMessage);
    const currentContract = this.extractContractFromMessage(lowerMessage);
    const currentVacancies = this.extractVacanciesFromMessage(lowerMessage);
    const currentYearsOfExperience = this.extractYearsOfExperienceFromMessage(lowerMessage);
    const currentPeriod = this.extractPeriodFromMessage(lowerMessage);
    
    console.log('🔍 [MCP] Current message extraction:', {
      userMessage,
      lowerMessage,
      currentPosition,
      currentSalary,
      currentSchedule,
      currentContract,
      currentVacancies,
      currentYearsOfExperience,
      currentPeriod
    });
    
    // Try to extract accumulated data from conversation history
    let accumulatedData = this.extractAccumulatedDataFromHistory(conversationHistory);
    
    // Merge current message data with accumulated data
    const finalData = {
      position: currentPosition || accumulatedData.position || '',
      schedule: currentSchedule || accumulatedData.schedule || '',
      contract: currentContract || accumulatedData.contract || '',
      salary: currentSalary || accumulatedData.salary || 0,
      propina: accumulatedData.propina || 'No',
      vacancies: currentVacancies || accumulatedData.vacancies || 1,
      yearsOfExperience: currentYearsOfExperience !== null ? currentYearsOfExperience : (accumulatedData.yearsOfExperience || 0),
      period: currentPeriod || accumulatedData.period || 'Permanente',
      description: accumulatedData.description || '',
      requirements: accumulatedData.requirements || '',
      functions: accumulatedData.functions || '',
      questions: accumulatedData.questions || []
    };
    
    // Build dynamic message based on what we found
    let message = '';
    const foundInfo = [];
    const missingInfo = [];
    
    if (finalData.position && finalData.position !== 'Posición no especificada') {
      foundInfo.push(`Posición: ${finalData.position}`);
    } else {
      missingInfo.push('la posición del trabajo');
    }
    
    if (finalData.schedule) {
      foundInfo.push(`Horario: ${finalData.schedule}`);
    } else {
      missingInfo.push('el horario de trabajo (tiempo completo, medio tiempo)');
    }
    
    if (finalData.salary > 0) {
      foundInfo.push(`Salario: $${finalData.salary.toLocaleString()}`);
    } else {
      missingInfo.push('el salario ofrecido');
    }
    
    if (finalData.contract) {
      foundInfo.push(`Contrato: ${finalData.contract}`);
    } else {
      missingInfo.push('el tipo de contrato');
    }
    
    if (finalData.vacancies > 0) {
      foundInfo.push(`Vacantes: ${finalData.vacancies}`);
    } else {
      missingInfo.push('el número de vacantes');
    }
    
    if (finalData.yearsOfExperience !== null && finalData.yearsOfExperience !== undefined && finalData.yearsOfExperience !== '') {
      foundInfo.push(`Experiencia: ${finalData.yearsOfExperience} años`);
    } else {
      missingInfo.push('los años de experiencia requeridos');
    }
    
    if (finalData.period) {
      foundInfo.push(`Período: ${finalData.period}`);
    } else {
      missingInfo.push('el período del trabajo');
    }
    
    // Build the message
    if (foundInfo.length > 0) {
      message = `Perfecto, he identificado: ${foundInfo.join(', ')}.`;
    } else {
      message = 'Entiendo que quieres crear un trabajo.';
    }
    
    if (missingInfo.length > 0) {
      message += ` Para completar la oferta, necesito más información sobre: ${missingInfo.join(', ')}.`;
      
      // Add specific guidance for common missing fields
      if (!finalData.position || finalData.position === 'Posición no especificada') {
        message += ` Las posiciones disponibles son: Garzón, Runner, Chef, Ayudante de Cocina, Anfitrión, Delivery, Cajero, Copero, Barista, Bartender, Sommelier, Maitre, Jefe de salón, Limpieza.`;
      }
      if (!finalData.schedule) {
        message += ` Para el horario, puedes elegir: Full-time (tiempo completo), Part-time (medio tiempo), u Otro.`;
      }
      if (!finalData.salary || finalData.salary === 0) {
        message += ` Para el salario, solo necesito el número (ej: 1200000).`;
      }
      if (!finalData.contract) {
        message += ` Para el contrato, puedes elegir: A Plazo, Indefinido, Honorarios, Práctica, u Otros.`;
      }
      if (!finalData.vacancies || finalData.vacancies === 0) {
        message += ` Para las vacantes, indica cuántos puestos necesitas.`;
      }
      if (finalData.yearsOfExperience === null || finalData.yearsOfExperience === undefined || finalData.yearsOfExperience === '') {
        message += ` Para la experiencia, especifica: Sin experiencia (0), 1 año, 2 años, 3 años, 4 años, o +5 años.`;
      }
      if (!finalData.period) {
        message += ` Para el período, puedes elegir: Permanente, Reemplazo Temporal, Reemplazo Urgente, o Sin información.`;
      }
    }
    
    // Determine if we have enough data to be complete
    const hasMinimumData = finalData.position && finalData.position !== 'Posición no especificada' && 
                          finalData.schedule && finalData.salary > 0 &&
                          finalData.contract && finalData.vacancies > 0 &&
                          (finalData.yearsOfExperience !== null && finalData.yearsOfExperience !== undefined && finalData.yearsOfExperience !== '') &&
                          finalData.period && finalData.description &&
                          finalData.requirements && finalData.functions &&
                          finalData.questions && finalData.questions.length > 0;
    
    return {
      status: hasMinimumData ? 'complete' : 'incomplete',
      message: message,
      extractedData: finalData,
      missingFields: this.getMissingFields(
        finalData.position, 
        finalData.schedule, 
        finalData.salary, 
        finalData.contract, 
        finalData.vacancies, 
        finalData.yearsOfExperience, 
        finalData.period, 
        finalData.description, 
        finalData.requirements, 
        finalData.functions, 
        finalData.questions
      ),
      suggestions: this.getSuggestions(
        finalData.position, 
        finalData.schedule, 
        finalData.salary, 
        finalData.contract, 
        finalData.vacancies, 
        finalData.yearsOfExperience, 
        finalData.period, 
        finalData.description, 
        finalData.requirements, 
        finalData.functions, 
        finalData.questions
      )
    };
  }

  extractAccumulatedDataFromHistory(conversationHistory) {
    const accumulated = {
      position: '',
      schedule: '',
      contract: '',
      salary: 0,
      propina: 'No',
      vacancies: 1,
      yearsOfExperience: 0,
      period: 'Permanente',
      description: '',
      requirements: '',
      functions: '',
      questions: []
    };
    
    console.log('🔍 [MCP] Extracting accumulated data from history:', {
      historyLength: conversationHistory.length,
      history: conversationHistory.map(msg => ({ 
        role: msg.role, 
        contentPreview: msg.content?.substring(0, 100),
        fullContent: msg.content
      }))
    });
    
    // Look through conversation history for assistant messages with extracted data
    for (const message of conversationHistory) {
      if (message.role === 'assistant' && message.content) {
        console.log('🔍 [MCP] Processing assistant message:', {
          contentType: typeof message.content,
          contentPreview: message.content?.substring(0, 200)
        });
        
        try {
          // Try to parse if it's JSON
          const parsed = JSON.parse(message.content);
          console.log('📊 [MCP] Successfully parsed JSON:', parsed);
          if (parsed.extractedData) {
            console.log('📊 [MCP] Found extracted data in history:', parsed.extractedData);
            // Merge the data, keeping existing values if new ones are empty
            Object.keys(parsed.extractedData).forEach(key => {
              if (parsed.extractedData[key] && parsed.extractedData[key] !== '' && parsed.extractedData[key] !== 0) {
                console.log(`🔄 [MCP] Updating ${key}: ${accumulated[key]} -> ${parsed.extractedData[key]}`);
                accumulated[key] = parsed.extractedData[key];
              }
            });
          }
        } catch (e) {
          console.log('⚠️ [MCP] Failed to parse JSON, trying text extraction:', e.message);
          // If not JSON, try to extract from text using simple parsing
          const lowerContent = message.content.toLowerCase();
          if (!accumulated.position || accumulated.position === 'Posición no especificada') {
            const extractedPosition = this.extractPositionFromMessage(lowerContent);
            if (extractedPosition && extractedPosition !== 'Posición no especificada') {
              console.log(`🔄 [MCP] Extracted position from text: ${extractedPosition}`);
              accumulated.position = extractedPosition;
            }
          }
          if (!accumulated.schedule) {
            const extractedSchedule = this.extractScheduleFromMessage(lowerContent);
            if (extractedSchedule) {
              console.log(`🔄 [MCP] Extracted schedule from text: ${extractedSchedule}`);
              accumulated.schedule = extractedSchedule;
            }
          }
          if (!accumulated.salary || accumulated.salary === 0) {
            const extractedSalary = this.extractSalaryFromMessage(lowerContent);
            if (extractedSalary > 0) {
              console.log(`🔄 [MCP] Extracted salary from text: ${extractedSalary}`);
              accumulated.salary = extractedSalary;
            }
          }
        }
      }
    }
    
    console.log('📋 [MCP] Final accumulated data:', accumulated);
    return accumulated;
  }

  extractPositionFromMessage(message) {
    const positions = {
      'garzon': 'Garzón',
      'garzón': 'Garzón',
      'waiter': 'Garzón',
      'mesero': 'Garzón',
      'runner': 'Runner',
      'chef': 'Chef',
      'cook': 'Chef',
      'cocinero': 'Chef',
      'ayudante de cocina': 'Ayudante de Cocina',
      'ayudante cocina': 'Ayudante de Cocina',
      'anfitrion': 'Anfitrión',
      'anfitrión': 'Anfitrión',
      'host': 'Anfitrión',
      'delivery': 'Delivery',
      'repartidor': 'Delivery',
      'cajero': 'Cajero',
      'cashier': 'Cajero',
      'copero': 'Copero',
      'barista': 'Barista',
      'bartender': 'Bartender',
      'barman': 'Bartender',
      'sommelier': 'Sommelier',
      'maitre': 'Maitre',
      'jefe de salon': 'Jefe de salón',
      'jefe de salón': 'Jefe de salón',
      'jefe salon': 'Jefe de salón',
      'limpieza': 'Limpieza',
      'cleaner': 'Limpieza',
      'aseo': 'Limpieza'
    };
    
    for (const [key, value] of Object.entries(positions)) {
      if (message.includes(key)) {
        return value;
      }
    }
    return 'Posición no especificada';
  }

  extractSalaryFromMessage(message) {
    // Look for various salary formats: $1200000, 1200000, 1,200,000, etc.
    // First try to find larger numbers (6+ digits)
    const largeSalaryMatch = message.match(/\$?(\d{6,}(?:,\d{3})*(?:\.\d{2})?)/);
    if (largeSalaryMatch) {
      return parseInt(largeSalaryMatch[1].replace(/,/g, ''));
    }
    
    // Then try smaller numbers (3-5 digits)
    const smallSalaryMatch = message.match(/\$?(\d{3,5}(?:,\d{3})*(?:\.\d{2})?)/);
    if (smallSalaryMatch) {
      return parseInt(smallSalaryMatch[1].replace(/,/g, ''));
    }
    
    return 0;
  }

  extractScheduleFromMessage(message) {
    if (message.includes('tiempo completo') || message.includes('full-time') || message.includes('full time')) {
      return 'Full-time';
    }
    if (message.includes('medio tiempo') || message.includes('part-time') || message.includes('part time')) {
      return 'Part-time';
    }
    return '';
  }

  extractContractFromMessage(message) {
    if (message.includes('a plazo') || message.includes('plazo')) {
      return 'A Plazo';
    }
    if (message.includes('indefinido')) {
      return 'Indefinido';
    }
    if (message.includes('honorarios')) {
      return 'Honorarios';
    }
    if (message.includes('práctica') || message.includes('practica')) {
      return 'Práctica';
    }
    return '';
  }

  extractVacanciesFromMessage(message) {
    const vacancyMatch = message.match(/(\d+)\s*(?:vacantes?|puestos?|empleados?)/i);
    if (vacancyMatch) {
      return parseInt(vacancyMatch[1]);
    }
    return 1; // Default to 1
  }

  extractYearsOfExperienceFromMessage(message) {
    if (message.includes('sin experiencia') || message.includes('0 años') || message.includes('0 año')) {
      return 0;
    }
    const expMatch = message.match(/(\d+)\s*(?:años?|año)/i);
    if (expMatch) {
      return parseInt(expMatch[1]);
    }
    return null;
  }

  extractPeriodFromMessage(message) {
    if (message.includes('permanente')) {
      return 'Permanente';
    }
    if (message.includes('reemplazo temporal') || message.includes('temporal')) {
      return 'Reemplazo Temporal';
    }
    if (message.includes('reemplazo urgente') || message.includes('urgente')) {
      return 'Reemplazo Urgente';
    }
    return '';
  }

  getMissingFields(position, schedule, salary, contract, vacancies, yearsOfExperience, period, description, requirements, functions, questions) {
    const missing = [];
    if (!position || position === 'Posición no especificada') missing.push('position');
    if (!schedule) missing.push('schedule');
    if (!salary || salary === 0) missing.push('salary');
    if (!contract) missing.push('contract');
    if (!vacancies || vacancies === 0) missing.push('vacancies');
    if (yearsOfExperience === null || yearsOfExperience === undefined || yearsOfExperience === '') missing.push('yearsOfExperience');
    if (!period) missing.push('period');
    if (!description) missing.push('description');
    if (!requirements) missing.push('requirements');
    if (!functions) missing.push('functions');
    if (!questions || questions.length === 0) missing.push('questions');
    return missing;
  }

  getSuggestions(position, schedule, salary, contract, vacancies, yearsOfExperience, period, description, requirements, functions, questions) {
    const suggestions = [];
    if (!position || position === 'Posición no especificada') {
      suggestions.push('Especifica la posición: Garzón, Runner, Chef, Ayudante de Cocina, Anfitrión, Delivery, Cajero, Copero, Barista, Bartender, Sommelier, Maitre, Jefe de salón, o Limpieza');
    }
    if (!schedule) {
      suggestions.push('Menciona el horario: Full-time (tiempo completo), Part-time (medio tiempo), u Otro');
    }
    if (!salary || salary === 0) {
      suggestions.push('Indica el salario ofrecido (solo el número, ej: 1200000)');
    }
    if (!contract) {
      suggestions.push('Especifica el tipo de contrato: A Plazo, Indefinido, Honorarios, Práctica, u Otros');
    }
    if (!vacancies || vacancies === 0) {
      suggestions.push('Indica el número de vacantes');
    }
    if (yearsOfExperience === null || yearsOfExperience === undefined || yearsOfExperience === '') {
      suggestions.push('Especifica los años de experiencia: Sin experiencia (0), 1 año, 2 años, 3 años, 4 años, o +5 años');
    }
    if (!period) {
      suggestions.push('Indica el período: Permanente, Reemplazo Temporal, Reemplazo Urgente, o Sin información');
    }
    if (!description) {
      suggestions.push('Describe el trabajo y sus responsabilidades');
    }
    if (!requirements) {
      suggestions.push('Menciona los requisitos específicos del puesto');
    }
    if (!functions) {
      suggestions.push('Describe las funciones principales del trabajo');
    }
    if (!questions || questions.length === 0) {
      suggestions.push('Agrega al menos una pregunta para la entrevista');
    }
    return suggestions;
  }

  async createJobIfComplete(aiResponse, restaurantContext) {
    try {
      const jobData = JobDataCleaner.prepareJobData(aiResponse.extractedData, restaurantContext);
      const jobOffer = await createJobOffer(jobData);
      
      aiResponse.message = `¡Perfecto! He creado la oferta de trabajo para ${aiResponse.extractedData.position}. La oferta ha sido publicada exitosamente.`;
      aiResponse.jobCreated = true;
      aiResponse.jobId = jobOffer.id;
    } catch (jobError) {
      console.error('❌ Error creating job:', jobError);
      aiResponse.message = 'Hubo un error al crear la oferta de trabajo. Por favor, intenta de nuevo.';
      aiResponse.status = 'error';
    }
  }
}

module.exports = ProcessJobCreationTool;
