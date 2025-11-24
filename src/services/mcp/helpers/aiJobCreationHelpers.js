/**
 * AI Job Creation Helpers
 * Utility functions specific to AI Job Creation Service MCP operations
 */

const withTs = (level, parts) => {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console[level](`[${ts}]`, ...parts);
};

/**
 * Validate job creation MCP result and throw if error
 */
function validateJobCreationMCPResult(mcpResult) {
  if (mcpResult && mcpResult.isError) {
    logJobCreationMCPResultError(mcpResult);
    throw new Error(mcpResult.error || 'MCP tool returned error');
  }
  
  if (mcpResult && mcpResult.success === false) {
    logJobCreationMCPResultError(mcpResult);
    throw new Error(mcpResult.error || mcpResult.message || 'MCP tool returned success: false');
  }
}

/**
 * Log job creation MCP error with appropriate detail level
 */
function logJobCreationMCPError(error, MCP_DEBUG) {
  if (MCP_DEBUG) {
    withTs('warn', ['⚠️  [AI JOB CREATION MCP] MCP client failed (stack):', error]);
  } else {
    console.warn('⚠️  [AI JOB CREATION MCP] MCP client failed, falling back to direct handler:', error.message);
  }
}

/**
 * Log job creation MCP result error details
 */
function logJobCreationMCPResultError(mcpResult) {
  if (mcpResult.isError) {
    console.log('🚨 [AI JOB CREATION MCP] MCP tool returned error:', {
      isError: mcpResult.isError,
      content: mcpResult.content,
      contentLength: mcpResult.content?.length,
      firstContent: mcpResult.content?.[0]
    });
  } else if (mcpResult.success === false) {
    console.error('🚨 [AI JOB CREATION MCP] MCP tool returned success: false:', {
      error: mcpResult.error,
      message: mcpResult.message
    });
  }
}

/**
 * Create standard error AI response
 */
function createErrorAIResponse() {
  return {
    status: "error",
    message: "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
    extractedData: {},
    missingFields: [],
    suggestions: []
  };
}

/**
 * Parse error response from MCP tool
 */
function parseErrorResponse(response) {
  const txt = response?.content?.[0]?.text || 'Tool error';
  
  // Try to parse the error message if it's JSON
  try {
    const parsedError = JSON.parse(txt);
    if (parsedError.success === false) {
      return {
        status: "error",
        message: parsedError.error || parsedError.message || "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
        extractedData: parsedError.extractedData || {},
        missingFields: parsedError.missingFields || [],
        suggestions: parsedError.suggestions || []
      };
    }
  } catch {
    // If not JSON, use as plain error message
  }
  
  throw new Error(typeof txt === 'string' ? txt : 'Tool error');
}

/**
 * Extract and parse text content from MCP response
 */
function parseResponseContent(response) {
  const txt = response?.content?.[0]?.text;
  if (!txt) {
    return null;
  }
  
  // Handle both stringified JSON and direct object responses
  if (typeof txt === 'string') {
    try {
      return JSON.parse(txt);
    } catch (parseError) {
      console.error('❌ [AI JOB CREATION MCP] Failed to parse JSON response:', parseError.message);
      console.error('❌ [AI JOB CREATION MCP] Raw response text:', txt.substring(0, 500));
      return null;
    }
  } else if (typeof txt === 'object') {
    return txt;
  }
  
  return null;
}

/**
 * Handle parsed response with success: false
 */
function handleFailedResponse(parsed) {
  console.error('❌ [AI JOB CREATION MCP] Parsed response has success: false:', {
    error: parsed.error,
    message: parsed.message
  });
  
  return {
    status: "error",
    message: parsed.error || parsed.message || "Lo siento, estoy teniendo dificultades técnicas. ¿Podrías intentar de nuevo?",
    extractedData: parsed.extractedData || {},
    missingFields: parsed.missingFields || [],
    suggestions: parsed.suggestions || []
  };
}

/**
 * Parse MCP-style response into job creation format
 */
function parseJobCreationMCPStyleResponse(response, createErrorAIResponseFn) {
  try {
    // Handle error responses
    if (response?.isError) {
      return parseErrorResponse(response);
    }
    
    // Parse content
    const parsed = parseResponseContent(response);
    if (!parsed) {
      return createErrorAIResponseFn();
    }
    
    // Handle success: false responses
    if (parsed.success === false) {
      return handleFailedResponse(parsed);
    }
    
    return parsed;
  } catch (e) {
    console.error('❌ [AI JOB CREATION MCP] Failed to parse tool response:', e.message || e);
    return createErrorAIResponseFn();
  }
}

module.exports = {
  validateJobCreationMCPResult,
  logJobCreationMCPError,
  logJobCreationMCPResultError,
  createErrorAIResponse,
  parseJobCreationMCPStyleResponse
};

