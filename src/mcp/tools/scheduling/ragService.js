const BaseRAGService = require('../shared/baseRAGService');

/**
 * Call Scheduling RAG Service
 * Specialized RAG service for call scheduling agent
 */
class SchedulingRAGService extends BaseRAGService {
  constructor() {
    super('call_scheduling');
  }

  /**
   * Get enhanced context for call scheduling
   */
  async getSchedulingContext(userMessage, restaurantContext) {
    try {
      // Create comprehensive query for scheduling
      const query = this.buildSchedulingQuery(userMessage, restaurantContext);
      
      // Get relevant context
      const ragResult = await this.getContextForAgent(query);
      
      // Enhance with scheduling-specific context
      const enhancedContext = this.enhanceSchedulingContext(ragResult, restaurantContext);
      
      console.log(`📚 [Scheduling-RAG] Retrieved ${ragResult.sources.length} scheduling-related documents`);
      
      return enhancedContext;
    } catch (error) {
      console.error('❌ [Scheduling-RAG] Error getting scheduling context:', error);
      return { context: '', sources: [] };
    }
  }

  /**
   * Build comprehensive query for call scheduling
   */
  buildSchedulingQuery(userMessage, restaurantContext) {
    const restaurantName = restaurantContext.name || '';
    const timeContext = this.extractTimeContext(userMessage);
    
    return `${timeContext} ${restaurantName} call scheduling interview appointment calendar timezone`;
  }

  /**
   * Extract time-related context from user message
   */
  extractTimeContext(userMessage) {
    const timeKeywords = [
      'tomorrow', 'today', 'next week', 'morning', 'afternoon', 'evening',
      'mañana', 'hoy', 'semana', 'mañana', 'tarde', 'noche',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'weekend'
    ];
    
    const lowerMessage = userMessage.toLowerCase();
    const foundTime = timeKeywords.find(keyword => lowerMessage.includes(keyword));
    
    return foundTime || 'interview scheduling';
  }

  /**
   * Enhance context with scheduling-specific information
   */
  enhanceSchedulingContext(ragResult, restaurantContext) {
    let enhancedContext = ragResult.context;
    
    // Add restaurant-specific context
    if (restaurantContext.name) {
      enhancedContext += `\n\nRestaurant: ${restaurantContext.name}`;
    }
    
    // Add scheduling best practices if no context found
    if (!enhancedContext.trim()) {
      enhancedContext = this.getDefaultSchedulingContext();
    }
    
    return {
      ...ragResult,
      context: enhancedContext
    };
  }

  /**
   * Default scheduling context when no RAG results found
   */
  getDefaultSchedulingContext() {
    return `
Call Scheduling Best Practices:
- Consider timezone differences for remote candidates
- Schedule during business hours (9 AM - 6 PM)
- Allow 30-60 minutes for interview duration
- Send calendar invites with meeting details
- Include pre-interview preparation instructions
- Confirm appointment 24 hours before
- Have backup time slots available
- Consider restaurant's busiest hours for scheduling
`;
  }

  /**
   * Calculate scheduling-specific quality score
   */
  calculateAgentSpecificQuality(content, metadata) {
    let score = 0;
    
    // Scheduling-specific content indicators
    if (content.toLowerCase().includes('timezone')) score += 0.1;
    if (content.toLowerCase().includes('calendar')) score += 0.1;
    if (content.toLowerCase().includes('appointment')) score += 0.1;
    if (content.toLowerCase().includes('interview')) score += 0.1;
    if (content.toLowerCase().includes('schedule')) score += 0.1;
    
    // Scheduling template indicators
    if (metadata.type === 'scheduling_template') score += 0.2;
    if (metadata.type === 'timezone_data') score += 0.15;
    if (metadata.type === 'calendar_patterns') score += 0.1;
    
    return score;
  }

  /**
   * Store scheduling-specific document
   */
  async storeSchedulingDocument(content, metadata = {}) {
    const schedulingMetadata = {
      ...metadata,
      type: metadata.type || 'scheduling_template',
      category: 'call_scheduling'
    };
    
    return await this.storeDocument(content, schedulingMetadata);
  }

  /**
   * Get scheduling statistics
   */
  async getSchedulingStats() {
    const stats = await this.getStats();
    
    return {
      totalDocuments: stats.reduce((sum, stat) => sum + stat._count.id, 0),
      averageQuality: stats.reduce((sum, stat) => sum + (stat._avg.qualityScore || 0), 0) / stats.length || 0,
      documentTypes: stats.map(stat => ({
        type: stat.type,
        count: stat._count.id,
        avgQuality: stat._avg.qualityScore
      }))
    };
  }
}

module.exports = SchedulingRAGService;
