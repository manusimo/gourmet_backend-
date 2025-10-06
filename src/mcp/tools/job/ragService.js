const BaseRAGService = require('../shared/baseRAGService');

/**
 * Job Creation RAG Service
 * Specialized RAG service for job creation agent
 */
class JobRAGService extends BaseRAGService {
  constructor() {
    super('job_creation');
  }

  /**
   * Get enhanced context for job creation
   */
  async getJobCreationContext(userMessage, restaurantContext) {
    try {
      // Create comprehensive query for job creation
      const query = this.buildJobQuery(userMessage, restaurantContext);
      
      // Get relevant context
      const ragResult = await this.getContextForAgent(query);
      
      // Enhance with job-specific context
      const enhancedContext = this.enhanceJobContext(ragResult, restaurantContext);
      
      console.log(`📚 [Job-RAG] Retrieved ${ragResult.sources.length} job-related documents`);
      
      return enhancedContext;
    } catch (error) {
      console.error('❌ [Job-RAG] Error getting job creation context:', error);
      return { context: '', sources: [] };
    }
  }

  /**
   * Build comprehensive query for job creation
   */
  buildJobQuery(userMessage, restaurantContext) {
    const position = this.extractPosition(userMessage);
    const restaurantName = restaurantContext.name || '';
    
    return `${position} ${restaurantName} job creation restaurant hiring salary requirements benefits`;
  }

  /**
   * Extract job position from user message
   */
  extractPosition(userMessage) {
    const positions = [
      'waiter', 'garzón', 'chef', 'cook', 'bartender', 'barista', 
      'host', 'anfitrión', 'delivery', 'cajero', 'cashier', 'manager',
      'supervisor', 'cleaner', 'limpieza', 'runner', 'busser'
    ];
    
    const lowerMessage = userMessage.toLowerCase();
    const foundPosition = positions.find(pos => lowerMessage.includes(pos));
    
    return foundPosition || 'restaurant position';
  }

  /**
   * Enhance context with job-specific information
   */
  enhanceJobContext(ragResult, restaurantContext) {
    let enhancedContext = ragResult.context;
    
    // Add restaurant-specific context
    if (restaurantContext.name) {
      enhancedContext += `\n\nRestaurant: ${restaurantContext.name}`;
    }
    
    // Add job creation best practices if no context found
    if (!enhancedContext.trim()) {
      enhancedContext = this.getDefaultJobContext();
    }
    
    return {
      ...ragResult,
      context: enhancedContext
    };
  }

  /**
   * Default job creation context when no RAG results found
   */
  getDefaultJobContext() {
    return `
Job Creation Best Practices:
- Include clear position title and responsibilities
- Specify work schedule (Full-time, Part-time, etc.)
- Mention salary range and benefits
- List required experience and skills
- Include restaurant culture and team environment
- Add interview questions for candidate assessment
- Specify contract type and duration
- Mention tips and additional compensation if applicable
`;
  }

  /**
   * Calculate job-specific quality score
   */
  calculateAgentSpecificQuality(content, metadata) {
    let score = 0;
    
    // Job-specific content indicators
    if (content.toLowerCase().includes('salary')) score += 0.1;
    if (content.toLowerCase().includes('schedule')) score += 0.1;
    if (content.toLowerCase().includes('experience')) score += 0.1;
    if (content.toLowerCase().includes('requirements')) score += 0.1;
    if (content.toLowerCase().includes('benefits')) score += 0.1;
    
    // Job template indicators
    if (metadata.type === 'job_template') score += 0.2;
    if (metadata.type === 'salary_data') score += 0.15;
    if (metadata.type === 'industry_standards') score += 0.1;
    
    return score;
  }

  /**
   * Store job-specific document
   */
  async storeJobDocument(content, metadata = {}) {
    const jobMetadata = {
      ...metadata,
      type: metadata.type || 'job_template',
      category: 'job_creation'
    };
    
    return await this.storeDocument(content, jobMetadata);
  }

  /**
   * Get job creation statistics
   */
  async getJobStats() {
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

module.exports = JobRAGService;
