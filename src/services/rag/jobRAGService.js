const BaseRAGService = require('./baseRAGService');

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
   * Store applicant profile in vector database for matching
   */
  async storeApplicantDocument(application, employee, jobOffer) {
    try {
      // Build comprehensive applicant document content
      const applicantContent = `
        Applicant Profile:
        Name: ${employee.name || 'Unknown'} ${employee.surname || ''}
        Email: ${employee.email || 'Not provided'}
        Applied Position: ${jobOffer?.position || 'Unknown'}
        Restaurant: ${jobOffer?.restaurant?.name || 'Unknown'}
        
        Application Answers:
        ${application.answers?.map((answer, index) => 
          `Question ${index + 1}: ${answer.question?.question || 'N/A'}
          Answer: ${answer.answer || 'No answer'}`
        ).join('\n\n') || 'No answers provided'}
        
        Application Date: ${application.createdAt ? new Date(application.createdAt).toISOString() : 'Unknown'}
      `.trim();

      // Store in vector database with metadata
      return await this.storeDocument(applicantContent, {
        type: 'applicant_profile',
        applicationId: application.id,
        employeeId: employee.id,
        jobId: jobOffer?.id,
        restaurantId: jobOffer?.restaurantId,
        position: jobOffer?.position,
        createdAt: application.createdAt ? new Date(application.createdAt).toISOString() : new Date().toISOString(),
        source: 'job_application',
        category: 'applicant_matching'
      });
    } catch (error) {
      console.error('❌ [Job-RAG] Error storing applicant document:', error);
      throw error;
    }
  }

  /**
   * Search for similar jobs based on job requirements
   * Returns top 3 most similar jobs for replication/reference
   */
  async searchSimilarJobs(jobData, limit = 3) {
    try {
      const query = `
        Position: ${jobData.position || ''}
        Requirements: ${jobData.requirements || ''}
        Experience Required: ${jobData.yearsOfExperience || 0} years
        Schedule: ${jobData.schedule || ''}
        Salary Range: ${jobData.salary || 'Not specified'}
        Contract Type: ${jobData.contract || ''}
        Description: ${jobData.description || ''}
        Functions: ${jobData.functions || ''}
      `.trim();

      // Search for similar job offers
      const results = await this.searchSimilarDocuments(query, limit);
      
      // Filter to only job offers and extract job IDs
      const jobDocuments = results.filter(doc => {
        const metadata = typeof doc.metadata === 'string' 
          ? JSON.parse(doc.metadata) 
          : doc.metadata;
        return metadata.type === 'job_offer';
      });

      // Fetch full job details from database
      const { prisma } = require('../../db.js');
      const similarJobs = [];
      
      for (const doc of jobDocuments) {
        const metadata = typeof doc.metadata === 'string' 
          ? JSON.parse(doc.metadata) 
          : doc.metadata;
        
        if (metadata.jobId) {
          try {
            const job = await prisma.jobOffer.findUnique({
              where: { id: parseInt(metadata.jobId) },
              include: {
                restaurant: {
                  select: {
                    id: true,
                    name: true
                  }
                },
                location: {
                  select: {
                    id: true,
                    city: true,
                    region: true
                  }
                },
                questions: {
                  select: {
                    id: true,
                    question: true
                  }
                }
              }
            });

            if (job) {
              similarJobs.push({
                job: {
                  id: job.id,
                  position: job.position,
                  schedule: job.schedule,
                  contract: job.contract,
                  salary: job.salary,
                  vacancies: job.vacancies,
                  yearsOfExperience: job.yearsOfExperience,
                  description: job.description,
                  requirements: job.requirements,
                  functions: job.functions,
                  tips: job.tips,
                  createdAt: job.createdAt,
                  restaurant: job.restaurant,
                  location: job.location,
                  questions: job.questions
                },
                similarity: doc.similarity || 0,
                metadata: metadata
              });
            }
          } catch (error) {
            console.error(`❌ [Job-RAG] Error fetching job ${metadata.jobId}:`, error);
          }
        }
      }

      console.log(`📊 [Job-RAG] Found ${similarJobs.length} similar jobs for replication`);
      return similarJobs;
    } catch (error) {
      console.error('❌ [Job-RAG] Error searching similar jobs:', error);
      return [];
    }
  }

  /**
   * Search for similar applicants based on job requirements
   * Returns full applicant details with similarity scores
   */
  async searchSimilarApplicants(jobRequirements, limit = 5) {
    try {
      const query = `
        Position: ${jobRequirements.position || ''}
        Requirements: ${jobRequirements.requirements || ''}
        Experience Required: ${jobRequirements.yearsOfExperience || 0} years
        Schedule: ${jobRequirements.schedule || ''}
        Salary Range: ${jobRequirements.salary || 'Not specified'}
        Description: ${jobRequirements.description || ''}
        Functions: ${jobRequirements.functions || ''}
      `.trim();

      // Search for similar applicant profiles
      const results = await this.searchSimilarDocuments(query, limit);
      
      // Filter to only applicant profiles and extract applicant IDs
      const applicantDocuments = results.filter(doc => {
        const metadata = typeof doc.metadata === 'string' 
          ? JSON.parse(doc.metadata) 
          : doc.metadata;
        return metadata.type === 'applicant_profile';
      });

      // Fetch full applicant details from database
      const { prisma } = require('../../db.js');
      const recommendedApplicants = [];
      
      for (const doc of applicantDocuments) {
        const metadata = typeof doc.metadata === 'string' 
          ? JSON.parse(doc.metadata) 
          : doc.metadata;
        
        if (metadata.employeeId) {
          try {
            const employee = await prisma.employee.findUnique({
              where: { id: parseInt(metadata.employeeId) },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    surname: true,
                    email: true,
                    profileImageUrl: true
                  }
                },
                educations: {
                  select: {
                    id: true,
                    institution: true,
                    degree: true,
                    field: true,
                    startDate: true,
                    endDate: true
                  }
                },
                experiences: {
                  select: {
                    id: true,
                    company: true,
                    position: true,
                    description: true,
                    startDate: true,
                    endDate: true
                  }
                },
                applications: {
                  where: {
                    jobPostId: metadata.jobId || undefined
                  },
                  include: {
                    answers: {
                      include: {
                        question: true
                      }
                    }
                  },
                  take: 1
                }
              }
            });

            if (employee) {
              recommendedApplicants.push({
                employee: {
                  id: employee.id,
                  user: employee.user,
                  educations: employee.educations,
                  experiences: employee.experiences,
                  application: employee.applications[0] || null
                },
                similarity: doc.similarity || 0,
                matchReasons: this.generateMatchReasons(doc, jobRequirements),
                metadata: metadata
              });
            }
          } catch (error) {
            console.error(`❌ [Job-RAG] Error fetching applicant ${metadata.employeeId}:`, error);
          }
        }
      }

      console.log(`📊 [Job-RAG] Found ${recommendedApplicants.length} recommended applicants`);
      return recommendedApplicants;
    } catch (error) {
      console.error('❌ [Job-RAG] Error searching similar applicants:', error);
      return [];
    }
  }

  /**
   * Generate match reasons for why an applicant is a good fit
   */
  generateMatchReasons(doc, jobRequirements) {
    const reasons = [];
    const similarity = doc.similarity || 0;
    
    if (similarity > 0.85) {
      reasons.push('Excelente coincidencia con los requisitos del puesto');
    } else if (similarity > 0.75) {
      reasons.push('Buena coincidencia con los requisitos del puesto');
    } else if (similarity > 0.65) {
      reasons.push('Coincidencia moderada con los requisitos del puesto');
    }

    // Check specific matches
    const content = doc.content?.toLowerCase() || '';
    const jobPosition = (jobRequirements.position || '').toLowerCase();
    
    if (content.includes(jobPosition)) {
      reasons.push(`Experiencia en ${jobRequirements.position}`);
    }

    if (jobRequirements.yearsOfExperience && content.includes('años')) {
      reasons.push('Experiencia relevante');
    }

    return reasons.length > 0 ? reasons : ['Perfil potencialmente interesante'];
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
