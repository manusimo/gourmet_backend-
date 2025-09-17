const nodemailer = require('nodemailer');

// Email provider configurations
const EMAIL_PROVIDERS = {
  brevo: {
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  }
};

async function sendEmail({ to, subject, text, html }) {
  // Use Brevo for all environments
  const provider = 'brevo';
  
  console.log('📧 Email send attempt started:');
  console.log('  - To:', to);
  console.log('  - Subject:', subject);
  console.log('  - Provider:', provider);
  console.log('  - EMAIL_USER:', process.env.EMAIL_USER);
  console.log('  - EMAIL_PASS:', process.env.EMAIL_PASS ? 'Set' : 'Not set');
  
  // Check if Brevo credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ Brevo credentials not configured. Skipping email send.');
    console.warn('Please set EMAIL_USER and EMAIL_PASS in your .env file');
    return { success: false, error: 'Brevo credentials not configured' };
  }

  try {
    const config = EMAIL_PROVIDERS[provider];
    console.log('📧 Email config:', {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.auth.user, pass: config.auth.pass ? 'Set' : 'Not set' }
    });
    
    let transporter = nodemailer.createTransport(config);

    // Verify connection configuration
    console.log('📧 Verifying email server connection...');
    await transporter.verify();
    console.log(`✅ Email server connection verified (${provider})`);

    const emailData = {
      from: process.env.EMAIL_USER, 
      to: to,
      subject: subject,
      text: text,
      html: html,
    };
    
    console.log('📧 Sending email with data:', {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      hasText: !!emailData.text,
      hasHtml: !!emailData.html
    });

    let info = await transporter.sendMail(emailData);

    console.log('✅ Message sent successfully!');
    console.log('  - Message ID:', info.messageId);
    console.log('  - Response:', info.response);
    console.log('  - Accepted:', info.accepted);
    console.log('  - Rejected:', info.rejected);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    
    if (error.code === 'EAUTH') {
      console.error('🔐 Brevo authentication failed. Please check your EMAIL_USER and EMAIL_PASS');
      console.error('💡 Make sure your Brevo SMTP credentials are correct');
    }
    
    return { success: false, error: error.message };
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

module.exports = { sendEmail, sendBatchEmails };
