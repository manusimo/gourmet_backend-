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
      });
    }
    return this.openai;
  }

  async handle(args, { prisma }) {
    const { userMessage, conversationHistory = [], restaurantContext } = args;
    
    try {
      console.log('🤖 [MCP] Processing job creation request:', userMessage);
      
      // Get RAG context for enhanced job creation
      const ragContext = await this.getRAGContext(userMessage, restaurantContext);
      
      // Build messages for OpenAI with RAG context
      const messages = this.buildMessages(userMessage, conversationHistory, restaurantContext, ragContext);

      // Call OpenAI with enhanced context
      const aiResponse = await this.callOpenAI(messages);
      
      // Clean extracted data
      if (aiResponse.extractedData) {
        aiResponse.extractedData = JobDataCleaner.cleanExtractedData(aiResponse.extractedData);
      }

      // If complete, create the job
      if (aiResponse.status === 'complete' && aiResponse.extractedData) {
        await this.createJobIfComplete(aiResponse, restaurantContext);
      }

      return this.createSuccessResponse(aiResponse);

    } catch (error) {
      console.error('❌ [MCP] Error processing job creation:', error);
      return this.createErrorResponse('Failed to process job creation request');
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
    const completion = await this.getOpenAI().chat.completions.create({
      model: "gpt-4",
      messages: messages,
      max_tokens: 2000,
      temperature: 0.7
    });

    const responseText = completion.choices[0].message.content;
    
    // Parse AI response
    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Error parsing AI response:', parseError);
      throw new Error('Error processing AI response');
    }
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
