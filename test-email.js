// Test script for email notifications
const { sendJobApplicationNotification, sendMessageNotification } = require('./src/services/emailService.js');

async function testEmailNotifications() {
  console.log('🧪 Testing email notifications...');
  
  // Test job application notification
  console.log('\n📧 Testing job application notification...');
  const jobApplicationResult = await sendJobApplicationNotification({
    applicantName: 'Juan Pérez',
    applicantEmail: 'juan@example.com',
    jobTitle: 'Chef de Cocina',
    restaurantName: 'Restaurante Test',
    restaurantEmail: 'vergarabarbosa@gmail.com',
    applicationId: 123
  });
  
  console.log('Job application notification result:', jobApplicationResult);
  
  // Test message notification
  console.log('\n💬 Testing message notification...');
  const messageResult = await sendMessageNotification({
    senderName: 'María García',
    senderEmail: 'maria@example.com',
    recipientName: 'Carlos López',
    recipientEmail: 'vergarabarbosa@gmail.com',
    messagePreview: 'Hola, me interesa mucho la posición de chef...',
    restaurantName: 'Restaurante Test',
    conversationId: 456
  });
  
  console.log('Message notification result:', messageResult);
  
  // Test job application notification to second email
  console.log('\n📧 Testing job application notification to second email...');
  const jobApplicationResult2 = await sendJobApplicationNotification({
    applicantName: 'Ana Martínez',
    applicantEmail: 'ana@example.com',
    jobTitle: 'Mesero',
    restaurantName: 'Restaurante Test 2',
    restaurantEmail: 'onwaxcomm@gmail.com',
    applicationId: 124
  });
  
  console.log('Second job application notification result:', jobApplicationResult2);
  
  console.log('\n✅ Email tests completed!');
}

// Run the test
testEmailNotifications().catch(console.error);
