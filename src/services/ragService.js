const { OpenAI } = require('openai');
const { prisma } = require('../db.js');

/**
 * Enterprise-Grade RAG Service
 * Provides retrieval-augmented generation capabilities with quality control
 */
class RAGService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.embeddingModel = 'text-embedding-3-small';
    this.minSimilarityThreshold = 0.7;
    this.maxContextLength = 2000; // Prevent context overflow
    this.maxRetries = 3;
    this.timeout = 30000; // 30 seconds
  }

  /**
   * Create embeddings from text
   * @param {string} text - Text to embed
   * @returns {Promise<Array>} Embedding vector
   */
  async createEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text.trim()
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('❌ [RAG] Error creating embedding:', error);
      throw new Error(`Failed to create embedding: ${error.message}`);
    }
  }

  /**
   * Store document with embedding and quality validation
   * @param {string} content - Document content
   * @param {Object} metadata - Document metadata
   * @returns {Promise<Object>} Stored document
   */
  async storeDocument(content, metadata = {}) {
    try {
      // Validate content quality
      if (!content || content.trim().length < 10) {
        throw new Error('Content too short or empty');
      }

      if (content.length > 5000) {
        throw new Error('Content too long, please chunk it');
      }

      // Validate metadata
      if (!metadata.type) {
        throw new Error('Metadata type is required');
      }

      // Calculate quality score
      const qualityScore = this.calculateQualityScore(content, metadata);

      // Create embedding
      const embedding = await this.createEmbedding(content);
      
      // Store in database
      const document = await prisma.knowledgeDocument.create({
        data: {
          content: content.trim(),
          embedding: JSON.stringify(embedding),
          metadata: JSON.stringify(metadata),
          type: metadata.type,
          qualityScore: qualityScore
        }
      });
      
      console.log(`📝 [RAG] Stored document: ${metadata.type} - ${content.substring(0, 50)}... (Quality: ${qualityScore})`);
      return document;
      
    } catch (error) {
      console.error('❌ [RAG] Error storing document:', error);
      throw error;
    }
  }

  /**
   * Search similar documents using vector similarity
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} Similar documents
   */
  async searchSimilarDocuments(query, limit = 5) {
    try {
      const queryEmbedding = await this.createEmbedding(query);
      
      // Vector similarity search using PostgreSQL
      const results = await prisma.$queryRaw`
        SELECT 
          id, 
          content, 
          metadata,
          qualityScore,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM "KnowledgeDocument"
        WHERE 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) > ${this.minSimilarityThreshold}
        ORDER BY similarity DESC, qualityScore DESC
        LIMIT ${limit}
      `;
      
      return results;
    } catch (error) {
      console.error('❌ [RAG] Error searching documents:', error);
      return [];
    }
  }

  /**
   * Get context for AI agents with quality control
   * @param {string} query - Query for context retrieval
   * @param {string} agentType - Type of agent requesting context
   * @returns {Promise<Object>} Context and sources
   */
  async getContextForAgent(query, agentType = 'general') {
    try {
      console.log(`🔍 [RAG] Retrieving context for ${agentType}: ${query}`);
      
      const results = await this.searchSimilarDocuments(query, 5);
      
      // Filter by similarity threshold
      const relevantResults = results.filter(doc => doc.similarity >= this.minSimilarityThreshold);
      
      if (relevantResults.length === 0) {
        console.warn(`⚠️ [RAG] No relevant context found for query: ${query}`);
        return { context: '', sources: [] };
      }

      // Build context with length limit
      let context = '';
      const sources = [];
      
      for (const doc of relevantResults) {
        if (context.length + doc.content.length > this.maxContextLength) {
          break;
        }
        context += doc.content + '\n\n';
        sources.push({
          id: doc.id,
          metadata: JSON.parse(doc.metadata),
          similarity: doc.similarity,
          qualityScore: doc.qualityScore
        });
      }

      console.log(`📚 [RAG] Retrieved ${sources.length} relevant documents for ${agentType}`);
      
      return { 
        context: context.trim(), 
        sources,
        totalResults: relevantResults.length
      };
      
    } catch (error) {
      console.error('❌ [RAG] Error retrieving context:', error);
      return { context: '', sources: [] };
    }
  }

  /**
   * Calculate quality score for document
   * @param {string} content - Document content
   * @param {Object} metadata - Document metadata
   * @returns {number} Quality score (0-100)
   */
  calculateQualityScore(content, metadata) {
    let score = 0;
    
    // Length score (optimal 100-500 chars)
    if (content.length >= 100 && content.length <= 500) score += 30;
    else if (content.length >= 50 && content.length <= 1000) score += 20;
    
    // Metadata completeness
    if (metadata.type) score += 20;
    if (metadata.position) score += 15;
    if (metadata.restaurantId) score += 15;
    
    // Content quality indicators
    if (content.includes(':')) score += 10; // Structured content
    if (content.split(' ').length >= 10) score += 10; // Sufficient detail
    
    return Math.min(score, 100);
  }

  /**
   * Initialize knowledge base with default content
   * @returns {Promise<void>}
   */
  async initializeKnowledgeBase() {
    try {
      console.log('🚀 [RAG] Initializing knowledge base...');
      
      const defaultKnowledge = [
        {
          content: "Chef requirements: Minimum 2 years experience in restaurant kitchen, culinary degree preferred, knowledge of food safety standards, ability to work under pressure, team leadership skills.",
          metadata: { type: 'hiring_criteria', position: 'chef', restaurant_type: 'fine_dining' }
        },
        {
          content: "Server requirements: Customer service experience, bilingual skills preferred (Spanish/English), evening availability, knowledge of wine service, ability to handle multiple tables.",
          metadata: { type: 'hiring_criteria', position: 'server', restaurant_type: 'fine_dining' }
        },
        {
          content: "Bartender requirements: Mixology skills, customer service experience, evening availability, knowledge of spirits and cocktails, ability to work in fast-paced environment.",
          metadata: { type: 'hiring_criteria', position: 'bartender', restaurant_type: 'fine_dining' }
        },
        {
          content: "Maitre requirements: 3+ years fine dining experience, excellent communication skills, knowledge of wine service, reservation management, guest satisfaction focus.",
          metadata: { type: 'hiring_criteria', position: 'maitre', restaurant_type: 'fine_dining' }
        },
        {
          content: "Restaurant salary ranges: Chef $45,000-$65,000, Server $25,000-$35,000 + tips, Bartender $30,000-$45,000 + tips, Maitre $35,000-$45,000 + tips, Manager $50,000-$70,000.",
          metadata: { type: 'salary_guidelines', restaurant_type: 'fine_dining' }
        },
        {
          content: "Interview questions for Chef: 1) Describe your experience with menu planning 2) How do you handle kitchen stress? 3) What's your approach to food cost management? 4) Tell me about a time you improved kitchen efficiency.",
          metadata: { type: 'interview_questions', position: 'chef' }
        },
        {
          content: "Interview questions for Server: 1) Describe your experience with customer service 2) How do you handle difficult customers? 3) What's your approach to upselling? 4) Tell me about a time you resolved a customer complaint.",
          metadata: { type: 'interview_questions', position: 'server' }
        }
      ];

      for (const knowledge of defaultKnowledge) {
        try {
          await this.storeDocument(knowledge.content, knowledge.metadata);
        } catch (error) {
          console.warn(`⚠️ [RAG] Failed to store default knowledge: ${error.message}`);
        }
      }

      console.log('✅ [RAG] Knowledge base initialized successfully');
    } catch (error) {
      console.error('❌ [RAG] Error initializing knowledge base:', error);
    }
  }

  /**
   * Get knowledge base statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    try {
      const totalDocs = await prisma.knowledgeDocument.count();
      const avgQuality = await prisma.knowledgeDocument.aggregate({
        _avg: { qualityScore: true }
      });
      
      const typeStats = await prisma.knowledgeDocument.groupBy({
        by: ['type'],
        _count: { type: true },
        _avg: { qualityScore: true }
      });

      return {
        totalDocuments: totalDocs,
        averageQuality: Math.round(avgQuality._avg.qualityScore || 0),
        typeBreakdown: typeStats
      };
    } catch (error) {
      console.error('❌ [RAG] Error getting stats:', error);
      return { totalDocuments: 0, averageQuality: 0, typeBreakdown: [] };
    }
  }
}

module.exports = new RAGService();
