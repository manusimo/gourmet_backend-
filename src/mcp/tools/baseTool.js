/**
 * Base Tool Class
 * Provides common functionality for all MCP tools
 */

class BaseTool {
  constructor(name, description, inputSchema) {
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
  }

  /**
   * Get tool definition
   */
  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema
    };
  }

  /**
   * Validate input arguments
   */
  validateArgs(args) {
    const required = this.inputSchema.required || [];
    const missing = required.filter(field => !(field in args));
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    
    return true;
  }

  /**
   * Create success response
   */
  createSuccessResponse(data) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...data
          }, null, 2)
        }
      ]
    };
  }

  /**
   * Create error response
   */
  createErrorResponse(error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message
          }, null, 2)
        }
      ],
      isError: true
    };
  }

  /**
   * Execute tool with validation and error handling
   */
  async execute(args, context) {
    try {
      this.validateArgs(args);
      return await this.handle(args, context);
    } catch (error) {
      console.error(`❌ [MCP] Error in tool ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Abstract method to be implemented by subclasses
   */
  async handle(args, context) {
    throw new Error(`Tool ${this.name} must implement handle method`);
  }
}

module.exports = BaseTool;
