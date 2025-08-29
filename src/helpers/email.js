const nodemailer = require('nodemailer');

// Email provider configurations
const EMAIL_PROVIDERS = {
  gmail: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  },
  sendgrid: {
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      pass: process.env.SENDGRID_API_KEY,
    }
  }
};

async function sendEmail({ to, subject, text, html }) {
  // Determine provider based on environment
  const provider = process.env.NODE_ENV === 'production' ? 'sendgrid' : 'gmail';
  
  // Check if credentials are configured for the selected provider
  if (provider === 'gmail' && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
    console.warn('⚠️ Gmail credentials not configured. Skipping email send.');
    console.warn('Please set EMAIL_USER and EMAIL_PASS in your .env file');
    return { success: false, error: 'Gmail credentials not configured' };
  }
  
  if (provider === 'sendgrid' && !process.env.SENDGRID_API_KEY) {
    console.warn('⚠️ SendGrid API key not configured. Skipping email send.');
    console.warn('Please set SENDGRID_API_KEY in your .env file');
    return { success: false, error: 'SendGrid API key not configured' };
  }

  try {
    const config = EMAIL_PROVIDERS[provider];
    let transporter = nodemailer.createTransport(config);

    // Verify connection configuration
    await transporter.verify();
    console.log(`✅ Email server connection verified (${provider})`);

    let info = await transporter.sendMail({
      from: provider === 'gmail' ? process.env.EMAIL_USER : process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_USER, 
      to: to,
      subject: subject,
      text: text,
      html: html,
    });

    console.log('✅ Message sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    
    if (error.code === 'EAUTH') {
      if (provider === 'gmail') {
        console.error('🔐 Gmail authentication failed. Please check your EMAIL_USER and EMAIL_PASS');
        console.error('💡 For Gmail, you need to use an App Password, not your regular password');
      } else {
        console.error('🔐 SendGrid authentication failed. Please check your SENDGRID_API_KEY');
      }
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
