const { createJobOffer } = require('../../../helpers/jobHelpers.js');
const BaseTool = require('../baseTool');
const OpenAI = require('openai');
const { JOB_CREATION_SYSTEM_PROMPT } = require('./aiPrompts');
const JobDataCleaner = require('./dataCleaner');
const { JobRAGService } = require('../../../services/rag');
const ProcessJobCreationHelpers = require('./helpers/processJobCreationHelpers');
const OpenAIService = require('./services/openaiService');
const ValidationHelpers = require('./helpers/validationHelpers');

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
      
      // Get RAG context from similar jobs and best practices
      const ragContext = await ProcessJobCreationHelpers.getRAGContextSafely(this.ragService, userMessage, restaurantContext);
      
      // Process with OpenAI
      const aiResponse = await ProcessJobCreationHelpers.processWithOpenAI(this.openaiService, userMessage, conversationHistory, restaurantContext, ragContext);
      
      // Clean and validate response
      const cleanedResponse = ProcessJobCreationHelpers.cleanAndValidateResponse(aiResponse, JobDataCleaner);
      
      // Check if user is asking about candidates
      const isAskingForCandidates = this.isCandidateRequest(userMessage, conversationHistory);
      
      // Get similar jobs for replication/reference (if we have enough data)
      if (cleanedResponse.extractedData && cleanedResponse.extractedData.position) {
        try {
          const similarJobs = await this.ragService.searchSimilarJobs(cleanedResponse.extractedData, 3);
          if (similarJobs.length > 0) {
            cleanedResponse.similarJobs = similarJobs;
            console.log(`📋 [MCP] Found ${similarJobs.length} similar jobs for reference`);
            
            // Add message about similar jobs
            if (cleanedResponse.status === 'complete' || cleanedResponse.status === 'incomplete') {
              cleanedResponse.message += `\n\n📋 **TRABAJOS SIMILARES:**\nHe encontrado ${similarJobs.length} trabajo(s) similar(es) que puedes usar como referencia. Puedes replicar cualquiera de estos para crear tu oferta más rápido.`;
            }
          }
        } catch (error) {
          console.error('❌ [MCP] Error fetching similar jobs:', error);
          // Don't fail the whole process if similar jobs search fails
        }

        // Search for recommended candidates if user asked or if job is complete
        if (isAskingForCandidates || cleanedResponse.status === 'complete') {
          try {
            const recommendedCandidates = await this.ragService.searchSimilarApplicants(cleanedResponse.extractedData, 5);
            if (recommendedCandidates.length > 0) {
            // Format candidates for response
            cleanedResponse.recommendedCandidates = recommendedCandidates.map(rec => ({
              name: `${rec.employee.user?.name || ''} ${rec.employee.user?.surname || ''}`.trim(),
              email: rec.employee.user?.email || 'No email',
              similarity: Math.round(rec.similarity * 100), // Percentage
              matchReasons: rec.matchReasons || [],
              employeeId: rec.employee.id,
              hasExperience: rec.employee.experiences?.length > 0,
              hasEducation: rec.employee.educations?.length > 0,
              canContact: true, // Can initiate chat
              contactMethod: 'chat', // Direct chat available
              contactEndpoint: '/api/contact-recommended-candidate', // API endpoint to initiate chat
              jobPostId: cleanedResponse.jobId || null // Include job ID if job was already created
            }));

              console.log(`👥 [MCP] Found ${recommendedCandidates.length} recommended candidates`);
              
              // Add message about candidates with contact info
              const candidatesMessage = `\n\n👥 **CANDIDATOS RECOMENDADOS:**\nHe encontrado ${recommendedCandidates.length} candidato(s) que coinciden con los requisitos del puesto "${cleanedResponse.extractedData.position}". Puedes contactarlos directamente mediante chat para iniciar una conversación sobre el puesto.`;
              cleanedResponse.message += candidatesMessage;
            } else if (isAskingForCandidates) {
              cleanedResponse.message += `\n\n👥 **CANDIDATOS:**\nNo he encontrado candidatos recomendados que coincidan exactamente con los requisitos del puesto "${cleanedResponse.extractedData.position}". Puedes esperar a que candidatos apliquen o ajustar los requisitos del trabajo.`;
            }
          } catch (error) {
            console.error('❌ [MCP] Error fetching recommended candidates:', error);
            // Don't fail the whole process if candidate search fails
          }
        }
      } else if (isAskingForCandidates) {
        // User asked for candidates but we don't have position yet
        cleanedResponse.message += `\n\n👥 Para buscar candidatos recomendados, primero necesito saber la posición del trabajo. Por favor, indica qué tipo de puesto necesitas.`;
      }
      
      // Add debugging info to indicate this came from LLM
      cleanedResponse.debugInfo = {
        source: 'LLM',
        model: 'gpt-3.5-turbo',
        timestamp: new Date().toISOString()
      };
      
      // Add OpenAI status info
      cleanedResponse.openaiStatus = {
        available: true,
        model: 'gpt-3.5-turbo',
        fallbackUsed: false,
        explanation: 'OpenAI API working normally'
      };
      
      console.log('🤖 [MCP] Response generated by LLM (OpenAI GPT-3.5-turbo)');
      
      // Create job only when user explicitly confirms
      if (cleanedResponse.status === 'ready_to_publish') {
        await this.createJobIfComplete(cleanedResponse, restaurantContext);
      }

      return this.createSuccessResponse(cleanedResponse);

    } catch (error) {
      ProcessJobCreationHelpers.logError(error, userMessage, conversationHistory, restaurantContext);
      
      // Check if it's an OpenAI-related error (missing key, quota, API error)
      const isOpenAIError = error.message.includes('quota') || 
                            error.message.includes('429') || 
                            error.message.includes('insufficient_quota') ||
                            error.message.includes('API key not found') ||
                            error.message.includes('OpenAI API key') ||
                            error.message.includes('OpenAI');
      
      if (isOpenAIError) {
        const reason = error.message.includes('API key not found') || error.message.includes('OpenAI API key') 
          ? 'api_key_missing' 
          : 'quota_exceeded';
        
        console.log('🔄 [MCP] OpenAI error detected, using fallback response:', {
          reason,
          error: error.message,
          code: error.code,
          status: error.status
        });
        
        const fallbackResponse = await this.createFallbackResponse(userMessage, conversationHistory, restaurantContext);
        
        // fallbackResponse is already wrapped by createSuccessResponse, so we need to parse it to update openaiStatus
        // The content[0].text contains JSON string with the actual response
        if (fallbackResponse.content && fallbackResponse.content[0] && fallbackResponse.content[0].text) {
          try {
            const parsedContent = JSON.parse(fallbackResponse.content[0].text);
            if (parsedContent.openaiStatus) {
              parsedContent.openaiStatus = {
                available: false,
                reason: reason,
                model: 'gpt-3.5-turbo',
                fallbackUsed: true,
                explanation: reason === 'api_key_missing' 
                  ? 'OpenAI API key not configured - using regex pattern matching instead'
                  : 'OpenAI API quota exceeded - using regex pattern matching instead'
              };
            }
            
            // Create job if user confirmed in fallback
            if (parsedContent.status === 'ready_to_publish') {
              await this.createJobIfComplete(parsedContent, restaurantContext);
            }
            
            // Re-wrap the updated content
            return this.createSuccessResponse(parsedContent);
          } catch (parseError) {
            console.error('❌ [MCP] Error parsing fallback response to update openaiStatus:', parseError);
          }
        }
        
        return fallbackResponse;
      }
      
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

  async createFallbackResponse(userMessage, conversationHistory = [], restaurantContext) {
    console.log('🔄 [MCP] Creating fallback response for:', userMessage);
    
    // Check if user is asking for candidates
    const isAskingForCandidates = this.isCandidateRequest(userMessage, conversationHistory);
    
    // Check if user is confirming to publish
    const lowerMessage = userMessage.toLowerCase();
    const isConfirmingPublish = lowerMessage.includes('sí') || 
                               lowerMessage.includes('si') || 
                               lowerMessage.includes('publicar') || 
                               lowerMessage.includes('crear') || 
                               lowerMessage.includes('ok') || 
                               lowerMessage.includes('dale') ||
                               lowerMessage.includes('perfecto');
    
    // Extract data from current message
    const currentPosition = this.extractPositionFromMessage(lowerMessage);
    const currentSalary = this.extractSalaryFromMessage(lowerMessage);
    const currentSchedule = this.extractScheduleFromMessage(lowerMessage);
    const currentContract = this.extractContractFromMessage(lowerMessage);
    const currentVacancies = this.extractVacanciesFromMessage(lowerMessage);
    const currentYearsOfExperience = this.extractYearsOfExperienceFromMessage(lowerMessage);
    const currentPeriod = this.extractPeriodFromMessage(lowerMessage);
    const currentDescription = this.extractDescriptionFromMessage(userMessage);
    const currentFunctions = this.extractFunctionsFromMessage(userMessage);
    const currentRequirements = this.extractRequirementsFromMessage(userMessage);
    const currentQuestions = this.extractQuestionsFromMessage(userMessage);
    
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
    
    console.log('🔍 [MCP] Data merging debug:', {
      currentPosition,
      currentSchedule,
      currentContract,
      currentSalary,
      accumulatedData,
      finalData: {
        position: (currentPosition && currentPosition !== 'Posición no especificada') ? currentPosition : (accumulatedData.position || ''),
        schedule: currentSchedule || accumulatedData.schedule || '',
        contract: currentContract || accumulatedData.contract || '',
        salary: currentSalary || accumulatedData.salary || 0
      }
    });
    
    // Merge current message data with accumulated data
    // Only use current values if they're meaningful (not default/empty values)
    const finalData = {
      position: (currentPosition && currentPosition !== 'Posición no especificada') ? currentPosition : (accumulatedData.position || ''),
      schedule: currentSchedule || accumulatedData.schedule || '',
      contract: currentContract || accumulatedData.contract || '',
      salary: currentSalary || accumulatedData.salary || 0,
      tips: accumulatedData.tips !== undefined ? accumulatedData.tips : true, // Default to true
      vacancies: currentVacancies || accumulatedData.vacancies || 1,
      yearsOfExperience: currentYearsOfExperience !== null ? currentYearsOfExperience : (accumulatedData.yearsOfExperience || 0),
      period: currentPeriod || accumulatedData.period || 'Permanente',
      description: currentDescription || accumulatedData.description || '',
      requirements: currentRequirements || accumulatedData.requirements || '',
      functions: currentFunctions || accumulatedData.functions || '',
      questions: currentQuestions.length > 0 ? currentQuestions : (accumulatedData.questions || []),
      locationId: accumulatedData.locationId || null // Will be set by user selection
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
    
    if (finalData.description) {
      foundInfo.push(`Descripción: ${finalData.description.substring(0, 50)}...`);
    } else {
      missingInfo.push('la descripción del trabajo');
    }
    
    if (finalData.functions) {
      foundInfo.push(`Funciones: ${finalData.functions.substring(0, 50)}...`);
    } else {
      missingInfo.push('las funciones del trabajo');
    }
    
    if (finalData.requirements) {
      foundInfo.push(`Requisitos: ${finalData.requirements.substring(0, 50)}...`);
    } else {
      missingInfo.push('los requisitos del trabajo');
    }
    
    if (finalData.questions && finalData.questions.length > 0) {
      foundInfo.push(`Preguntas: ${finalData.questions.length} pregunta(s)`);
    } else {
      missingInfo.push('al menos 1 pregunta para los candidatos');
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
        message += `\n\n👨‍💼 **POSICIÓN** - Elige una opción:\n• Chef Ejecutivo\n• Sous Chef\n• Jefe de Cocina\n• Maestro de Cocina\n• Maestro Pastelero\n• Pastelero\n• Panadero\n• Repostero\n• Charcutero\n• Pizzero\n• Itamae\n• Sushiman\n• Ayudante de Sushi\n• Parrillero\n• Cocinero Frío\n• Cocinero Caliente\n• Manipulador de Alimentos\n• Encargado de Producción\n• Operador de Cocina\n• Operador de Planta\n• Operador Multifuncional\n• Encargado de Reservas\n• Recepcionista de Restaurante\n• Supervisor de Salón\n• Personal de Banquetería\n• Encargado de Bodega\n• Repositor\n• Personal de Mantenimiento\n• Jefe de Local\n• Administrador de Local\n• Jefe de Sucursales\n• Administrador de Restaurante\n• Encargado de Compras\n• Control de Calidad\n• Catador de Vinos\n• Coordinador de Banquetes\n• Montajista\n• Mixólogo`;
      }
      if (!finalData.schedule) {
        message += `\n\n📅 **HORARIO** - Elige una opción:\n• Full-time (tiempo completo)\n• Part-time (medio tiempo)\n• Otro`;
      }
      if (!finalData.salary || finalData.salary === 0) {
        message += `\n\n💰 **SALARIO** - Solo el número (ej: 1200000)`;
      }
      if (!finalData.contract) {
        message += `\n\n📋 **CONTRATO** - Elige una opción:\n• A Plazo\n• Indefinido\n• Honorarios\n• Práctica\n• Otros`;
      }
      if (!finalData.vacancies || finalData.vacancies === 0) {
        message += `\n\n👥 **VACANTES** - Cuántos puestos necesitas (ej: 2)`;
      }
      if (finalData.yearsOfExperience === null || finalData.yearsOfExperience === undefined || finalData.yearsOfExperience === '') {
        message += `\n\n🎯 **EXPERIENCIA** - Elige una opción:\n• Sin experiencia (0)\n• 1 año\n• 2 años\n• 3 años\n• 4 años\n• +5 años`;
      }
      if (!finalData.period) {
        message += `\n\n⏰ **PERÍODO** - Elige una opción:\n• Permanente\n• Reemplazo Temporal\n• Reemplazo Urgente\n• Sin información`;
      }
      if (!finalData.description) {
        message += `\n\n📝 **DESCRIPCIÓN** - Describe el trabajo y ambiente laboral (ej: "Buscamos garzón para restaurante familiar, ambiente dinámico y trabajo en equipo")`;
      }
      if (!finalData.functions) {
        message += `\n\n⚙️ **FUNCIONES** - Lista las tareas principales (ej: "Atender mesas, tomar pedidos, servir comida, limpiar mesas")`;
      }
      if (!finalData.requirements) {
        message += `\n\n✅ **REQUISITOS** - Qué necesita el candidato (ej: "Experiencia en restaurantes, buena presencia, disponibilidad fines de semana")`;
      }
      if (!finalData.questions || finalData.questions.length === 0) {
        message += `\n\n❓ **PREGUNTAS** - Al menos 1 pregunta para candidatos (ej: "¿Tienes experiencia como garzón?", "¿Dispones fines de semana?")`;
      }
      
      message += `\n\n💡 **TIP:** Puedes proporcionar toda la información de una vez o ir completando campo por campo.`;
    }
    
    // Determine if we have enough data to be complete
    const hasMinimumData = ValidationHelpers.hasMinimumData(finalData);
    
    // Determine status based on data completeness and user confirmation
    let status = 'incomplete';
    
    if (hasMinimumData) {
      if (isConfirmingPublish) {
        status = 'ready_to_publish';
        message = '¡Perfecto! Voy a crear la oferta de trabajo ahora...';
      } else {
        status = 'complete';
        message = `¡Perfecto! He recopilado toda la información necesaria para crear la oferta de trabajo:

        📋 **RESUMEN DE LA OFERTA:**
        • **Posición:** ${finalData.position}
        • **Horario:** ${finalData.schedule}
        • **Salario:** $${finalData.salary?.toLocaleString()}
        • **Contrato:** ${finalData.contract}
        • **Vacantes:** ${finalData.vacancies}
        • **Experiencia:** ${finalData.yearsOfExperience} años
        • **Período:** ${finalData.period}
        • **Descripción:** ${finalData.description}
        • **Funciones:** ${finalData.functions}
        • **Requisitos:** ${finalData.requirements}
        • **Preguntas:** ${finalData.questions?.length || 0} pregunta(s)

        ¿Quieres que publique esta oferta de trabajo o prefieres cambiar algo?`;
      }
    }
    
    const fallbackResponse = {
      status: status,
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
      ),
      debugInfo: {
        source: 'REGEX_FALLBACK',
        method: 'pattern_matching',
        timestamp: new Date().toISOString(),
        extractedFields: Object.keys(finalData).filter(key => finalData[key] && finalData[key] !== ''),
        isConfirmingPublish: isConfirmingPublish
      },
      openaiStatus: {
        available: false,
        reason: 'quota_exceeded',
        model: 'gpt-3.5-turbo',
        fallbackUsed: true,
        explanation: 'OpenAI API quota exceeded - using regex pattern matching instead'
      }
    };

    // Get similar jobs for replication/reference (if we have enough data)
    if (finalData.position && finalData.position !== 'Posición no especificada') {
      try {
        const similarJobs = await this.ragService.searchSimilarJobs(finalData, 3);
        if (similarJobs.length > 0) {
          fallbackResponse.similarJobs = similarJobs;
          console.log(`📋 [MCP] Found ${similarJobs.length} similar jobs for reference in fallback`);
          
          // Add message about similar jobs
          if (status === 'complete' || status === 'incomplete') {
            fallbackResponse.message += `\n\n📋 **TRABAJOS SIMILARES:**\nHe encontrado ${similarJobs.length} trabajo(s) similar(es) que puedes usar como referencia. Puedes replicar cualquiera de estos para crear tu oferta más rápido.`;
          }
        }
      } catch (error) {
        console.error('❌ [MCP] Error fetching similar jobs in fallback:', error);
        // Don't fail the whole process if similar jobs search fails
      }

      // Search for recommended candidates if user asked or if job is complete
      if (isAskingForCandidates || status === 'complete') {
        try {
          const recommendedCandidates = await this.ragService.searchSimilarApplicants(finalData, 5);
          if (recommendedCandidates.length > 0) {
            // Format candidates for response
            fallbackResponse.recommendedCandidates = recommendedCandidates.map(rec => ({
              name: `${rec.employee.user?.name || ''} ${rec.employee.user?.surname || ''}`.trim(),
              email: rec.employee.user?.email || 'No email',
              similarity: Math.round(rec.similarity * 100),
              matchReasons: rec.matchReasons || [],
              employeeId: rec.employee.id,
              hasExperience: rec.employee.experiences?.length > 0,
              hasEducation: rec.employee.educations?.length > 0,
              canContact: true, // Can initiate chat
              contactMethod: 'chat', // Direct chat available
              contactEndpoint: '/api/contact-recommended-candidate', // API endpoint to initiate chat
              jobPostId: null // Job not created yet in fallback mode
            }));

            console.log(`👥 [MCP] Found ${recommendedCandidates.length} recommended candidates in fallback`);
            
            // Add message about candidates with contact info
            const candidatesMessage = `\n\n👥 **CANDIDATOS RECOMENDADOS:**\nHe encontrado ${recommendedCandidates.length} candidato(s) que coinciden con los requisitos del puesto "${finalData.position}". Puedes contactarlos directamente mediante chat para iniciar una conversación sobre el puesto.`;
            fallbackResponse.message += candidatesMessage;
          } else if (isAskingForCandidates) {
            fallbackResponse.message += `\n\n👥 **CANDIDATOS:**\nNo he encontrado candidatos recomendados que coincidan exactamente con los requisitos del puesto "${finalData.position}". Puedes esperar a que candidatos apliquen o ajustar los requisitos del trabajo.`;
          }
        } catch (error) {
          console.error('❌ [MCP] Error fetching recommended candidates in fallback:', error);
          // Don't fail the whole process if candidate search fails
        }
      }
    } else if (isAskingForCandidates) {
      // User asked for candidates but we don't have position yet
      fallbackResponse.message += `\n\n👥 Para buscar candidatos recomendados, primero necesito saber la posición del trabajo. Por favor, indica qué tipo de puesto necesitas.`;
    }
    
    console.log('🔧 [MCP] Response generated by REGEX FALLBACK system');
    console.log('🔄 [MCP] Fallback response created:', fallbackResponse);
    return this.createSuccessResponse(fallbackResponse);
  }

  extractAccumulatedDataFromHistory(conversationHistory) {
    const accumulated = {
      position: '',
      schedule: '',
      contract: '',
      salary: 0,
      tips: true, // Default to true (propinas)
      vacancies: 1,
      yearsOfExperience: 0,
      period: 'Permanente',
      description: '',
      requirements: '',
      functions: '',
      questions: [],
      locationId: null // Will be set by user selection
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
              const value = parsed.extractedData[key];
              // Update if value is not null, undefined, empty string, or 'Posición no especificada'
              if (value !== null && value !== undefined && value !== '' && value !== 'Posición no especificada') {
                console.log(`🔄 [MCP] Updating ${key}: ${accumulated[key]} -> ${value}`);
                accumulated[key] = value;
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

  extractDescriptionFromMessage(message) {
    // Look for description patterns
    const descriptionPatterns = [
      /descrip[ció]n[:\s]*(.+?)(?:\n|$)/i,
      /describe[:\s]*(.+?)(?:\n|$)/i,
      /el trabajo es[:\s]*(.+?)(?:\n|$)/i,
      /ambiente[:\s]*(.+?)(?:\n|$)/i
    ];
    
    for (const pattern of descriptionPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }
    return '';
  }

  extractFunctionsFromMessage(message) {
    // Look for functions patterns
    const functionPatterns = [
      /funciones[:\s]*(.+?)(?:\n|$)/i,
      /tareas[:\s]*(.+?)(?:\n|$)/i,
      /debe[:\s]*(.+?)(?:\n|$)/i,
      /responsabilidades[:\s]*(.+?)(?:\n|$)/i
    ];
    
    for (const pattern of functionPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }
    return '';
  }

  extractRequirementsFromMessage(message) {
    // Look for requirements patterns
    const requirementPatterns = [
      /requisitos[:\s]*(.+?)(?:\n|$)/i,
      /necesita[:\s]*(.+?)(?:\n|$)/i,
      /debe tener[:\s]*(.+?)(?:\n|$)/i,
      /experiencia en[:\s]*(.+?)(?:\n|$)/i
    ];
    
    for (const pattern of requirementPatterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * Check if user is asking for candidates/recommendations
   */
  isCandidateRequest(userMessage, conversationHistory = []) {
    const lowerMessage = userMessage.toLowerCase();
    const candidateKeywords = [
      'candidatos',
      'candidato',
      'recomend',
      'tienes candidatos',
      'busca candidatos',
      'hay candidatos',
      'candidatos para',
      'personas para',
      'gente para',
      'trabajadores',
      'empleados',
      'aplicantes',
      'postulantes'
    ];
    
    // Check current message
    if (candidateKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return true;
    }
    
    // Check conversation history
    const historyMessages = conversationHistory.map(msg => 
      typeof msg === 'string' ? msg : msg.content || ''
    ).join(' ').toLowerCase();
    
    return candidateKeywords.some(keyword => historyMessages.includes(keyword));
  }

  extractQuestionsFromMessage(message) {
    // Look for questions patterns
    const questionPatterns = [
      /pregunta[:\s]*(.+?)(?:\n|$)/i,
      /¿(.+?)\?/g
    ];
    
    const questions = [];
    for (const pattern of questionPatterns) {
      const matches = message.match(pattern);
      if (matches) {
        if (Array.isArray(matches)) {
          matches.forEach(match => {
            if (match.trim().length > 10) {
              questions.push({ question: match.trim() });
            }
          });
        } else if (matches.trim().length > 10) {
          questions.push({ question: matches.trim() });
        }
      }
    }
    return questions;
  }

  getMissingFields(position, schedule, salary, contract, vacancies, yearsOfExperience, period, description, requirements, functions, questions) {
    const data = {
      position, schedule, salary, contract, vacancies, yearsOfExperience, 
      period, description, requirements, functions, questions
    };
    return ValidationHelpers.getMissingFields(data);
  }

  getSuggestions(position, schedule, salary, contract, vacancies, yearsOfExperience, period, description, requirements, functions, questions) {
    const data = {
      position, schedule, salary, contract, vacancies, yearsOfExperience, 
      period, description, requirements, functions, questions
    };
    return ValidationHelpers.getSuggestions(data);
  }

  async createJobIfComplete(aiResponse, restaurantContext) {
    try {
      const jobData = JobDataCleaner.prepareJobData(aiResponse.extractedData, restaurantContext);
      const jobOffer = await createJobOffer(jobData);
      
      // Store job in vector database for future RAG context
      await this.storeJobInVectorDB(jobOffer, aiResponse.extractedData, restaurantContext);
      
      aiResponse.message = `¡Perfecto! He creado la oferta de trabajo para ${aiResponse.extractedData.position}. La oferta ha sido publicada exitosamente.`;
      aiResponse.jobCreated = true;
      aiResponse.jobId = jobOffer.id;
    } catch (jobError) {
      console.error('❌ Error creating job:', jobError);
      aiResponse.message = 'Hubo un error al crear la oferta de trabajo. Por favor, intenta de nuevo.';
      aiResponse.status = 'error';
    }
  }

  /**
   * Store job offer in vector database for RAG retrieval
   */
  async storeJobInVectorDB(jobOffer, extractedData, restaurantContext) {
    try {
      // Build comprehensive job document content
      const jobContent = `
        Job Position: ${extractedData.position || jobOffer.position}
        Restaurant: ${restaurantContext.name || 'Unknown'}
        Schedule: ${extractedData.schedule || jobOffer.schedule || 'Not specified'}
        Contract Type: ${extractedData.contract || jobOffer.contract || 'Not specified'}
        Salary: ${extractedData.salary || jobOffer.salary || 'Not specified'}
        Vacancies: ${extractedData.vacancies || jobOffer.vacancies || 1}
        Years of Experience Required: ${extractedData.yearsOfExperience || jobOffer.yearsOfExperience || 0}
        Period: ${extractedData.period || 'Permanente'}
        Description: ${extractedData.description || jobOffer.description || ''}
        Requirements: ${extractedData.requirements || jobOffer.requirements || ''}
        Functions: ${extractedData.functions || jobOffer.functions || ''}
        Tips Included: ${extractedData.tips ? 'Yes' : 'No'}
        Interview Questions: ${extractedData.questions?.map(q => q.question || q).join(', ') || 'None'}
      `.trim();

      // Store in vector database with metadata
      await this.ragService.storeJobDocument(jobContent, {
        type: 'job_offer',
        jobId: jobOffer.id,
        restaurantId: restaurantContext.id || jobOffer.restaurantId,
        position: extractedData.position || jobOffer.position,
        createdAt: jobOffer.createdAt.toISOString(),
        source: 'ai_job_creation'
      });

      console.log(`✅ [MCP] Job ${jobOffer.id} stored in vector database for RAG`);
    } catch (error) {
      console.error('❌ [MCP] Error storing job in vector database:', error);
      // Don't fail job creation if vector storage fails
    }
  }
}

module.exports = ProcessJobCreationTool;
