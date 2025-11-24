/**
 * Candidate Action Handler
 * Handles messaging and scheduling actions for candidates
 */

const { prisma } = require('../../../../db.js');

class CandidateActionHandler {
  /**
   * Handle messaging candidates
   */
  static async handleMessaging(intent, aiResponse, restaurantContext) {
    try {
      const { getToolHandler } = require('../../index');
      const sendMessageHandler = getToolHandler('send_message_to_candidate');
      
      if (!sendMessageHandler) {
        console.warn('⚠️ [MCP] send_message_to_candidate handler not found');
        return;
      }

      const candidates = intent.messageAll 
        ? aiResponse.recommendedCandidates 
        : (intent.candidateName ? [intent.candidateName] : aiResponse.recommendedCandidates);

      const defaultMessage = `¡Hola! Hemos revisado tu perfil y nos gustaría invitarte a postularte para el puesto de ${aiResponse.extractedData?.position || 'nuestro restaurante'}. ¿Te interesaría conocer más detalles?`;

      let successCount = 0;
      for (const candidate of candidates) {
        try {
          const result = await sendMessageHandler(
            {
              restaurantUserId: restaurantContext.userId,
              employeeId: candidate.employeeId,
              message: defaultMessage,
              jobId: aiResponse.jobId
            },
            { prisma }
          );

          if (result && !result.isError) {
            successCount++;
          }
        } catch (error) {
          console.error(`❌ [MCP] Error sending message to candidate ${candidate.employeeId}:`, error);
        }
      }

      if (successCount > 0) {
        aiResponse.message += `\n\n✅ He enviado mensajes a ${successCount} candidato(s) exitosamente.`;
      }
    } catch (error) {
      console.error('❌ [MCP] Error handling messaging candidates:', error);
      aiResponse.message += `\n\n⚠️ Hubo un error al enviar los mensajes. Por favor intenta de nuevo.`;
    }
  }

  /**
   * Handle scheduling a call
   */
  static async handleScheduling(intent, aiResponse, restaurantContext) {
    try {
      const { getToolHandler } = require('../../index');
      const scheduleHandler = getToolHandler('schedule_interview_call');
      
      if (!scheduleHandler) {
        console.warn('⚠️ [MCP] schedule_interview_call handler not found');
        return;
      }

      const candidate = intent.candidateName || aiResponse.recommendedCandidates[0];
      
      // Default to tomorrow at 10 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const result = await scheduleHandler(
        {
          restaurantId: restaurantContext.id,
          employeeId: candidate.employeeId,
          title: `Entrevista para ${aiResponse.extractedData?.position || 'el puesto'}`,
          description: `Entrevista para el puesto de ${aiResponse.extractedData?.position || 'nuestro restaurante'}`,
          scheduledDate: tomorrow.toISOString(),
          duration: 30
        },
        { prisma }
      );

      if (result && !result.isError) {
        aiResponse.message += `\n\n✅ He programado una llamada con ${candidate.name} para mañana a las 10:00 AM.`;
      }
    } catch (error) {
      console.error('❌ [MCP] Error scheduling call:', error);
      aiResponse.message += `\n\n⚠️ Hubo un error al programar la llamada. Por favor intenta de nuevo.`;
    }
  }
}

module.exports = CandidateActionHandler;

