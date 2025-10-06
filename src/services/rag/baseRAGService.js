const { OpenAI } = require('openai');
const { prisma } = require('../../db.js');

/**
 * Base RAG Service
 * Provides common RAG functionality that can be extended by agent-specific services
 */
class BaseRAGService {
  constructor(agentType = 'general') {
    this.agentType = agentType;
    this.openai = null;
    this.embeddingModel = 'text-embedding-3-small';
    this.minSimilarityThreshold = 0.7;
    this.maxContextLength = 2000;
    this.maxRetries = 3;
    this.timeout = 30000;
  }

  getOpenAI() {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  /**
   * Create embeddings from text
   */
  async createEmbedding(text) {
    try {
      const response = await this.getOpenAI().embeddings.create({
        model: this.embeddingModel,
        input: text.trim()
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error(`❌ [RAG-${this.agentType}] Error creating embedding:`, error);
      throw new Error(`Failed to create embedding: ${error.message}`);
    }
  }

  /**
   * Store document with embedding and quality validation
   */
  async storeDocument(content, metadata = {}) {
    try {
      console.log(`📝 [RAG-${this.agentType}] Storing document`);
      
      const embedding = await this.createEmbedding(content);
      const qualityScore = this.calculateQualityScore(content, metadata);
      
      const document = await prisma.knowledgeDocument.create({
        data: {
          content: content.trim(),
          embedding: JSON.stringify(embedding),
          metadata: JSON.stringify({
            ...metadata,
            agentType: this.agentType,
            createdAt: new Date().toISOString()
          }),
          qualityScore,
          type: metadata.type || this.agentType
        }
      });
      
      console.log(`✅ [RAG-${this.agentType}] Document stored with quality score: ${qualityScore}`);
      return document;
    } catch (error) {
      console.error(`❌ [RAG-${this.agentType}] Error storing document:`, error);
      throw error;
    }
  }

  /**
   * Search similar documents using vector similarity
   */
  async searchSimilarDocuments(query, limit = 5) {
    try {
      const queryEmbedding = await this.createEmbedding(query);
      
      const results = await prisma.$queryRaw`
        SELECT 
          id, 
          content, 
          metadata,
          qualityScore,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM "KnowledgeDocument"
        WHERE 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) > ${this.minSimilarityThreshold}
        AND metadata->>'agentType' = ${this.agentType}
        ORDER BY similarity DESC, qualityScore DESC
        LIMIT ${limit}
      `;
      
      return results;
    } catch (error) {
      console.error(`❌ [RAG-${this.agentType}] Error searching documents:`, error);
      return [];
    }
  }

  /**
   * Get context for AI agents with quality control
   */
  async getContextForAgent(query, customAgentType = null) {
    try {
      const agentType = customAgentType || this.agentType;
      console.log(`🔍 [RAG-${agentType}] Retrieving context: ${query}`);
      
      const results = await this.searchSimilarDocuments(query, 5);
      
      const relevantResults = results.filter(doc => doc.similarity >= this.minSimilarityThreshold);
      
      if (relevantResults.length === 0) {
        console.warn(`⚠️ [RAG-${agentType}] No relevant context found for query: ${query}`);
        return { context: '', sources: [] };
      }

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

      console.log(`📚 [RAG-${agentType}] Retrieved ${sources.length} relevant documents`);
      
      return { 
        context: context.trim(), 
        sources,
        totalResults: relevantResults.length
      };
      
    } catch (error) {
      console.error(`❌ [RAG-${agentType}] Error retrieving context:`, error);
      return { context: '', sources: [] };
    }
  }

  /**
   * Calculate quality score for document
   */
  calculateQualityScore(content, metadata) {
    let score = 0.5; // Base score
    
    // Content length bonus
    if (content.length > 100) score += 0.1;
    if (content.length > 500) score += 0.1;
    
    // Metadata completeness bonus
    if (metadata.type) score += 0.1;
    if (metadata.source) score += 0.1;
    if (metadata.tags && Array.isArray(metadata.tags)) score += 0.1;
    
    // Agent-specific quality factors
    score += this.calculateAgentSpecificQuality(content, metadata);
    
    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Override this method in agent-specific RAG services
   */
  calculateAgentSpecificQuality(content, metadata) {
    return 0;
  }

  /**
   * Get knowledge base statistics
   */
  async getStats() {
    try {
      const stats = await prisma.knowledgeDocument.groupBy({
        by: ['type'],
        where: {
          metadata: {
            path: ['agentType'],
            equals: this.agentType
          }
        },
        _count: {
          id: true
        },
        _avg: {
          qualityScore: true
        }
      });
      
      return stats;
    } catch (error) {
      console.error(`❌ [RAG-${this.agentType}] Error getting stats:`, error);
      return [];
    }
  }
}

module.exports = BaseRAGService;
