const nodemailer = require('nodemailer');
const { sendEmailViaBrevoApi } = require('./brevoApi.js');

// Email provider configurations
const EMAIL_PROVIDERS = {
  brevo: {
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Add connection timeout
    connectionTimeout: 10000,
    // Add greeting timeout
    greetingTimeout: 10000,
    // Add socket timeout
    socketTimeout: 10000,
  },
  
  // Alternative Brevo SMTP configuration
  brevo_alt: {
    host: 'smtp.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  },
  
  // TLS configuration
  brevo_tls: {
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    requireTLS: true,
    tls: {
      rejectUnauthorized: false
    },
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  }
};

async function sendEmail({ to, subject, text, html }) {
  console.log('📧 Email send attempt started:');
  console.log('  - To:', to);
  console.log('  - Subject:', subject);
  console.log('  - Method: Brevo API (Primary)');
  
  // Try Brevo API first (more reliable)
  if (process.env.BREVO_API_KEY) {
    console.log('🚀 Using Brevo API method...');
    const apiResult = await sendEmailViaBrevoApi({ to, subject, text, html });
    
    if (apiResult.success) {
      console.log('✅ Email sent successfully via Brevo API!');
      return apiResult;
    } else {
      console.log('⚠️ Brevo API failed, falling back to SMTP...');
      console.log('  - API Error:', apiResult.error);
    }
  } else {
    console.log('⚠️ Brevo API key not configured, using SMTP...');
  }
  
  // Fallback to SMTP if API fails or is not configured
  console.log('📧 Falling back to SMTP method...');
  const providers = ['brevo', 'brevo_alt', 'brevo_tls'];
  
  // Check if SMTP credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ Neither Brevo API key nor SMTP credentials configured.');
    return { success: false, error: 'No email credentials configured' };
  }

  // Try each SMTP provider configuration
  for (const provider of providers) {
    try {
      console.log(`🔧 Trying SMTP provider: ${provider}`);
      const config = EMAIL_PROVIDERS[provider];
      
      let transporter = nodemailer.createTransport(config);

      console.log('🔐 Verifying SMTP connection...');
      await transporter.verify();
      console.log(`✅ SMTP connection verified with ${provider}`);

      const emailData = {
        from: `"Gourmet Jobs" <${process.env.EMAIL_USER}>`, 
        to: to,
        subject: subject,
        text: text,
        html: html,
        headers: {
          'X-Mailer': 'Gourmet Jobs Platform',
          'X-Priority': '3',
          'X-MSMail-Priority': 'Normal',
          'Importance': 'Normal'
        },
        replyTo: 'noreply@gourmetjobs.com'
      };
      
      console.log('📤 Sending email via SMTP...');
      let info = await transporter.sendMail(emailData);

      console.log('✅ Email sent successfully via SMTP!');
      console.log('  - Message ID:', info.messageId);
      console.log('  - Response:', info.response);
      
      return { success: true, messageId: info.messageId, method: 'smtp', provider };
      
    } catch (error) {
      console.error(`❌ SMTP Error with provider ${provider}:`, error.message);
      
      // If this is the last provider, return the error
      if (provider === providers[providers.length - 1]) {
        return { success: false, error: error.message, method: 'smtp', lastProvider: provider };
      }
      
      console.log(`🔄 Trying next SMTP provider...`);
    }
  }
}

// Batch email sending for high volume
async function sendBatchEmails(emails) {
  const results = [];
  
  for (const email of emails) {
    try {
      const result = await sendEmail(email);
      results.push({ ...result, to: email.to });
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      results.push({ success: false, error: error.message, to: email.to });
    }
  }
  
  return results;
}

// Test function to verify email configuration
async function testEmail() {
  console.log('🧪 Testing email configuration...');
  
  const result = await sendEmail({
    to: 'vergarabarbosa@gmail.com', // Use a real email for testing
    subject: 'Test Email from Gourmet Jobs',
    text: 'This is a test email from Gourmet Jobs platform.',
    html: '<p>This is a <b>test email</b> from Gourmet Jobs platform.</p>'
  });
  
  return result;
}

module.exports = { sendEmail, sendBatchEmails, testEmail };
