const { prisma } = require('../db.js');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Job Posting Agent Service
 * Generates and optimizes job postings while respecting platform constraints
 */
class JobPostingAgent {
  constructor() {
    // Platform constraints - these match your form dropdowns
    this.constraints = {
      horario: ['Mañana', 'Tarde', 'Noche', 'Completo', 'Part-time', 'Full-time'],
      contrato: ['Tiempo completo', 'Medio tiempo', 'Por horas', 'Temporal', 'Permanente'],
      propinas: ['Sí', 'No'],
      periodo: ['Diario', 'Semanal', 'Quincenal', 'Mensual'],
      experiencia: ['Sin experiencia', '1-2 años', '3-5 años', '5+ años', 'Experiencia senior']
    };

    // Common gastronomy positions
    this.commonPositions = [
      'Cocinero', 'Chef', 'Mesero', 'Bartender', 'Host/Hostess', 
      'Cajero', 'Limpieza', 'Gerente', 'Supervisor', 'Ayudante de cocina',
      'Pastelero', 'Sommelier', 'Barista', 'Delivery', 'Recepcionista'
    ];
  }

  /**
   * Generate a new job posting using AI
   */
  async generateJobPosting({ position, requirements, restaurant, location, similarJobs, preferences }) {
    try {
      console.log(`🤖 [JOB POSTING AGENT] Generating job posting for position: ${position}`);

      // Build context for AI
      const context = this.buildContext({ position, requirements, restaurant, location, similarJobs, preferences });
      
      // Generate job posting content with AI
      const aiResponse = await this.generateWithAI(context);
      
      // Validate and structure the response
      const structuredJobPost = this.structureJobPost(aiResponse, preferences);
      
      // Validate against platform constraints
      const validation = this.validateJobPost(structuredJobPost);
      
      if (!validation.isValid) {
        console.log('⚠️ [JOB POSTING AGENT] Generated job post has validation errors, fixing...');
        const fixedJobPost = this.fixValidationErrors(structuredJobPost, validation.errors);
        return {
          success: true,
          data: fixedJobPost,
          suggestions: this.generateSuggestions(fixedJobPost),
          confidence: 0.8
        };
      }

      return {
        success: true,
        data: structuredJobPost,
        suggestions: this.generateSuggestions(structuredJobPost),
        confidence: 0.9
      };

    } catch (error) {
      console.error('❌ [JOB POSTING AGENT] Error generating job posting:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build context for AI generation
   */
  buildContext({ position, requirements, restaurant, location, similarJobs, preferences }) {
    return {
      position,
      requirements: requirements || '',
      restaurant: {
        name: restaurant.name,
        description: restaurant.description,
        type: restaurant.type
      },
      location: location ? {
        address: location.address,
        city: location.city,
        region: location.region
      } : null,
      similarJobs: similarJobs || [],
      constraints: this.constraints,
      preferences: preferences || {}
    };
  }

  /**
   * Generate job posting content using OpenAI
   */
  async generateWithAI(context) {
    try {
      const prompt = this.buildPrompt(context);
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Eres un especialista en recursos humanos para la industria gastronómica. Tu trabajo es crear descripciones de trabajo atractivas y profesionales que respeten las restricciones de la plataforma.

RESTRICCIONES DE LA PLATAFORMA:
- Horario: ${this.constraints.horario.join(', ')}
- Contrato: ${this.constraints.contrato.join(', ')}
- Propinas: ${this.constraints.propinas.join(', ')}
- Período: ${this.constraints.periodo.join(', ')}
- Experiencia: ${this.constraints.experiencia.join(', ')}

INSTRUCCIONES:
1. Crea una descripción profesional y atractiva
2. Lista las funciones principales del puesto
3. Usa SOLO los valores permitidos en las restricciones
4. Adapta el tono al tipo de restaurante
5. Incluye beneficios y oportunidades de crecimiento
6. Sé específico sobre requisitos y responsabilidades

Responde en formato JSON con estos campos:
{
  "description": "Descripción del puesto",
  "functions": "Lista de funciones principales",
  "requirements": "Requisitos del candidato",
  "benefits": "Beneficios ofrecidos",
  "suggestedSchedule": "Horario sugerido (debe ser uno de los valores permitidos)",
  "suggestedContract": "Tipo de contrato sugerido (debe ser uno de los valores permitidos)",
  "suggestedTips": "Propinas (Sí o No)",
  "suggestedPeriod": "Período de pago sugerido",
  "suggestedExperience": "Experiencia requerida sugerida"
}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      });

      const response = completion.choices[0].message.content;
      return JSON.parse(response);

    } catch (error) {
      console.error('❌ [JOB POSTING AGENT] OpenAI error:', error);
      return this.getFallbackResponse(context);
    }
  }

  /**
   * Build prompt for AI generation
   */
  buildPrompt(context) {
    return `Crea una descripción de trabajo para el puesto de "${context.position}" en ${context.restaurant.name}.

INFORMACIÓN DEL RESTAURANTE:
- Nombre: ${context.restaurant.name}
- Tipo: ${context.restaurant.type || 'Restaurante'}
- Descripción: ${context.restaurant.description || 'No disponible'}

UBICACIÓN: ${context.location ? `${context.location.address}, ${context.location.city}` : 'No especificada'}

REQUISITOS ESPECÍFICOS: ${context.requirements || 'No especificados'}

TRABAJOS SIMILARES EN EL RESTAURANTE:
${context.similarJobs.map(job => `- ${job.position}: ${job.description}`).join('\n') || 'Ninguno'}

PREFERENCIAS: ${JSON.stringify(context.preferences)}

Crea una descripción profesional que sea atractiva para candidatos calificados.`;
  }

  /**
   * Structure AI response into job post format
   */
  structureJobPost(aiResponse, preferences) {
    return {
      position: preferences.position || '',
      description: aiResponse.description || '',
      functions: aiResponse.functions || '',
      schedule: aiResponse.suggestedSchedule || 'Completo',
      contract: aiResponse.suggestedContract || 'Tiempo completo',
      tips: aiResponse.suggestedTips || 'Sí',
      period: aiResponse.suggestedPeriod || 'Quincenal',
      experience: aiResponse.suggestedExperience || 'Sin experiencia',
      salary: preferences.salary || 0,
      vacancies: preferences.vacancies || 1,
      requirements: aiResponse.requirements || '',
      benefits: aiResponse.benefits || ''
    };
  }

  /**
   * Validate job post against platform constraints
   */
  validateJobPost(jobPost) {
    const errors = [];
    const warnings = [];

    // Validate dropdown values
    if (!this.constraints.horario.includes(jobPost.schedule)) {
      errors.push(`Horario inválido: ${jobPost.schedule}. Valores permitidos: ${this.constraints.horario.join(', ')}`);
    }

    if (!this.constraints.contrato.includes(jobPost.contract)) {
      errors.push(`Contrato inválido: ${jobPost.contract}. Valores permitidos: ${this.constraints.contrato.join(', ')}`);
    }

    if (!this.constraints.propinas.includes(jobPost.tips)) {
      errors.push(`Propinas inválido: ${jobPost.tips}. Valores permitidos: ${this.constraints.propinas.join(', ')}`);
    }

    if (!this.constraints.periodo.includes(jobPost.period)) {
      errors.push(`Período inválido: ${jobPost.period}. Valores permitidos: ${this.constraints.periodo.join(', ')}`);
    }

    if (!this.constraints.experiencia.includes(jobPost.experience)) {
      errors.push(`Experiencia inválida: ${jobPost.experience}. Valores permitidos: ${this.constraints.experiencia.join(', ')}`);
    }

    // Validate required fields
    if (!jobPost.position || jobPost.position.trim() === '') {
      errors.push('La posición es requerida');
    }

    if (!jobPost.description || jobPost.description.trim() === '') {
      errors.push('La descripción es requerida');
    }

    if (!jobPost.functions || jobPost.functions.trim() === '') {
      errors.push('Las funciones son requeridas');
    }

    // Warnings
    if (jobPost.salary <= 0) {
      warnings.push('El salario debería ser mayor a 0');
    }

    if (jobPost.vacancies <= 0) {
      warnings.push('El número de vacantes debería ser mayor a 0');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Fix validation errors
   */
  fixValidationErrors(jobPost, errors) {
    const fixedJobPost = { ...jobPost };

    // Fix dropdown values
    if (errors.some(e => e.includes('Horario inválido'))) {
      fixedJobPost.schedule = 'Completo';
    }

    if (errors.some(e => e.includes('Contrato inválido'))) {
      fixedJobPost.contract = 'Tiempo completo';
    }

    if (errors.some(e => e.includes('Propinas inválido'))) {
      fixedJobPost.tips = 'Sí';
    }

    if (errors.some(e => e.includes('Período inválido'))) {
      fixedJobPost.period = 'Quincenal';
    }

    if (errors.some(e => e.includes('Experiencia inválida'))) {
      fixedJobPost.experience = 'Sin experiencia';
    }

    return fixedJobPost;
  }

  /**
   * Generate suggestions for improvement
   */
  generateSuggestions(jobPost) {
    const suggestions = [];

    if (jobPost.salary <= 0) {
      suggestions.push('Considera agregar un salario competitivo para atraer mejores candidatos');
    }

    if (jobPost.description.length < 100) {
      suggestions.push('La descripción podría ser más detallada para atraer candidatos calificados');
    }

    if (!jobPost.benefits || jobPost.benefits.trim() === '') {
      suggestions.push('Agregar beneficios puede hacer el puesto más atractivo');
    }

    return suggestions;
  }

  /**
   * Fallback response when OpenAI fails
   */
  getFallbackResponse(context) {
    return {
      description: `Buscamos un ${context.position} para unirnos a nuestro equipo en ${context.restaurant.name}. Ofrecemos un ambiente de trabajo dinámico y oportunidades de crecimiento.`,
      functions: `- Realizar las tareas específicas del puesto de ${context.position}\n- Mantener altos estándares de calidad\n- Trabajar en equipo\n- Seguir protocolos de seguridad`,
      requirements: `- Experiencia en el área (preferible)\n- Disponibilidad horaria\n- Actitud positiva y proactiva\n- Capacidad de trabajo en equipo`,
      benefits: `- Ambiente de trabajo agradable\n- Oportunidades de crecimiento\n- Capacitación continua`,
      suggestedSchedule: 'Completo',
      suggestedContract: 'Tiempo completo',
      suggestedTips: 'Sí',
      suggestedPeriod: 'Quincenal',
      suggestedExperience: 'Sin experiencia'
    };
  }

  /**
   * Optimize existing job posting
   */
  async optimizeJobPosting({ existingJobPost, optimizationType, applicationData }) {
    try {
      console.log(`🤖 [JOB POSTING AGENT] Optimizing job posting: ${existingJobPost.id}`);

      // Analyze current performance
      const analysis = this.analyzeJobPostingPerformance(existingJobPost, applicationData);
      
      // Generate optimizations based on type
      let optimizations = {};
      
      if (optimizationType === 'all' || optimizationType === 'description') {
        optimizations.description = await this.optimizeDescription(existingJobPost, analysis);
      }
      
      if (optimizationType === 'all' || optimizationType === 'functions') {
        optimizations.functions = await this.optimizeFunctions(existingJobPost, analysis);
      }

      return {
        success: true,
        data: {
          ...existingJobPost,
          ...optimizations
        },
        improvements: this.generateImprovementSuggestions(analysis),
        confidence: 0.85
      };

    } catch (error) {
      console.error('❌ [JOB POSTING AGENT] Error optimizing job posting:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get job posting suggestions
   */
  async getJobPostingSuggestions({ restaurant, targetPosition }) {
    try {
      console.log(`🤖 [JOB POSTING AGENT] Getting suggestions for ${restaurant.name}`);

      // Simple suggestions based on existing jobs
      const suggestions = [];
      
      if (targetPosition && !restaurant.existingJobs.some(job => job.position === targetPosition)) {
        suggestions.push({
          position: targetPosition,
          reason: 'Nueva posición que no has publicado antes'
        });
      }

      return {
        success: true,
        data: suggestions
      };

    } catch (error) {
      console.error('❌ [JOB POSTING AGENT] Error getting suggestions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate job posting data
   */
  async validateJobPosting(jobPostData) {
    const validation = this.validateJobPost(jobPostData);
    
    return {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      suggestions: this.generateSuggestions(jobPostData)
    };
  }

  // Helper methods for analysis and optimization
  analyzeJobPostingPerformance(jobPost, applications) {
    return {
      totalApplications: applications.length
    };
  }

  generateImprovementSuggestions(analysis) {
    const suggestions = [];
    
    if (analysis.totalApplications < 5) {
      suggestions.push('Considera mejorar la descripción del puesto para atraer más candidatos');
    }
    
    return suggestions;
  }

  async optimizeDescription(jobPost, analysis) {
    return jobPost.description + ' (Optimizada)';
  }

  async optimizeFunctions(jobPost, analysis) {
    return jobPost.functions + '\n- Oportunidades de crecimiento';
  }
}

// Export singleton instance
module.exports = new JobPostingAgent();
