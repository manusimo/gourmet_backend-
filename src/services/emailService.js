const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
    const {
      applicantName,
      applicantEmail,
      jobTitle,
      restaurantName,
      restaurantEmail,
      applicationId
    } = applicationData;

    const msg = {
      to: restaurantEmail,
      from: {
        email: 'noreply@gourmetjobs.cl',
        name: 'Gourmet Jobs'
      },
      subject: `Nueva postulación para ${jobTitle} en ${restaurantName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #fb5424 0%, #e04a1f 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🍽️ Nueva Postulación</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <h2 style="color: #333; margin-top: 0;">¡Tienes una nueva postulación!</h2>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #fb5424;">
              <h3 style="color: #fb5424; margin-top: 0;">Detalles de la postulación:</h3>
              <p><strong>👤 Postulante:</strong> ${applicantName}</p>
              <p><strong>📧 Email:</strong> ${applicantEmail}</p>
              <p><strong>💼 Puesto:</strong> ${jobTitle}</p>
              <p><strong>🏪 Restaurante:</strong> ${restaurantName}</p>
              <p><strong>🆔 ID de postulación:</strong> ${applicationId}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/panel-empresa/trabajos/${applicationId}/postulantes" 
                 style="background: #fb5424; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Ver Postulación
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

    await sgMail.send(msg);
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

    const msg = {
      to: recipientEmail,
      from: {
        email: 'noreply@gourmetjobs.cl',
        name: 'Gourmet Jobs'
      },
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

    await sgMail.send(msg);
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
