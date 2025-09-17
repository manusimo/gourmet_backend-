const { sendEmail } = require('../helpers/email.js');

/**
 * Send email notification for job application
 * @param {Object} applicationData - Application details
 * @param {string} applicationData.applicantName - Name of the applicant
 * @param {string} applicationData.applicantEmail - Email of the applicant
 * @param {string} applicationData.jobTitle - Title of the job
 * @param {string} applicationData.restaurantName - Name of the restaurant
 * @param {string} applicationData.restaurantEmail - Email of the restaurant owner/HR
 * @param {string} applicationData.applicationId - ID of the application
 */
const sendJobApplicationNotification = async (applicationData) => {
  try {
    console.log('📧 Job application notification - Input data:', applicationData);
    
    const {
      applicantName,
      applicantEmail,
      jobTitle,
      restaurantName,
      restaurantEmail,
      applicationId,
      isMilestone = false,
      totalApplications = 0
    } = applicationData;
    
    console.log('📧 Job application notification - Extracted data:');
    console.log('  - Applicant:', applicantName, applicantEmail);
    console.log('  - Job:', jobTitle);
    console.log('  - Restaurant:', restaurantName, restaurantEmail);
    console.log('  - Application ID:', applicationId);

    const emailData = {
      to: restaurantEmail,
      subject: isMilestone 
        ? `🎉 ¡${totalApplications} postulaciones para ${jobTitle} en ${restaurantName}!`
        : `Nueva postulación para ${jobTitle} en ${restaurantName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #fb5424 0%, #e04a1f 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">
              ${isMilestone ? '🎉 ¡Hito Alcanzado!' : '🍽️ Nueva Postulación'}
            </h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            ${isMilestone 
              ? `<h2 style="color: #333; margin-top: 0;">🎉 ¡Felicidades! Has alcanzado ${totalApplications} postulaciones</h2>
                 <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                   <h3 style="margin: 0; font-size: 28px;">${totalApplications} Postulaciones</h3>
                   <p style="margin: 10px 0 0 0; font-size: 16px;">para el puesto de <strong>${jobTitle}</strong></p>
                 </div>
                 <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                   <h3 style="color: #28a745; margin-top: 0;">📊 Estadísticas del puesto:</h3>
                   <p><strong>💼 Puesto:</strong> ${jobTitle}</p>
                   <p><strong>🏪 Restaurante:</strong> ${restaurantName}</p>
                   <p><strong>📈 Total de postulaciones:</strong> ${totalApplications}</p>
                   <p><strong>👤 Último postulante:</strong> ${applicantName}</p>
                 </div>`
              : `<h2 style="color: #333; margin-top: 0;">¡Tienes una nueva postulación!</h2>
                 <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #fb5424;">
                   <h3 style="color: #fb5424; margin-top: 0;">Detalles de la postulación:</h3>
                   <p><strong>👤 Postulante:</strong> ${applicantName}</p>
                   <p><strong>📧 Email:</strong> ${applicantEmail}</p>
                   <p><strong>💼 Puesto:</strong> ${jobTitle}</p>
                   <p><strong>🏪 Restaurante:</strong> ${restaurantName}</p>
                   <p><strong>🆔 ID de postulación:</strong> ${applicationId}</p>
                 </div>`
            }
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/panel-empresa/trabajos/${applicationId}/postulantes" 
                 style="background: ${isMilestone ? '#28a745' : '#fb5424'}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                ${isMilestone ? 'Ver Todas las Postulaciones' : 'Ver Postulación'}
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Este email fue enviado automáticamente por Gourmet Jobs. 
              <br>No respondas a este email.
            </p>
          </div>
        </div>
      `,
      text: `
        Nueva postulación para ${jobTitle} en ${restaurantName}
        
        Postulante: ${applicantName}
        Email: ${applicantEmail}
        Puesto: ${jobTitle}
        Restaurante: ${restaurantName}
        ID de postulación: ${applicationId}
        
        Ver postulación: ${process.env.FRONTEND_URL || 'http://localhost:3001'}/panel-empresa/trabajos/${applicationId}/postulantes
      `
    };

    await sendEmail(emailData);
    console.log('✅ Job application notification sent successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending job application notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send email notification for new message
 * @param {Object} messageData - Message details
 * @param {string} messageData.senderName - Name of the sender
 * @param {string} messageData.senderEmail - Email of the sender
 * @param {string} messageData.recipientName - Name of the recipient
 * @param {string} messageData.recipientEmail - Email of the recipient
 * @param {string} messageData.messagePreview - Preview of the message
 * @param {string} messageData.restaurantName - Name of the restaurant
 * @param {string} messageData.conversationId - ID of the conversation
 */
const sendMessageNotification = async (messageData) => {
  try {
    const {
      senderName,
      senderEmail,
      recipientName,
      recipientEmail,
      messagePreview,
      restaurantName,
      conversationId
    } = messageData;

    const emailData = {
      to: recipientEmail,
      subject: `Nuevo mensaje de ${senderName} - ${restaurantName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #fb5424 0%, #e04a1f 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">💬 Nuevo Mensaje</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <h2 style="color: #333; margin-top: 0;">¡Tienes un nuevo mensaje!</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #fb5424;">
              <h3 style="color: #fb5424; margin-top: 0;">Detalles del mensaje:</h3>
              <p><strong>👤 De:</strong> ${senderName}</p>
              <p><strong>📧 Email:</strong> ${senderEmail}</p>
              <p><strong>🏪 Restaurante:</strong> ${restaurantName}</p>
              <p><strong>💬 Mensaje:</strong> ${messagePreview}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/panel-empresa/inbox-empresa/${conversationId}" 
                 style="background: #fb5424; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Ver Conversación
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Este email fue enviado automáticamente por Gourmet Jobs. 
              <br>No respondas a este email.
            </p>
          </div>
        </div>
      `,
      text: `
        Nuevo mensaje de ${senderName} - ${restaurantName}
        
        De: ${senderName}
        Email: ${senderEmail}
        Restaurante: ${restaurantName}
        Mensaje: ${messagePreview}
        
        Ver conversación: ${process.env.FRONTEND_URL || 'http://localhost:3001'}/panel-empresa/inbox-empresa/${conversationId}
      `
    };

    await sendEmail(emailData);
    console.log('✅ Message notification sent successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending message notification:', error);
    return { success: false, error: error.message };
  }
};


module.exports = {
  sendJobApplicationNotification,
  sendMessageNotification
};