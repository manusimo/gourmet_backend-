/**
 * Dynamic Tool Selector
 * Enables LLM to dynamically select and execute tools
 * This is the core of the advanced agent system
 */

const OpenAI = require('openai');
const { getToolHandler, getAllTools } = require('../../index');

class DynamicToolSelector {
  constructor() {
    this.openai = null;
  }

  getOpenAI() {
    if (!this.openai) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this.openai;
  }

  /**
   * Convert MCP tools to OpenAI function format
   * Excludes process_job_creation to avoid infinite recursion
   */
  static convertToolsToOpenAIFunctions() {
    const allTools = getAllTools();
    
    // Filter out process_job_creation to avoid recursion
    // (process_job_creation is the entry point, not a tool the LLM should call)
    const availableTools = allTools.filter(tool => tool.name !== 'process_job_creation');
    
    return availableTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }

  /**
   * Execute tool calls from LLM response
   */
  async executeToolCalls(toolCalls, restaurantContext) {
    const results = [];
    
    for (const toolCall of toolCalls) {
      try {
        const toolName = toolCall.function.name;
        let args = {};
        
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseError) {
          console.warn(`⚠️ [Dynamic] Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments);
          args = {};
        }
        
        // Add restaurant context to args if needed
        if (restaurantContext) {
          if (!args.restaurantId && restaurantContext.id) {
            args.restaurantId = restaurantContext.id;
          }
          if (!args.restaurantUserId && restaurantContext.userId) {
            args.restaurantUserId = restaurantContext.userId;
          }
        }
        
        const handler = getToolHandler(toolName);
        if (!handler) {
          console.warn(`⚠️ [Dynamic] Tool ${toolName} not found`);
          results.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolName,
            content: JSON.stringify({ error: 'Tool not found' })
          });
          continue;
        }
        
        console.log(`🔧 [Dynamic] Executing tool: ${toolName}`, args);
        const result = await handler(args, { 
          prisma: require('../../../db.js').prisma,
          restaurantContext 
        });
        
        // Extract content from MCP response format
        let content = '';
        if (result.content && result.content[0]) {
          content = result.content[0].text || JSON.stringify(result.content[0]);
        } else if (result.message) {
          content = result.message;
        } else {
          content = JSON.stringify(result);
        }
        
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: content
        });
        
        console.log(`✅ [Dynamic] Tool ${toolName} executed successfully`);
      } catch (error) {
        console.error(`❌ [Dynamic] Error executing tool ${toolCall.function.name}:`, error);
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: JSON.stringify({ error: error.message })
        });
      }
    }
    
    return results;
  }

  /**
   * Process query with dynamic tool selection
   * This is the core advanced agent logic
   */
  async processQuery(userMessage, conversationHistory, restaurantContext) {
    try {
      const openai = this.getOpenAI();
      const tools = DynamicToolSelector.convertToolsToOpenAIFunctions();
      
      // Build system prompt for fully LLM-driven advanced agent
      const systemPrompt = `You are an advanced AI assistant that helps restaurant owners manage their job postings, candidates, and operations.

You are FULLY LLM-DRIVEN - you decide everything based on the user's request. No hardcoded rules, just intelligent reasoning.

**Available Tools (you decide which to use):**

**Data & Queries:**
- get_user_restaurants: Get all restaurants a user has access to
- get_restaurant_jobs: Get jobs posted by a restaurant (supports filters, sorting, pagination)

**Job Creation:**
- create_job_offer: Create a job posting from structured data. Extract job information from the user's message, then call this tool when you have: position, schedule, contract, salary, and locationId. Ask the user for any missing information.

**Talent Matching:**
- match_best_applicants: Find best matching candidates for a job (requires jobId)

**Communication:**
- schedule_interview_call: Schedule a call with a candidate
- send_message_to_candidate: Send a message to a candidate
- create_conversation_with_candidate: Create a chat conversation with a candidate

**Your Decision Process:**
1. Understand what the user wants
2. Decide which tools to call and in what order
3. Extract any needed data from the conversation
4. Call tools as needed
5. Provide a helpful, natural response

**Job Creation Flow:**
- If user wants to CREATE a job: Extract job data (position, schedule, contract, salary, etc.) from their message
- Ask for missing information if needed
- When you have all required data (position, schedule, contract, salary, locationId), call create_job_offer
- If locationId is missing, ask the user to specify it

**Multi-step Requests:**
Handle complex requests step by step:
- "Show me my last 5 jobs, then get candidates" → Call get_restaurant_jobs first, then match_best_applicants
- "Create a chef job, then find candidates" → Call create_job_offer first, then match_best_applicants

**Current Context:**
Restaurant ID: ${restaurantContext?.id || 'Not specified'}
Restaurant Name: ${restaurantContext?.name || 'Unknown'}
Location ID: ${restaurantContext?.locationId || 'Not specified (ask user if needed)'}

Think step by step. Be helpful, conversational, and intelligent. You decide everything.`;

      // Build messages
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content || msg.message || ''
        })),
        { role: 'user', content: userMessage }
      ];

      // First call: LLM decides which tools to use
      console.log('🤖 [Dynamic] Asking LLM to select tools...');
      const response = await openai.chat.completions.create({
        model: 'gpt-4', // Use GPT-4 for better reasoning
        messages: messages,
        tools: tools,
        tool_choice: 'auto', // LLM decides
        temperature: 0.7
      });

      const assistantMessage = response.choices[0].message;
      messages.push(assistantMessage);

      // Execute tool calls if any
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`🔧 [Dynamic] LLM wants to call ${assistantMessage.tool_calls.length} tool(s)`);
        
        const toolResults = await this.executeToolCalls(assistantMessage.tool_calls, restaurantContext);
        messages.push(...toolResults);

        // Second call: LLM processes tool results and responds
        console.log('🤖 [Dynamic] Asking LLM to process tool results...');
        const finalResponse = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: messages,
          tools: tools,
          tool_choice: 'auto' // LLM can call more tools if needed
        });

        const finalMessage = finalResponse.choices[0].message;
        
        // If LLM wants to call more tools (multi-step), execute them
        if (finalMessage.tool_calls && finalMessage.tool_calls.length > 0) {
          const moreToolResults = await this.executeToolCalls(finalMessage.tool_calls, restaurantContext);
          messages.push(finalMessage, ...moreToolResults);
          
          // Get final response
          const lastResponse = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages
          });
          
          return {
            message: lastResponse.choices[0].message.content,
            toolCalls: assistantMessage.tool_calls.length + finalMessage.tool_calls.length,
            usedDynamicSelection: true,
            status: 'complete'
          };
        }
        
        return {
          message: finalMessage.content,
          toolCalls: assistantMessage.tool_calls.length,
          usedDynamicSelection: true,
          status: 'complete'
        };
      }

      // No tool calls, just respond
      return {
        message: assistantMessage.content,
        toolCalls: 0,
        usedDynamicSelection: true,
        status: 'complete'
      };

    } catch (error) {
      console.error('❌ [Dynamic] Error in dynamic tool selection:', error);
      throw error;
    }
  }
}

module.exports = DynamicToolSelector;

