/**
 * Helper functions for Job Creation Processing
 * Separated for better maintainability and testing
 */

class ProcessJobCreationHelpers {
  static logRequestStart(userMessage, conversationHistory, restaurantContext) {
    console.log('🤖 [MCP] Processing job creation request:', {
      userMessage,
      conversationHistoryLength: conversationHistory.length,
      restaurantContext: restaurantContext ? 'present' : 'missing'
    });
  }

  static validateOpenAIApiKey() {
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('🔑 [MCP] OpenAI API Key check:', {
      hasApiKey: !!apiKey,
      keyLength: apiKey ? apiKey.length : 0,
      keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none'
    });
    
    if (!apiKey) {
      throw new Error('OpenAI API key not found');
    }
  }

  static async getRAGContextSafely(ragService, userMessage, restaurantContext) {
    console.log('📚 [MCP] Getting RAG context...');
    try {
      const ragContext = await ragService.getJobCreationContext(userMessage, restaurantContext);
      console.log('📚 [MCP] RAG context retrieved:', {
        hasContext: !!ragContext.context,
        contextLength: ragContext.context?.length || 0,
        sourcesCount: ragContext.sources?.length || 0
      });
      return ragContext;
    } catch (ragError) {
      console.log('⚠️ [MCP] RAG context failed, continuing without it:', ragError.message);
      return { context: '', sources: [] };
    }
  }

  static async processWithOpenAI(openaiService, userMessage, conversationHistory, restaurantContext, ragContext) {
    console.log('💬 [MCP] Building messages for OpenAI...');
    const messages = openaiService.buildMessages(userMessage, conversationHistory, restaurantContext, ragContext);
    console.log('💬 [MCP] Messages built:', {
      messagesCount: messages.length,
      systemPromptLength: messages[0]?.content?.length || 0,
      userMessageLength: messages[messages.length - 1]?.content?.length || 0
    });

    console.log('🚀 [MCP] Calling OpenAI API...');
    const aiResponse = await openaiService.callOpenAI(messages);
    console.log('🚀 [MCP] OpenAI response received:', {
      hasResponse: !!aiResponse,
      status: aiResponse?.status,
      hasMessage: !!aiResponse?.message,
      hasExtractedData: !!aiResponse?.extractedData
    });
    
    return aiResponse;
  }

  static cleanAndValidateResponse(aiResponse, JobDataCleaner) {
    if (aiResponse.extractedData) {
      console.log('🧹 [MCP] Cleaning extracted data...');
      aiResponse.extractedData = JobDataCleaner.cleanExtractedData(aiResponse.extractedData);
      console.log('🧹 [MCP] Data cleaned successfully');
    }
    return aiResponse;
  }

  static logError(error, userMessage, conversationHistory, restaurantContext) {
    console.error('❌ [MCP] Error processing job creation:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      args: { 
        userMessage, 
        conversationHistoryLength: conversationHistory.length, 
        hasRestaurantContext: !!restaurantContext 
      }
    });
  }
}

module.exports = ProcessJobCreationHelpers;
