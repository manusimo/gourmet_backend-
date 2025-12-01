0/**
 * ENHANCED LangGraph Agent Example
 * This shows what you COULD add to StateGraph for more robust workflows
 * 
 * This is an EXAMPLE file - not meant to be used directly
 * Shows concepts: error handling, validation, retry logic, human approval, etc.
 */

const { StateGraph, END } = require("@langchain/langgraph");

class EnhancedLangGraphAgent {
  initializeAgent() {
    // Enhanced state with more channels
    const workflow = new StateGraph({
      channels: {
        // Standard message channel
        messages: {
          reducer: (x, y) => x.concat(y),
          default: () => [],
        },
        
        // Custom context
        restaurantContext: {
          default: () => null,
        },
        
        // NEW: Track errors and retries
        errors: {
          reducer: (x, y) => x.concat(y),
          default: () => [],
        },
        retryCount: {
          default: () => 0,
        },
        
        // NEW: Track tool execution results
        toolResults: {
          reducer: (x, y) => x.concat(y),
          default: () => [],
        },
        
        // NEW: Track validation status
        validationStatus: {
          default: () => ({ valid: true, errors: [] }),
        },
        
        // NEW: Human approval needed?
        needsApproval: {
          default: () => false,
        },
        
        // NEW: Max iterations to prevent infinite loops
        iterationCount: {
          default: () => 0,
        },
      },
    })
      // Standard nodes
      .addNode("agent", this.agentNode.bind(this))
      .addNode("tools", this.toolsNode.bind(this))
      
      // NEW: Validation node - check tool inputs before execution
      .addNode("validate", this.validateNode.bind(this))
      
      // NEW: Error handler - catch and handle errors
      .addNode("errorHandler", this.errorHandlerNode.bind(this))
      
      // NEW: Retry node - retry failed operations
      .addNode("retry", this.retryNode.bind(this))
      
      // NEW: Human approval node - for sensitive operations
      .addNode("humanApproval", this.humanApprovalNode.bind(this))
      
      // NEW: Rate limiter - prevent too many API calls
      .addNode("rateLimit", this.rateLimitNode.bind(this))
      
      // Flow: agent → validate → tools → check results
      .addEdge("agent", "validate")
      .addConditionalEdges(
        "validate",
        this.shouldProceedAfterValidation.bind(this),
        {
          valid: "rateLimit",      // Valid → check rate limits
          invalid: "agent",        // Invalid → ask agent to fix
          needsApproval: "humanApproval", // Sensitive → get approval
        }
      )
      .addEdge("rateLimit", "tools")
      
      // After tools, check for errors
      .addConditionalEdges(
        "tools",
        this.checkToolResults.bind(this),
        {
          success: "agent",        // Success → back to agent
          error: "errorHandler",   // Error → handle it
          retry: "retry",          // Retryable → retry
          end: END,                // Done → end
        }
      )
      
      // Error handler routes
      .addConditionalEdges(
        "errorHandler",
        this.shouldRetry.bind(this),
        {
          retry: "retry",
          abort: END,
          continue: "agent", // Try different approach
        }
      )
      
      // Retry routes
      .addConditionalEdges(
        "retry",
        this.shouldContinueAfterRetry.bind(this),
        {
          continue: "tools", // Retry the tools
          maxRetries: END,   // Give up after max retries
        }
      )
      
      // Human approval routes
      .addConditionalEdges(
        "humanApproval",
        this.checkApprovalStatus.bind(this),
        {
          approved: "tools",  // Approved → execute
          rejected: "agent",  // Rejected → inform agent
          pending: "humanApproval", // Still waiting
        }
      )
      
      // Safety: prevent infinite loops
      .addConditionalEdges(
        "agent",
        this.checkMaxIterations.bind(this),
        {
          continue: "validate",
          maxIterations: END,
        }
      )
      
      .setEntryPoint("agent");

    this.agent = workflow.compile();
  }

  /**
   * NEW: Validation node
   * Check if tool inputs are valid before execution
   */
  async validateNode(state) {
    const { messages, restaurantContext } = state;
    const lastMessage = messages[messages.length - 1];
    
    const validationErrors = [];
    
    // Check if tool calls are present
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      for (const toolCall of lastMessage.tool_calls) {
        // Example: Validate create_job_offer requires all fields
        if (toolCall.name === 'create_job_offer') {
          const args = toolCall.args;
          const required = ['position', 'schedule', 'contract', 'salary', 'locationId'];
          const missing = required.filter(field => !args[field]);
          
          if (missing.length > 0) {
            validationErrors.push(`Missing required fields: ${missing.join(', ')}`);
          }
        }
        
        // Example: Check for sensitive operations
        if (['delete_job', 'update_salary'].includes(toolCall.name)) {
          return {
            validationStatus: { valid: false, needsApproval: true, errors: [] },
            needsApproval: true,
          };
        }
      }
    }
    
    return {
      validationStatus: {
        valid: validationErrors.length === 0,
        errors: validationErrors,
      },
    };
  }

  /**
   * NEW: Error handler node
   * Catch and handle errors gracefully
   */
  async errorHandlerNode(state) {
    const { errors, messages } = state;
    const lastError = errors[errors.length - 1];
    
    // Log error
    console.error('❌ [LangGraph] Error:', lastError);
    
    // Determine if error is retryable
    const retryableErrors = ['TIMEOUT', 'RATE_LIMIT', 'NETWORK_ERROR'];
    const isRetryable = retryableErrors.some(type => 
      lastError.type && lastError.type.includes(type)
    );
    
    // Add error message to conversation
    const errorMessage = new AIMessage({
      content: `I encountered an error: ${lastError.message}. ${isRetryable ? 'I can retry this.' : 'This may require a different approach.'}`,
    });
    
    return {
      messages: [errorMessage],
      errors: [{ ...lastError, handled: true }],
    };
  }

  /**
   * NEW: Retry node
   * Retry failed operations with exponential backoff
   */
  async retryNode(state) {
    const { retryCount, errors } = state;
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      return {
        messages: [new AIMessage({
          content: "I've tried multiple times but couldn't complete this. Please try again later or contact support.",
        })],
      };
    }
    
    // Exponential backoff
    const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return {
      retryCount: retryCount + 1,
    };
  }

  /**
   * NEW: Human approval node
   * For sensitive operations that need human confirmation
   */
  async humanApprovalNode(state) {
    const { messages, needsApproval } = state;
    
    if (!needsApproval) {
      return {}; // Already approved or not needed
    }
    
    // In a real implementation, this would:
    // 1. Send notification to user/admin
    // 2. Wait for approval
    // 3. Update state with approval status
    
    // For now, simulate approval check
    const approvalStatus = await this.checkApprovalFromUser(state);
    
    return {
      needsApproval: !approvalStatus.approved,
      // Store approval in state
    };
  }

  /**
   * NEW: Rate limiter node
   * Prevent too many API calls
   */
  async rateLimitNode(state) {
    const { messages, iterationCount } = state;
    const maxCallsPerMinute = 10;
    
    // Check rate limit (simplified - in real app, use Redis or similar)
    const recentCalls = this.getRecentCalls();
    if (recentCalls.length >= maxCallsPerMinute) {
      // Wait before proceeding
      await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
    }
    
    this.recordCall();
    
    return {};
  }

  /**
   * Routing functions
   */
  shouldProceedAfterValidation(state) {
    const { validationStatus, needsApproval } = state;
    
    if (needsApproval) return "needsApproval";
    if (!validationStatus.valid) return "invalid";
    return "valid";
  }

  checkToolResults(state) {
    const { messages, errors, retryCount } = state;
    const lastMessage = messages[messages.length - 1];
    
    // Check if there are errors
    if (errors.length > 0 && errors[errors.length - 1].handled === false) {
      return "error";
    }
    
    // Check if we should retry
    if (retryCount > 0 && retryCount < 3) {
      return "retry";
    }
    
    // Check if agent is done (no more tool calls)
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return "end";
    }
    
    return "success";
  }

  shouldRetry(state) {
    const { errors, retryCount } = state;
    const lastError = errors[errors.length - 1];
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      return "abort";
    }
    
    // Check if error is retryable
    if (lastError?.retryable) {
      return "retry";
    }
    
    return "continue";
  }

  shouldContinueAfterRetry(state) {
    const { retryCount } = state;
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      return "maxRetries";
    }
    
    return "continue";
  }

  checkApprovalStatus(state) {
    // In real implementation, check if user has approved
    // For now, assume approved after waiting
    return "approved";
  }

  checkMaxIterations(state) {
    const { iterationCount } = state;
    const maxIterations = 20; // Prevent infinite loops
    
    if (iterationCount >= maxIterations) {
      return "maxIterations";
    }
    
    return "continue";
  }

  // Helper methods
  async checkApprovalFromUser(state) {
    // In real app: check database, webhook, etc.
    return { approved: true };
  }

  getRecentCalls() {
    // In real app: query Redis or database
    return [];
  }

  recordCall() {
    // In real app: record in Redis or database
  }
}

module.exports = EnhancedLangGraphAgent;

