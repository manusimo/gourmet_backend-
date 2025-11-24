const BaseTool = require('../baseTool');
const { JobRAGService } = require('../../../services/rag');
const { prisma } = require('../../../db.js');

/**
 * Match Best Applicants Tool
 * Finds and ranks the best matching applicants for a specific job
 * Uses AI-powered semantic search and detailed scoring
 */
class MatchBestApplicantsTool extends BaseTool {
  constructor() {
    super(
      'match_best_applicants',
      'Find and rank the best matching applicants for a specific job using AI-powered semantic search and detailed scoring. Works with existing job IDs.',
      {
        type: 'object',
        properties: {
          jobId: {
            type: 'number',
            description: 'The ID of the job to match applicants for'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of candidates to return (default: 10)',
            default: 10
          },
          includeAlreadyApplied: {
            type: 'boolean',
            description: 'Whether to include applicants who already applied (default: false)',
            default: false
          },
          minSimilarityScore: {
            type: 'number',
            description: 'Minimum similarity score (0-100) to include a candidate (default: 50)',
            default: 50
          }
        },
        required: ['jobId']
      }
    );
    
    this.ragService = new JobRAGService();
  }

  /**
   * Calculate detailed match score for an applicant
   */
  calculateMatchScore(employee, jobOffer, similarityScore) {
    let score = similarityScore; // Start with semantic similarity (0-100)
    const reasons = [];
    const missing = [];

    // Position match (critical)
    if (employee.position && jobOffer.position) {
      const positionMatch = this.comparePositions(employee.position, jobOffer.position);
      if (positionMatch.exact) {
        score += 20;
        reasons.push(`Coincidencia exacta de posición: ${employee.position}`);
      } else if (positionMatch.similar) {
        score += 10;
        reasons.push(`Posición similar: ${employee.position} → ${jobOffer.position}`);
      } else {
        score -= 10;
        missing.push(`Posición no coincide: ${employee.position} vs ${jobOffer.position}`);
      }
    }

    // Schedule match
    if (employee.schedule && jobOffer.schedule) {
      if (employee.schedule === jobOffer.schedule) {
        score += 10;
        reasons.push(`Horario compatible: ${employee.schedule}`);
      } else {
        score -= 5;
        missing.push(`Horario no coincide: ${employee.schedule} vs ${jobOffer.schedule}`);
      }
    }

    // Experience match
    if (jobOffer.yearsOfExperience !== undefined && jobOffer.yearsOfExperience !== null) {
      const employeeExperience = this.calculateEmployeeExperience(employee);
      if (employeeExperience >= jobOffer.yearsOfExperience) {
        const excess = employeeExperience - jobOffer.yearsOfExperience;
        score += 15 + Math.min(excess * 2, 10); // Bonus for exceeding requirements
        reasons.push(`Experiencia suficiente: ${employeeExperience} años (requiere ${jobOffer.yearsOfExperience})`);
      } else {
        const deficit = jobOffer.yearsOfExperience - employeeExperience;
        score -= deficit * 5;
        missing.push(`Experiencia insuficiente: ${employeeExperience} años (requiere ${jobOffer.yearsOfExperience})`);
      }
    }

    // Education bonus
    if (employee.educations && employee.educations.length > 0) {
      score += 5;
      reasons.push(`Tiene ${employee.educations.length} formación(es) registrada(s)`);
    }

    // Experience bonus
    if (employee.experiences && employee.experiences.length > 0) {
      score += 5;
      reasons.push(`Tiene ${employee.experiences.length} experiencia(s) laboral(es)`);
    }

    // Profile completeness
    const profileCompleteness = this.calculateProfileCompleteness(employee);
    score += profileCompleteness * 0.1; // Up to 5 points for complete profile
    if (profileCompleteness > 80) {
      reasons.push('Perfil completo y detallado');
    }

    // Normalize score to 0-100
    score = Math.max(0, Math.min(100, score));

    return {
      totalScore: Math.round(score),
      reasons,
      missing,
      profileCompleteness: Math.round(profileCompleteness)
    };
  }

  /**
   * Compare positions for similarity
   */
  comparePositions(employeePosition, jobPosition) {
    const normalize = (str) => str.toLowerCase().trim();
    const empPos = normalize(employeePosition);
    const jobPos = normalize(jobPosition);

    if (empPos === jobPos) {
      return { exact: true, similar: false };
    }

    // Check for similar positions (e.g., "Chef" and "Jefe de Cocina")
    const similarPositions = {
      'chef': ['jefe de cocina', 'cocinero', 'chef ejecutivo', 'sous chef'],
      'garzón': ['mesero', 'camarero', 'servicio'],
      'bartender': ['barman', 'mixólogo'],
      'cajero': ['cajera', 'caja']
    };

    for (const [key, variants] of Object.entries(similarPositions)) {
      if ((empPos.includes(key) || variants.some(v => empPos.includes(v))) &&
          (jobPos.includes(key) || variants.some(v => jobPos.includes(v)))) {
        return { exact: false, similar: true };
      }
    }

    return { exact: false, similar: false };
  }

  /**
   * Calculate total years of experience from employee experiences
   */
  calculateEmployeeExperience(employee) {
    if (!employee.experiences || employee.experiences.length === 0) {
      return 0;
    }

    let totalMonths = 0;
    for (const exp of employee.experiences) {
      if (exp.startDate && exp.endDate) {
        const start = new Date(exp.startDate);
        const end = new Date(exp.endDate);
        const months = (end.getFullYear() - start.getFullYear()) * 12 + 
                      (end.getMonth() - start.getMonth());
        totalMonths += Math.max(0, months);
      } else if (exp.startDate) {
        // Ongoing experience
        const start = new Date(exp.startDate);
        const now = new Date();
        const months = (now.getFullYear() - start.getFullYear()) * 12 + 
                      (now.getMonth() - start.getMonth());
        totalMonths += Math.max(0, months);
      }
    }

    return Math.floor(totalMonths / 12);
  }

  /**
   * Calculate profile completeness percentage
   */
  calculateProfileCompleteness(employee) {
    let fields = 0;
    let filledFields = 0;

    // Basic info
    fields += 4;
    if (employee.name) filledFields++;
    if (employee.surname) filledFields++;
    if (employee.aboutMe) filledFields++;
    if (employee.position) filledFields++;

    // Experience
    if (employee.experiences && employee.experiences.length > 0) {
      filledFields++;
    }
    fields++;

    // Education
    if (employee.educations && employee.educations.length > 0) {
      filledFields++;
    }
    fields++;

    return (filledFields / fields) * 100;
  }

  async handle(args, { prisma: contextPrisma }) {
    const { 
      jobId, 
      limit = 10, 
      includeAlreadyApplied = false,
      minSimilarityScore = 50 
    } = args;
    
    try {
      console.log(`🔍 [MCP] Matching best applicants for job ID: ${jobId}`);

      // Fetch job details
      const jobOffer = await prisma.jobOffer.findUnique({
        where: { id: parseInt(jobId) },
        include: {
          location: true,
          applications: {
            select: {
              employeeId: true
            }
          }
        }
      });

      if (!jobOffer) {
        return this.createErrorResponse(new Error(`Job with ID ${jobId} not found`));
      }

      // Build job requirements object for RAG search
      const jobRequirements = {
        position: jobOffer.position,
        requirements: jobOffer.requirements || '',
        yearsOfExperience: jobOffer.yearsOfExperience || 0,
        schedule: jobOffer.schedule,
        salary: jobOffer.salary,
        description: jobOffer.description || '',
        functions: jobOffer.functions || ''
      };

      // Get list of employee IDs who already applied
      const appliedEmployeeIds = jobOffer.applications.map(app => app.employeeId);

      // Search for similar applicants using RAG
      const recommendations = await this.ragService.searchSimilarApplicants(
        jobRequirements, 
        limit * 2 // Get more candidates to filter and rank
      );

      // Filter and score candidates
      const scoredCandidates = [];
      
      for (const rec of recommendations) {
        // Skip if already applied (unless includeAlreadyApplied is true)
        if (!includeAlreadyApplied && appliedEmployeeIds.includes(rec.employee.id)) {
          continue;
        }

        // Calculate detailed match score
        const matchDetails = this.calculateMatchScore(
          rec.employee,
          jobOffer,
          Math.round(rec.similarity * 100)
        );

        // Filter by minimum similarity score
        if (matchDetails.totalScore < minSimilarityScore) {
          continue;
        }

        scoredCandidates.push({
          employee: {
            id: rec.employee.id,
            name: `${rec.employee.user?.name || ''} ${rec.employee.user?.surname || ''}`.trim(),
            email: rec.employee.user?.email || 'No email',
            position: rec.employee.position,
            schedule: rec.employee.schedule,
            profileImageUrl: rec.employee.user?.profileImageUrl || null
          },
          matchScore: matchDetails.totalScore,
          semanticSimilarity: Math.round(rec.similarity * 100),
          matchReasons: [...rec.matchReasons || [], ...matchDetails.reasons],
          missingRequirements: matchDetails.missing,
          profileCompleteness: matchDetails.profileCompleteness,
          hasExperience: rec.employee.experiences?.length > 0,
          hasEducation: rec.employee.educations?.length > 0,
          experienceCount: rec.employee.experiences?.length || 0,
          educationCount: rec.employee.educations?.length || 0,
          alreadyApplied: appliedEmployeeIds.includes(rec.employee.id)
        });
      }

      // Sort by match score (highest first)
      scoredCandidates.sort((a, b) => b.matchScore - a.matchScore);

      // Limit results
      const topCandidates = scoredCandidates.slice(0, limit);

      // Build response message
      let message = '';
      if (topCandidates.length === 0) {
        message = `No se encontraron candidatos que coincidan con los requisitos del trabajo "${jobOffer.position}" (ID: ${jobId}).`;
        if (minSimilarityScore > 50) {
          message += ` Considera reducir el puntaje mínimo de similitud (actualmente ${minSimilarityScore}).`;
        }
      } else {
        message = `He encontrado ${topCandidates.length} candidato(s) mejor calificado(s) para el puesto "${jobOffer.position}" (ID: ${jobId}):\n\n`;
        topCandidates.forEach((candidate, index) => {
          message += `${index + 1}. **${candidate.employee.name}** - Puntaje: ${candidate.matchScore}%\n`;
          if (candidate.matchReasons.length > 0) {
            message += `   Razones: ${candidate.matchReasons.slice(0, 3).join(', ')}\n`;
          }
        });
      }

      return this.createSuccessResponse({
        message,
        jobId: parseInt(jobId),
        jobPosition: jobOffer.position,
        candidates: topCandidates,
        totalFound: topCandidates.length,
        excludedAlreadyApplied: !includeAlreadyApplied,
        alreadyAppliedCount: appliedEmployeeIds.length,
        minScore: minSimilarityScore
      });
      
    } catch (error) {
      console.error('❌ [MCP] Error matching best applicants:', error);
      return this.createErrorResponse(error instanceof Error ? error : new Error(`Error al buscar los mejores candidatos: ${error.message || error}`));
    }
  }
}

module.exports = MatchBestApplicantsTool;

