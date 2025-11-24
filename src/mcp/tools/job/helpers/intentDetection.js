/**
 * Intent Detection Helpers
 * Detects user intent for messaging, scheduling, and candidate requests
 */

class IntentDetection {
  /**
   * Check if user is asking for candidates/recommendations
   */
  static isCandidateRequest(userMessage, conversationHistory = []) {
    const lowerMessage = userMessage.toLowerCase();
    const candidateKeywords = [
      'candidatos', 'candidato', 'recomend', 'tienes candidatos',
      'busca candidatos', 'hay candidatos', 'candidatos para',
      'personas para', 'gente para', 'trabajadores', 'empleados',
      'aplicantes', 'postulantes'
    ];
    
    if (candidateKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return true;
    }
    
    const historyMessages = conversationHistory.map(msg => 
      typeof msg === 'string' ? msg : msg.content || ''
    ).join(' ').toLowerCase();
    
    return candidateKeywords.some(keyword => historyMessages.includes(keyword));
  }

  /**
   * Detect if user wants to message candidates
   */
  static detectMessagingIntent(userMessage, aiResponse) {
    const lowerMessage = userMessage.toLowerCase();
    const messagingKeywords = [
      'escribe', 'escribir', 'mensajea', 'mensajear', 'contacta', 'contactar',
      'envía', 'enviar', 'envia', 'escribeles', 'escribirles', 'write them',
      'message them', 'contact them', 'send message'
    ];
    
    const wantsToMessage = messagingKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasCandidates = aiResponse.recommendedCandidates && aiResponse.recommendedCandidates.length > 0;
    
    return {
      shouldMessage: wantsToMessage && hasCandidates,
      messageAll: lowerMessage.includes('todos') || lowerMessage.includes('all'),
      candidateName: this.extractCandidateName(userMessage, aiResponse.recommendedCandidates)
    };
  }

  /**
   * Detect if user wants to schedule a call
   */
  static detectSchedulingIntent(userMessage, aiResponse) {
    const lowerMessage = userMessage.toLowerCase();
    const schedulingKeywords = [
      'programa', 'programar', 'agenda', 'agendar', 'llamada', 'entrevista',
      'schedule', 'set a call', 'book a call', 'interview'
    ];
    
    const wantsToSchedule = schedulingKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasCandidates = aiResponse.recommendedCandidates && aiResponse.recommendedCandidates.length > 0;
    
    return {
      shouldSchedule: wantsToSchedule && hasCandidates,
      candidateName: this.extractCandidateName(userMessage, aiResponse.recommendedCandidates)
    };
  }

  /**
   * Extract candidate name from user message
   */
  static extractCandidateName(userMessage, candidates) {
    if (!candidates || candidates.length === 0) return null;
    
    for (const candidate of candidates) {
      if (userMessage.toLowerCase().includes(candidate.name.toLowerCase().split(' ')[0])) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Check if user is confirming to publish
   */
  static isConfirmingPublish(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    return lowerMessage.includes('sí') || 
           lowerMessage.includes('si') || 
           lowerMessage.includes('publicar') || 
           lowerMessage.includes('crear') || 
           lowerMessage.includes('ok') || 
           lowerMessage.includes('dale') ||
           lowerMessage.includes('perfecto');
  }

  /**
   * Check if user wants to see recommended candidates (after job creation)
   */
  static wantsToSeeCandidates(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    const positiveKeywords = [
      'sí', 'si', 'yes', 'ok', 'dale', 'perfecto', 'claro', 'por favor',
      'busca', 'buscar', 'muestra', 'mostrar', 'recomienda', 'recomendar',
      'quiero ver', 'dame', 'muéstrame', 'muestrame'
    ];
    
    // Check if it's a positive response to candidate question
    const isPositive = positiveKeywords.some(keyword => lowerMessage.includes(keyword));
    const isCandidateRequest = this.isCandidateRequest(userMessage, []);
    
    return isPositive || isCandidateRequest;
  }
}

module.exports = IntentDetection;

