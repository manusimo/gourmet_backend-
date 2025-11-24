/**
 * Job Creation Handler
 * Handles job creation and post-creation actions
 */

const { createJobOffer } = require('../../../../helpers/jobHelpers.js');
const JobDataCleaner = require('../helpers/dataCleaner');
const { prisma } = require('../../../../db.js');

class JobCreationHandler {
  /**
   * Create job if complete
   */
  static async createJobIfComplete(aiResponse, restaurantContext, ragService) {
    try {
      // Validate locationId before creating job
      const locationId = aiResponse.extractedData?.locationId || restaurantContext.locationId;
      
      if (!locationId || locationId === 1) {
        console.log('⚠️ [MCP] locationId missing or default, job creation will require user selection in frontend');
        aiResponse.message = 'Por favor selecciona una ubicación antes de crear el trabajo.';
        aiResponse.status = 'incomplete';
        aiResponse.missingFields = [...(aiResponse.missingFields || []), 'locationId'];
        return;
      }
      
      const jobData = JobDataCleaner.prepareJobData(aiResponse.extractedData, restaurantContext);
      const jobOffer = await createJobOffer(jobData);
      
      // Store job in vector database for future RAG context
      await this.storeJobInVectorDB(jobOffer, aiResponse.extractedData, restaurantContext, ragService);
      
      // Ask user if they want to see recommended candidates (don't automatically search)
      aiResponse.message = `¡Perfecto! He creado la oferta de trabajo para ${aiResponse.extractedData.position}. La oferta ha sido publicada exitosamente.\n\n¿Te gustaría que busque candidatos recomendados que coincidan con este puesto?`;
      aiResponse.jobCreated = true;
      aiResponse.jobId = jobOffer.id;
      aiResponse.askForCandidates = true; // Flag to indicate we should ask about candidates
    } catch (jobError) {
      console.error('❌ Error creating job:', jobError);
      aiResponse.message = 'Hubo un error al crear la oferta de trabajo. Por favor, intenta de nuevo.';
      aiResponse.status = 'error';
    }
  }

  /**
   * Store job offer in vector database for RAG retrieval
   */
  static async storeJobInVectorDB(jobOffer, extractedData, restaurantContext, ragService) {
    try {
      const jobContent = `
        Job Position: ${extractedData.position || jobOffer.position}
        Restaurant: ${restaurantContext.name || 'Unknown'}
        Schedule: ${extractedData.schedule || jobOffer.schedule || 'Not specified'}
        Contract Type: ${extractedData.contract || jobOffer.contract || 'Not specified'}
        Salary: ${extractedData.salary || jobOffer.salary || 'Not specified'}
        Vacancies: ${extractedData.vacancies || jobOffer.vacancies || 1}
        Years of Experience Required: ${extractedData.yearsOfExperience || jobOffer.yearsOfExperience || 0}
        Period: ${extractedData.period || 'Permanente'}
        Description: ${extractedData.description || jobOffer.description || ''}
        Requirements: ${extractedData.requirements || jobOffer.requirements || ''}
        Functions: ${extractedData.functions || jobOffer.functions || ''}
        Tips Included: ${extractedData.tips ? 'Yes' : 'No'}
        Interview Questions: ${extractedData.questions?.map(q => q.question || q).join(', ') || 'None'}
      `.trim();

      await ragService.storeJobDocument(jobContent, {
        type: 'job_offer',
        jobId: jobOffer.id,
        restaurantId: restaurantContext.id || jobOffer.restaurantId,
        position: extractedData.position || jobOffer.position,
        createdAt: jobOffer.createdAt.toISOString(),
        source: 'ai_job_creation'
      });

      console.log(`✅ [MCP] Job ${jobOffer.id} stored in vector database for RAG`);
    } catch (error) {
      console.error('❌ [MCP] Error storing job in vector database:', error);
      // Don't fail job creation if vector storage fails
    }
  }

  /**
   * Find and recommend best matching candidates for a job
   */
  static async findAndRecommendCandidates(jobId, aiResponse) {
    try {
      const { getToolHandler } = require('../../index');
      const matchHandler = getToolHandler('match_best_applicants');
      
      if (!matchHandler) {
        console.warn('⚠️ [MCP] match_best_applicants handler not found, skipping candidate recommendations');
        return;
      }

      console.log(`🔍 [MCP] Finding best candidates for job ID: ${jobId}`);
      
      const matchResult = await matchHandler(
        { 
          jobId: parseInt(jobId),
          limit: 5,
          includeAlreadyApplied: false,
          minSimilarityScore: 50
        },
        { prisma }
      );

      // Parse the response
      let candidates = [];
      if (matchResult && !matchResult.isError) {
        const textContent = matchResult?.content?.[0]?.text;
        if (textContent) {
          const parsed = typeof textContent === 'string' ? JSON.parse(textContent) : textContent;
          candidates = parsed.candidates || [];
        }
      }

      if (candidates.length > 0) {
        aiResponse.recommendedCandidates = candidates.map(candidate => ({
          employeeId: candidate.employee.id,
          name: candidate.employee.name,
          email: candidate.employee.email,
          matchScore: candidate.matchScore,
          semanticSimilarity: candidate.semanticSimilarity,
          matchReasons: candidate.matchReasons || [],
          missingRequirements: candidate.missingRequirements || [],
          profileCompleteness: candidate.profileCompleteness,
          profileImageUrl: candidate.employee.profileImageUrl
        }));

        aiResponse.message += `\n\n👥 **CANDIDATOS RECOMENDADOS:**\nHe encontrado ${candidates.length} candidato(s) que coinciden con los requisitos del puesto.\n\nPuedes decirme:\n- "Escribe a los candidatos" o "Mensajea a los candidatos" para enviarles un mensaje\n- "Programa una llamada con [nombre]" o "Agenda una entrevista con [nombre]" para programar una llamada\n- "Contacta a todos" para enviar mensajes a todos los candidatos recomendados`;
        
        aiResponse.availableActions = {
          messageCandidates: true,
          scheduleCalls: true,
          candidates: aiResponse.recommendedCandidates
        };
        
        console.log(`✅ [MCP] Found ${candidates.length} recommended candidates for job ${jobId}`);
      } else {
        aiResponse.message += `\n\n👥 **CANDIDATOS:**\nNo he encontrado candidatos recomendados que coincidan exactamente con los requisitos. Puedes esperar a que candidatos apliquen o ajustar los requisitos del trabajo.`;
        console.log(`ℹ️ [MCP] No matching candidates found for job ${jobId}`);
      }
    } catch (error) {
      console.error('❌ [MCP] Error finding recommended candidates:', error);
      aiResponse.message += `\n\n👥 **CANDIDATOS:**\nHubo un error al buscar candidatos recomendados. Puedes buscar candidatos manualmente más tarde.`;
    }
  }
}

module.exports = JobCreationHandler;

