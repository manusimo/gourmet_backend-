/**
 * Shared RAG Utilities
 * Common utilities for all agent-specific RAG services
 */

/**
 * Extract keywords from text for better RAG queries
 */
function extractKeywords(text, keywordLists = {}) {
  const keywords = [];
  const lowerText = text.toLowerCase();
  
  // Default keyword lists
  const defaultLists = {
    positions: ['waiter', 'chef', 'bartender', 'manager', 'host', 'delivery'],
    time: ['tomorrow', 'today', 'morning', 'afternoon', 'evening'],
    actions: ['create', 'schedule', 'interview', 'hire', 'call']
  };
  
  const lists = { ...defaultLists, ...keywordLists };
  
  Object.values(lists).forEach(keywordList => {
    keywordList.forEach(keyword => {
      if (lowerText.includes(keyword.toLowerCase())) {
        keywords.push(keyword);
      }
    });
  });
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Build enhanced query for RAG retrieval
 */
function buildEnhancedQuery(userMessage, context = {}, keywordLists = {}) {
  const keywords = extractKeywords(userMessage, keywordLists);
  const contextKeys = Object.keys(context).filter(key => context[key]);
  
  const queryParts = [
    userMessage,
    ...keywords,
    ...contextKeys.map(key => `${key}: ${context[key]}`)
  ];
  
  return queryParts.join(' ').trim();
}

/**
 * Format RAG context for AI prompts
 */
function formatRAGContext(ragResult, contextType = 'general') {
  if (!ragResult.context || !ragResult.context.trim()) {
    return '';
  }
  
  const contextHeader = `CONTEXTO ENRIQUECIDO (${contextType.toUpperCase()}):`;
  return `\n\n${contextHeader}\n${ragResult.context}`;
}

/**
 * Validate RAG result quality
 */
function validateRAGResult(ragResult, minSources = 1, minSimilarity = 0.7) {
  if (!ragResult.sources || ragResult.sources.length < minSources) {
    return { isValid: false, reason: 'insufficient_sources' };
  }
  
  const avgSimilarity = ragResult.sources.reduce((sum, source) => sum + source.similarity, 0) / ragResult.sources.length;
  if (avgSimilarity < minSimilarity) {
    return { isValid: false, reason: 'low_similarity' };
  }
  
  return { isValid: true };
}

/**
 * Get fallback context when RAG fails
 */
function getFallbackContext(agentType) {
  const fallbacks = {
    job_creation: `
Job Creation Best Practices:
- Include clear position title and responsibilities
- Specify work schedule and contract type
- Mention salary range and benefits
- List required experience and skills
- Include restaurant culture information
- Add interview questions for assessment
`,
    call_scheduling: `
Call Scheduling Best Practices:
- Consider timezone differences
- Schedule during business hours
- Allow adequate time for interviews
- Send calendar invites with details
- Confirm appointments in advance
`,
    interview: `
Interview Best Practices:
- Prepare relevant questions
- Assess candidate skills and experience
- Evaluate cultural fit
- Provide clear feedback
- Follow up promptly
`
  };
  
  return fallbacks[agentType] || 'General best practices available.';
}

/**
 * Calculate context relevance score
 */
function calculateRelevanceScore(ragResult, query) {
  if (!ragResult.sources || ragResult.sources.length === 0) {
    return 0;
  }
  
  const avgSimilarity = ragResult.sources.reduce((sum, source) => sum + source.similarity, 0) / ragResult.sources.length;
  const avgQuality = ragResult.sources.reduce((sum, source) => sum + source.qualityScore, 0) / ragResult.sources.length;
  
  // Weighted score: 70% similarity, 30% quality
  return (avgSimilarity * 0.7) + (avgQuality * 0.3);
}

module.exports = {
  extractKeywords,
  buildEnhancedQuery,
  formatRAGContext,
  validateRAGResult,
  getFallbackContext,
  calculateRelevanceScore
};
