/**
 * Fallback Response Builder
 * Builds fallback responses when OpenAI is unavailable
 */

const DataExtraction = require('./dataExtraction');
const ValidationHelpers = require('./validationHelpers');
const IntentDetection = require('./intentDetection');

class FallbackResponseBuilder {
  /**
   * Build fallback response from user message and history
   */
  static async build(userMessage, conversationHistory, restaurantContext, ragService) {
    const lowerMessage = userMessage.toLowerCase();
    const isAskingForCandidates = IntentDetection.isCandidateRequest(userMessage, conversationHistory);
    const isConfirmingPublish = IntentDetection.isConfirmingPublish(userMessage);

    // Extract data from current message
    const currentData = DataExtraction.extractAllFromMessage(userMessage);
    
    // Extract accumulated data from history
    const accumulatedData = this.extractAccumulatedDataFromHistory(conversationHistory);
    
    // Merge data
    const finalData = {
      position: (currentData.position && currentData.position !== 'Posición no especificada') 
        ? currentData.position 
        : (accumulatedData.position || ''),
      schedule: currentData.schedule || accumulatedData.schedule || '',
      contract: currentData.contract || accumulatedData.contract || '',
      salary: currentData.salary || accumulatedData.salary || 0,
      tips: accumulatedData.tips !== undefined ? accumulatedData.tips : true,
      vacancies: currentData.vacancies || accumulatedData.vacancies || 1,
      yearsOfExperience: currentData.yearsOfExperience !== null 
        ? currentData.yearsOfExperience 
        : (accumulatedData.yearsOfExperience || 0),
      period: currentData.period || accumulatedData.period || 'Permanente',
      description: currentData.description || accumulatedData.description || '',
      requirements: currentData.requirements || accumulatedData.requirements || '',
      functions: currentData.functions || accumulatedData.functions || '',
      questions: currentData.questions.length > 0 
        ? currentData.questions 
        : (accumulatedData.questions || []),
      locationId: accumulatedData.locationId || null
    };

    // Build message
    const { message, status } = this.buildMessage(finalData, isConfirmingPublish);

    // Build response
    const response = {
      status,
      message,
      extractedData: finalData,
      missingFields: ValidationHelpers.getMissingFields(finalData),
      suggestions: ValidationHelpers.getSuggestions(finalData),
      debugInfo: {
        source: 'REGEX_FALLBACK',
        method: 'pattern_matching',
        timestamp: new Date().toISOString(),
        extractedFields: Object.keys(finalData).filter(key => finalData[key] && finalData[key] !== ''),
        isConfirmingPublish
      },
      openaiStatus: {
        available: false,
        reason: 'quota_exceeded',
        model: 'gpt-3.5-turbo',
        fallbackUsed: true,
        explanation: 'OpenAI API quota exceeded - using regex pattern matching instead'
      }
    };

    // Add similar jobs and candidates if we have position
    if (finalData.position && finalData.position !== 'Posición no especificada') {
      await this.addSimilarJobs(response, finalData, ragService);
      await this.addRecommendedCandidates(response, finalData, isAskingForCandidates, status, ragService);
    } else if (isAskingForCandidates) {
      response.message += `\n\n👥 Para buscar candidatos recomendados, primero necesito saber la posición del trabajo. Por favor, indica qué tipo de puesto necesitas.`;
    }

    return response;
  }

  /**
   * Extract accumulated data from conversation history
   */
  static extractAccumulatedDataFromHistory(conversationHistory) {
    const accumulated = {
      position: '', schedule: '', contract: '', salary: 0, tips: true,
      vacancies: 1, yearsOfExperience: 0, period: 'Permanente',
      description: '', requirements: '', functions: '', questions: [],
      locationId: null
    };
    
    for (const message of conversationHistory) {
      if (message.role === 'assistant' && message.content) {
        try {
          const parsed = JSON.parse(message.content);
          if (parsed.extractedData) {
            Object.keys(parsed.extractedData).forEach(key => {
              const value = parsed.extractedData[key];
              if (value !== null && value !== undefined && value !== '' && value !== 'Posición no especificada') {
                accumulated[key] = value;
              }
            });
          }
        } catch (e) {
          // Try text extraction
          const lowerContent = message.content.toLowerCase();
          if (!accumulated.position || accumulated.position === 'Posición no especificada') {
            const pos = DataExtraction.extractPosition(lowerContent);
            if (pos && pos !== 'Posición no especificada') {
              accumulated.position = pos;
            }
          }
          if (!accumulated.schedule) {
            const schedule = DataExtraction.extractSchedule(lowerContent);
            if (schedule) accumulated.schedule = schedule;
          }
          if (!accumulated.salary || accumulated.salary === 0) {
            const salary = DataExtraction.extractSalary(lowerContent);
            if (salary > 0) accumulated.salary = salary;
          }
          if (!accumulated.contract) {
            const contract = DataExtraction.extractContract(lowerContent);
            if (contract) accumulated.contract = contract;
          }
        }
      }
    }
    
    return accumulated;
  }

  /**
   * Build message based on data completeness
   */
  static buildMessage(finalData, isConfirmingPublish) {
    const foundInfo = [];
    const missingInfo = [];

    if (finalData.position && finalData.position !== 'Posición no especificada') {
      foundInfo.push(`Posición: ${finalData.position}`);
    } else {
      missingInfo.push('la posición del trabajo');
    }

    if (finalData.schedule) foundInfo.push(`Horario: ${finalData.schedule}`);
    else missingInfo.push('el horario de trabajo');

    if (finalData.salary > 0) foundInfo.push(`Salario: $${finalData.salary.toLocaleString()}`);
    else missingInfo.push('el salario ofrecido');

    if (finalData.contract) foundInfo.push(`Contrato: ${finalData.contract}`);
    else missingInfo.push('el tipo de contrato');

    if (finalData.vacancies > 0) foundInfo.push(`Vacantes: ${finalData.vacancies}`);
    else missingInfo.push('el número de vacantes');

    if (finalData.yearsOfExperience !== null && finalData.yearsOfExperience !== undefined) {
      foundInfo.push(`Experiencia: ${finalData.yearsOfExperience} años`);
    } else {
      missingInfo.push('los años de experiencia requeridos');
    }

    if (finalData.period) foundInfo.push(`Período: ${finalData.period}`);
    else missingInfo.push('el período del trabajo');

    if (finalData.description) foundInfo.push(`Descripción: ${finalData.description.substring(0, 50)}...`);
    else missingInfo.push('la descripción del trabajo');

    if (finalData.functions) foundInfo.push(`Funciones: ${finalData.functions.substring(0, 50)}...`);
    else missingInfo.push('las funciones del trabajo');

    if (finalData.requirements) foundInfo.push(`Requisitos: ${finalData.requirements.substring(0, 50)}...`);
    else missingInfo.push('los requisitos del trabajo');

    if (finalData.questions && finalData.questions.length > 0) {
      foundInfo.push(`Preguntas: ${finalData.questions.length} pregunta(s)`);
    } else {
      missingInfo.push('al menos 1 pregunta para los candidatos');
    }

    let message = foundInfo.length > 0 
      ? `Perfecto, he identificado: ${foundInfo.join(', ')}.`
      : 'Entiendo que quieres crear un trabajo.';

    if (missingInfo.length > 0) {
      message += ` Para completar la oferta, necesito más información sobre: ${missingInfo.join(', ')}.`;
    }

    const hasMinimumData = ValidationHelpers.hasMinimumData(finalData);
    let status = 'incomplete';

    if (hasMinimumData) {
      if (isConfirmingPublish) {
        status = 'ready_to_publish';
        message = '¡Perfecto! Voy a crear la oferta de trabajo ahora...';
      } else {
        status = 'complete';
        message = `¡Perfecto! He recopilado toda la información necesaria para crear la oferta de trabajo:

📋 **RESUMEN DE LA OFERTA:**
• **Posición:** ${finalData.position}
• **Horario:** ${finalData.schedule}
• **Salario:** $${finalData.salary?.toLocaleString()}
• **Contrato:** ${finalData.contract}
• **Vacantes:** ${finalData.vacancies}
• **Experiencia:** ${finalData.yearsOfExperience} años
• **Período:** ${finalData.period}
• **Descripción:** ${finalData.description}
• **Funciones:** ${finalData.functions}
• **Requisitos:** ${finalData.requirements}
• **Preguntas:** ${finalData.questions?.length || 0} pregunta(s)

¿Quieres que publique esta oferta de trabajo o prefieres cambiar algo?`;
      }
    }

    return { message, status };
  }

  /**
   * Add similar jobs to response
   */
  static async addSimilarJobs(response, finalData, ragService) {
    try {
      const similarJobs = await ragService.searchSimilarJobs(finalData, 3);
      if (similarJobs.length > 0) {
        response.similarJobs = similarJobs;
        if (response.status === 'complete' || response.status === 'incomplete') {
          response.message += `\n\n📋 **TRABAJOS SIMILARES:**\nHe encontrado ${similarJobs.length} trabajo(s) similar(es) que puedes usar como referencia.`;
        }
      }
    } catch (error) {
      console.error('❌ [MCP] Error fetching similar jobs in fallback:', error);
    }
  }

  /**
   * Add recommended candidates to response
   */
  static async addRecommendedCandidates(response, finalData, isAskingForCandidates, status, ragService) {
    if (isAskingForCandidates || status === 'complete') {
      try {
        const recommendedCandidates = await ragService.searchSimilarApplicants(finalData, 5);
        if (recommendedCandidates.length > 0) {
          response.recommendedCandidates = recommendedCandidates.map(rec => ({
            name: `${rec.employee.user?.name || ''} ${rec.employee.user?.surname || ''}`.trim(),
            email: rec.employee.user?.email || 'No email',
            similarity: Math.round(rec.similarity * 100),
            matchReasons: rec.matchReasons || [],
            employeeId: rec.employee.id,
            hasExperience: rec.employee.experiences?.length > 0,
            hasEducation: rec.employee.educations?.length > 0
          }));
          response.message += `\n\n👥 **CANDIDATOS RECOMENDADOS:**\nHe encontrado ${recommendedCandidates.length} candidato(s) que coinciden con los requisitos del puesto "${finalData.position}".`;
        } else if (isAskingForCandidates) {
          response.message += `\n\n👥 **CANDIDATOS:**\nNo he encontrado candidatos recomendados que coincidan exactamente con los requisitos del puesto "${finalData.position}".`;
        }
      } catch (error) {
        console.error('❌ [MCP] Error fetching recommended candidates in fallback:', error);
      }
    }
  }
}

module.exports = FallbackResponseBuilder;

