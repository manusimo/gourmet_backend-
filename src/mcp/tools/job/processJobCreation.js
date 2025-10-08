const { createJobOffer } = require('../../../helpers/jobHelpers.js');
const BaseTool = require('../baseTool');
const OpenAI = require('openai');
const { JOB_CREATION_SYSTEM_PROMPT } = require('./aiPrompts');
const JobDataCleaner = require('./dataCleaner');
const { JobRAGService } = require('../../../services/rag');

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
      console.log('🤖 [MCP] Processing job creation request:', {
        userMessage,
        conversationHistoryLength: conversationHistory.length,
        restaurantContext: restaurantContext ? 'present' : 'missing',
        hasPrisma: !!prisma
      });
      
      // Check OpenAI API key
      const apiKey = process.env.OPENAI_API_KEY;
      console.log('🔑 [MCP] OpenAI API Key check:', {
        hasApiKey: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none'
      });
      
      // Try to get RAG context, but don't fail if it doesn't work
      console.log('📚 [MCP] Getting RAG context...');
      let ragContext = { context: '', sources: [] };
      try {
        ragContext = await this.getRAGContext(userMessage, restaurantContext);
        console.log('📚 [MCP] RAG context retrieved:', {
          hasContext: !!ragContext.context,
          contextLength: ragContext.context ? ragContext.context.length : 0,
          sourcesCount: ragContext.sources ? ragContext.sources.length : 0
        });
      } catch (ragError) {
        console.log('⚠️ [MCP] RAG context failed, continuing without it:', ragError.message);
      }
      
      // Try OpenAI first, fallback to simple parsing if it fails
      let aiResponse;
      try {
        // Build messages for OpenAI with RAG context
        console.log('💬 [MCP] Building messages for OpenAI...');
        const messages = this.buildMessages(userMessage, conversationHistory, restaurantContext, ragContext);
        console.log('💬 [MCP] Messages built:', {
          messagesCount: messages.length,
          systemPromptLength: messages[0]?.content?.length || 0,
          userMessageLength: messages[messages.length - 1]?.content?.length || 0
        });

        // Call OpenAI with enhanced context
        console.log('🚀 [MCP] Calling OpenAI API...');
        aiResponse = await this.callOpenAI(messages);
        console.log('🚀 [MCP] OpenAI response received:', {
          hasResponse: !!aiResponse,
          status: aiResponse?.status,
          hasMessage: !!aiResponse?.message,
          hasExtractedData: !!aiResponse?.extractedData
        });
      } catch (openaiError) {
        console.log('⚠️ [MCP] OpenAI failed, using fallback parser:', openaiError.message);
        aiResponse = this.createFallbackResponse(userMessage, restaurantContext);
        console.log('🔄 [MCP] Fallback response created:', {
          status: aiResponse.status,
          hasMessage: !!aiResponse.message
        });
      }
      
      // Clean extracted data
      if (aiResponse.extractedData) {
        console.log('🧹 [MCP] Cleaning extracted data...');
        aiResponse.extractedData = JobDataCleaner.cleanExtractedData(aiResponse.extractedData);
        console.log('🧹 [MCP] Data cleaned successfully');
      }

      // If complete, create the job
      if (aiResponse.status === 'complete' && aiResponse.extractedData) {
        console.log('💼 [MCP] Creating job offer...');
        await this.createJobIfComplete(aiResponse, restaurantContext);
        console.log('💼 [MCP] Job creation completed');
      }

      console.log('✅ [MCP] Processing completed successfully');
      return this.createSuccessResponse(aiResponse);

    } catch (error) {
      console.error('❌ [MCP] Error processing job creation:', {
        error: error.message,
        stack: error.stack,
        name: error.name,
        args: { userMessage, conversationHistoryLength: conversationHistory.length, hasRestaurantContext: !!restaurantContext }
      });
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
        model: "gpt-4",
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
          hasExtractedData: !!parsedResponse.extractedData
        });
        return parsedResponse;
      } catch (parseError) {
        console.error('❌ [MCP] Error parsing AI response:', {
          error: parseError.message,
          responseText: responseText.substring(0, 500)
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

  createFallbackResponse(userMessage, restaurantContext) {
    console.log('🔄 [MCP] Creating fallback response for:', userMessage);
    
    // Simple keyword-based parsing
    const lowerMessage = userMessage.toLowerCase();
    const position = this.extractPositionFromMessage(lowerMessage);
    const salary = this.extractSalaryFromMessage(lowerMessage);
    
    return {
      status: 'incomplete',
      message: `Entiendo que quieres crear un trabajo para ${position || 'una posición'}. Para completar la oferta, necesito más información: ¿Cuál es el horario de trabajo (tiempo completo, medio tiempo)? ¿Cuál es el salario ofrecido? ¿Qué experiencia se requiere?`,
      extractedData: {
        position: position || '',
        schedule: '',
        contract: '',
        salary: salary || 0,
        propina: 'No',
        vacancies: 1,
        yearsOfExperience: 0,
        period: 'Permanente',
        description: '',
        requirements: '',
        functions: '',
        questions: []
      },
      missingFields: ['schedule', 'salary', 'yearsOfExperience', 'description', 'requirements'],
      suggestions: [
        'Especifica el horario de trabajo (Full-time, Part-time)',
        'Menciona el salario ofrecido',
        'Indica los años de experiencia requeridos',
        'Describe las funciones principales del puesto'
      ]
    };
  }

  extractPositionFromMessage(message) {
    const positions = {
      'garzon': 'Garzón',
      'waiter': 'Garzón',
      'chef': 'Chef',
      'cook': 'Chef',
      'bartender': 'Bartender',
      'barista': 'Barista',
      'delivery': 'Delivery',
      'cajero': 'Cajero',
      'cashier': 'Cajero',
      'anfitrion': 'Anfitrión',
      'host': 'Anfitrión',
      'limpieza': 'Limpieza',
      'cleaner': 'Limpieza'
    };
    
    for (const [key, value] of Object.entries(positions)) {
      if (message.includes(key)) {
        return value;
      }
    }
    return 'Posición no especificada';
  }

  extractSalaryFromMessage(message) {
    const salaryMatch = message.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    if (salaryMatch) {
      return parseInt(salaryMatch[1].replace(/,/g, ''));
    }
    return 0;
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
