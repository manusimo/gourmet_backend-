const SibApiV3Sdk = require('@getbrevo/brevo');

/**
 * Send email using Brevo API (more reliable than SMTP)
 * @param {Object} emailData - Email data
 * @param {string} emailData.to - Recipient email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.text - Plain text content
 * @param {string} emailData.html - HTML content
 */
async function sendEmailViaBrevoApi({ to, subject, text, html }) {
  try {
    console.log('📧 [BREVO API] Email send attempt started:');
    console.log('  - To:', to);
    console.log('  - Subject:', subject);
    console.log('  - API Key:', process.env.BREVO_API_KEY ? 'Set' : 'Not set');
    
    // Check if API key is configured
    if (!process.env.BREVO_API_KEY) {
      console.warn('⚠️ Brevo API key not configured. Skipping email send.');
      console.warn('Please set BREVO_API_KEY in your .env file');
      return { success: false, error: 'Brevo API key not configured' };
    }

    // Initialize Brevo API
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    apiInstance.setApiKey(0, process.env.BREVO_API_KEY);

    // Prepare email data
    const emailPayload = {
      sender: {
        name: 'Gourmet Jobs',
        email: 'vergarabarbosa@gmail.com' // Using verified email
      },
      to: [
        {
          email: to,
          name: to.split('@')[0] // Use email prefix as name
        }
      ],
      subject: subject,
      htmlContent: html,
      textContent: text,
      headers: {
        'X-Mailer': 'Gourmet Jobs Platform',
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal'
      }
    };

    console.log('📤 [BREVO API] Sending email via API...');
    
    // Send email via Brevo API
    const result = await apiInstance.sendTransacEmail(emailPayload);
    
    console.log('✅ [BREVO API] Email sent successfully!');
    console.log('  - Message ID:', result.messageId);
    console.log('  - Result:', result);
    
    return { 
      success: true, 
      messageId: result.messageId,
      method: 'brevo_api'
    };
    
  } catch (error) {
    console.error('❌ [BREVO API] Error sending email:');
    console.error('  - Error name:', error.name);
    console.error('  - Error message:', error.message);
    console.error('  - Error response:', error.response?.body || 'No response body');
    
    // Handle specific error cases
    if (error.response?.status === 401) {
      console.error('🔐 Authentication failed. Check your Brevo API key.');
    } else if (error.response?.status === 400) {
      console.error('📝 Bad request. Check your email data format.');
    } else if (error.response?.status === 429) {
      console.error('⏰ Rate limit exceeded. Try again later.');
    }
    
    return { 
      success: false, 
      error: error.message,
      method: 'brevo_api'
    };
  }
}

/**
 * Test function to verify Brevo API configuration
 */
async function testBrevoApi() {
  console.log('🧪 [BREVO API] Testing Brevo API configuration...');
  
  const result = await sendEmailViaBrevoApi({
    to: 'vergarabarbosa@gmail.com',
    subject: 'Test Email from Gourmet Jobs (API)',
    text: 'This is a test email from Gourmet Jobs platform using Brevo API.',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #fb5424;">Test Email (Brevo API)</h1>
        <p>This is a test email to verify the Brevo API email system is working properly.</p>
        <p>If you receive this email, the API notification system is working correctly!</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Method:</strong> Brevo API<br>
          <strong>Timestamp:</strong> ${new Date().toISOString()}
        </div>
      </div>
    `
  });
  
  return result;
}

module.exports = { 
  sendEmailViaBrevoApi, 
  testBrevoApi 
};
