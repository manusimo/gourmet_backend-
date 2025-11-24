/**
 * LangGraph Agent
 * Advanced agent system using LangGraph for state management and workflow orchestration
 * This is the main agent service, not a tool helper
 */

const { StateGraph, END } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");
const { ToolNode } = require("@langchain/langgraph/prebuilt");
const { StructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { getToolHandler, getAllTools } = require('../../../mcp/tools/index');
const { buildLangGraphSystemPrompt } = require('./prompts/langGraphAgentPrompts');

class LangGraphAgent {
  constructor() {
    this.model = null;
    this.tools = null;
    this.agent = null;
    this.restaurantContext = null;
    this.initializeAgent();
  }

  /**
   * Initialize the LangGraph agent
   */
  initializeAgent() {
    // Initialize OpenAI model
    this.model = new ChatOpenAI({
      model: "gpt-4",
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Convert MCP tools to LangChain tools
    this.tools = this.convertMCPToolsToLangChain();

    // Bind tools to model
    this.modelWithTools = this.model.bindTools(this.tools);

    // Create the graph
    const workflow = new StateGraph({
      channels: {
        messages: {
          reducer: (x, y) => x.concat(y),
          default: () => [],
        },
        restaurantContext: {
          default: () => null,
        },
      },
    })
      .addNode("agent", this.agentNode.bind(this))
      .addNode("tools", this.toolsNode.bind(this))
      .addEdge("agent", "tools")
      .addConditionalEdges(
        "tools",
        this.shouldContinue.bind(this),
        {
          continue: "agent",
          end: END,
        }
      )
      .setEntryPoint("agent");

    this.agent = workflow.compile();
  }

  /**
   * Convert MCP tools to LangChain StructuredTool instances
   * This is a transformer/adapter that bridges MCP format and LangChain format
   * 
   * Why we need this:
   * - MCP tools use BaseTool class with custom format
   * - LangGraph expects LangChain StructuredTool instances
   * - We keep MCP tools as single source of truth (works with MCP server too)
   * - Transformer creates lightweight wrappers for LangGraph
   */
  convertMCPToolsToLangChain() {
    const mcpTools = getAllTools();
    
    // Filter out process_job_creation to avoid recursion
    const availableTools = mcpTools.filter(tool => tool.name !== 'process_job_creation');

    // Convert each MCP tool to LangChain StructuredTool
    return availableTools.map(tool => {
      // Convert JSON Schema to Zod schema for LangChain
      const zodSchema = this.jsonSchemaToZod(tool.inputSchema);
      
      return new StructuredTool({
        name: tool.name,
        description: tool.description,
        schema: zodSchema,
        func: async (args) => {
          const handler = getToolHandler(tool.name);
          if (!handler) {
            throw new Error(`Tool ${tool.name} not found`);
          }
          
          // Execute the MCP tool handler
          const result = await handler(args, {
            prisma: require('../../../db.js').prisma,
            restaurantContext: this.restaurantContext
          });
          
          // Extract content from MCP response format and convert to string
          // MCP format: { content: [{ type: 'text', text: '...' }] }
          // LangChain expects: plain string
          if (result.content && result.content[0]) {
            return result.content[0].text || JSON.stringify(result.content[0]);
          } else if (result.message) {
            return result.message;
          } else {
            return JSON.stringify(result);
          }
        }
      });
    });
  }

  /**
   * Convert JSON Schema to Zod schema
   * Simple conversion for common types
   */
  jsonSchemaToZod(jsonSchema) {
    // For now, return object schema - LangChain will handle validation
    // In the future, we could do full JSON Schema → Zod conversion
    return z.object({}).passthrough(); // Accept any object, pass through
  }

  /**
   * Agent node - decides which tools to call
   */
  async agentNode(state) {
    const { messages, restaurantContext } = state;
    
    // Store restaurant context for tool execution
    this.restaurantContext = restaurantContext;

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(restaurantContext);
    
    // Add system message if not present
    const allMessages = messages.length > 0 && messages[0].getType() === 'system'
      ? messages
      : [new SystemMessage(systemPrompt), ...messages];

    // Get response from model
    const response = await this.modelWithTools.invoke(allMessages);
    
    return {
      messages: [response],
    };
  }

  /**
   * Tools node - executes tools
   */
  async toolsNode(state) {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    
    // Execute tools if any
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      const toolNode = new ToolNode(this.tools);
      const toolResults = await toolNode.invoke({ messages: [lastMessage] });
      return { messages: toolResults.messages };
    }
    
    return { messages: [] };
  }

  /**
   * Decide whether to continue or end
   */
  shouldContinue(state) {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    
    // If no tool calls, we're done
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return "end";
    }
    
    // Otherwise, continue to agent
    return "continue";
  }

  /**
   * Build system prompt
   */
  buildSystemPrompt(restaurantContext) {
    return buildLangGraphSystemPrompt(restaurantContext);
  }

  /**
   * Process a query using LangGraph
   */
  async processQuery(userMessage, conversationHistory = [], restaurantContext = {}) {
    try {
      // Convert conversation history to LangChain messages
      const messages = conversationHistory.map(msg => {
        if (msg.type === 'user' || msg.role === 'user') {
          return new HumanMessage(msg.content || msg.message || '');
        } else {
          return new AIMessage(msg.content || msg.message || '');
        }
      });

      // Add current user message
      messages.push(new HumanMessage(userMessage));

      // Run the agent
      const result = await this.agent.invoke({
        messages: messages,
        restaurantContext: restaurantContext,
      });

      // Extract final message
      const finalMessages = result.messages;
      const lastMessage = finalMessages[finalMessages.length - 1];

      // Get response content
      let responseContent = '';
      if (lastMessage.content) {
        responseContent = lastMessage.content;
      } else if (lastMessage.text) {
        responseContent = lastMessage.text;
      }

      // Count tool calls
      const toolCalls = finalMessages.filter(msg => 
        msg.tool_calls && msg.tool_calls.length > 0
      ).reduce((sum, msg) => sum + (msg.tool_calls?.length || 0), 0);

      return {
        message: responseContent,
        toolCalls: toolCalls,
        usedDynamicSelection: true,
        status: 'complete',
        messages: finalMessages,
      };
    } catch (error) {
      console.error('❌ [LangGraph] Error processing query:', error);
      throw error;
    }
  }
}

module.exports = LangGraphAgent;

