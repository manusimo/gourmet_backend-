const BaseTool = require('../baseTool');
const { JobRAGService } = require('../../../services/rag');
const { prisma } = require('../../../db.js');

/**
 * Search Recommended Applicants Tool
 * Finds top candidates matching job requirements using semantic search
 */
class SearchRecommendedApplicantsTool extends BaseTool {
  constructor() {
    super(
      'search_recommended_applicants',
      'Search for recommended applicants/candidates that match job requirements using AI-powered semantic search',
      {
        type: 'object',
        properties: {
          jobRequirements: {
            type: 'object',
            description: 'Job requirements including position, requirements, experience, schedule, salary, etc.',
            properties: {
              position: { type: 'string', description: 'Job position (e.g., Garzón, Chef)' },
              requirements: { type: 'string', description: 'Job requirements' },
              yearsOfExperience: { type: 'number', description: 'Required years of experience' },
              schedule: { type: 'string', description: 'Work schedule (Full-time, Part-time)' },
              salary: { type: 'number', description: 'Salary range' },
              description: { type: 'string', description: 'Job description' },
              functions: { type: 'string', description: 'Job functions' }
            },
            required: ['position']
          },
          limit: { 
            type: 'number', 
            description: 'Maximum number of candidates to return (default: 5)',
            default: 5
          },
          excludeApplicantIds: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of applicant IDs to exclude (those who already applied)',
            default: []
          }
        },
        required: ['jobRequirements']
      }
    );
    
    this.ragService = new JobRAGService();
  }

  async handle(args, { prisma: contextPrisma }) {
    const { jobRequirements, limit = 5, excludeApplicantIds = [] } = args;
    
    try {
      console.log('🔍 [MCP] Searching recommended applicants for:', jobRequirements.position);
      
      // Search for similar applicants using RAG
      const recommendations = await this.ragService.searchSimilarApplicants(jobRequirements, limit * 2);
      
      // Filter out excluded applicants and limit results
      const filteredRecommendations = recommendations
        .filter(rec => !excludeApplicantIds.includes(rec.employee.id))
        .slice(0, limit);
      
      // Format response for AI
      const formattedCandidates = filteredRecommendations.map(rec => ({
        name: `${rec.employee.user?.name || ''} ${rec.employee.user?.surname || ''}`.trim(),
        email: rec.employee.user?.email || 'No email',
        similarity: Math.round(rec.similarity * 100), // Percentage
        matchReasons: rec.matchReasons || [],
        hasExperience: rec.employee.experiences?.length > 0,
        hasEducation: rec.employee.educations?.length > 0,
        employeeId: rec.employee.id
      }));
      
      const message = filteredRecommendations.length > 0
        ? `He encontrado ${filteredRecommendations.length} candidato(s) recomendado(s) que coinciden con los requisitos del puesto "${jobRequirements.position}".`
        : `No he encontrado candidatos recomendados que coincidan exactamente con los requisitos del puesto "${jobRequirements.position}". Puedes revisar los candidatos que ya aplicaron o ajustar los requisitos del trabajo.`;
      
      return this.createSuccessResponse({
        message,
        candidates: formattedCandidates,
        count: filteredRecommendations.length,
        jobPosition: jobRequirements.position
      });
      
    } catch (error) {
      console.error('❌ [MCP] Error searching recommended applicants:', error);
      return this.createErrorResponse(`Error al buscar candidatos recomendados: ${error.message}`);
    }
  }
}

module.exports = SearchRecommendedApplicantsTool;

