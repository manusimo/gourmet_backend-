/**
 * OpenAI Service for Job Creation
 * Handles all OpenAI API interactions
 */

const { JOB_CREATION_SYSTEM_PROMPT } = require('./aiPrompts');

class OpenAIService {
  constructor() {
    this.openai = null;
  }

  getOpenAI() {
    if (!this.openai) {
      const OpenAI = require('openai');
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this.openai;
  }

  buildMessages(userMessage, conversationHistory, restaurantContext, ragContext) {
    const messages = [
      {
        role: 'system',
        content: this.buildSystemPrompt(restaurantContext, ragContext)
      }
    ];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        if (msg.role && msg.content) {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      });
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage
    });

    return messages;
  }

  buildSystemPrompt(restaurantContext, ragContext) {
    let systemPrompt = JOB_CREATION_SYSTEM_PROMPT;

    // Add restaurant context if available
    if (restaurantContext && restaurantContext.name) {
      systemPrompt += `\n\nCONTEXTO DEL RESTAURANTE:\nRestaurante: ${restaurantContext.name}`;
      if (restaurantContext.description) {
        systemPrompt += `\nDescripción: ${restaurantContext.description}`;
      }
    }

    // Add RAG context if available
    if (ragContext && ragContext.context) {
      systemPrompt += `\n\nINFORMACIÓN ADICIONAL:\n${ragContext.context}`;
    }

    return systemPrompt;
  }

  async callOpenAI(messages) {
    const openai = this.getOpenAI();
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      max_tokens: 2000,
      temperature: 0.7
    });

    if (!completion.choices || completion.choices.length === 0) {
      throw new Error('No response from OpenAI');
    }

    const responseText = completion.choices[0].message.content;
    console.log('📥 [MCP] OpenAI response received:', {
      hasChoices: !!completion.choices,
      choicesCount: completion.choices?.length || 0,
      responseLength: responseText?.length || 0,
      responsePreview: responseText?.substring(0, 200)
    });

    // Parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
      console.log('✅ [MCP] Successfully parsed OpenAI response:', {
        status: parsedResponse.status,
        hasMessage: !!parsedResponse.message,
        hasExtractedData: !!parsedResponse.extractedData,
        extractedDataKeys: parsedResponse.extractedData ? Object.keys(parsedResponse.extractedData) : []
      });
    } catch (parseError) {
      console.error('❌ [MCP] Failed to parse OpenAI response as JSON:', parseError.message);
      console.log('📄 [MCP] Raw response:', responseText);
      throw new Error(`Invalid JSON response from OpenAI: ${parseError.message}`);
    }

    // Validate required fields
    if (!parsedResponse.status || !parsedResponse.message) {
      throw new Error('AI response missing required fields: status or message');
    }

    return parsedResponse;
  }
}

module.exports = OpenAIService;
