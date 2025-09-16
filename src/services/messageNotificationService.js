const { prisma } = require('../db');
const { sendMessageNotification } = require('./emailService');
const { createMessageNotification } = require('./notificationService');

/**
 * Process message notifications with smart throttling
 * @param {Object} params - Message notification parameters
 */
const processMessageNotifications = async ({
  senderUserId,
  receiverUserId,
  conversationId,
  messageText,
  senderName,
  senderEmail,
  recipientName,
  recipientEmail,
  restaurantName
}) => {
  try {
    console.log(`💬 Processing message notification for conversation ${conversationId}`);

    // Check if we should send email notification (throttling)
    const shouldSendEmail = await shouldSendEmailNotification(conversationId, receiverUserId);
    
    if (shouldSendEmail) {
      await sendMessageNotification({
        senderName,
        senderEmail,
        recipientName,
        recipientEmail,
        messagePreview: messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText,
        restaurantName,
        conversationId
      });
      console.log('📧 Message email notification sent');
    } else {
      console.log('⏰ Email notification throttled (sent recently)');
    }

    // Always create in-app notification (but update existing one)
    await createOrUpdateInAppNotification({
      recipientUserId: parseInt(receiverUserId),
      senderName,
      restaurantName,
      messagePreview: messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText,
      conversationId
    });
    console.log('🔔 In-app message notification updated');

  } catch (error) {
    console.error('❌ Failed to process message notifications:', error);
    // Don't throw error - notifications shouldn't break message sending
  }
};

/**
 * Check if we should send email notification (throttling logic)
 * @param {number} conversationId - Conversation ID
 * @param {number} receiverUserId - Receiver user ID
 * @returns {boolean} - Whether to send email
 */
const shouldSendEmailNotification = async (conversationId, receiverUserId) => {
  try {
    // Check if we sent an email notification for this conversation in the last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const recentEmailNotification = await prisma.notification.findFirst({
      where: {
        userId: receiverUserId,
        type: 'MESSAGE',
        createdAt: {
          gte: thirtyMinutesAgo
        },
        // Check if it's for the same conversation (stored in metadata)
        metadata: {
          path: ['conversationId'],
          equals: conversationId
        }
      }
    });

    // If we already sent an email recently, don't send another
    if (recentEmailNotification) {
      console.log('⏰ Email notification throttled (sent recently)');
      return false;
    }

    // Check if user has been active in this conversation recently (indicating they've seen messages)
    const userHasBeenActive = await checkUserActivityInConversation(conversationId, receiverUserId);
    
    if (userHasBeenActive) {
      console.log('👀 User has been active in conversation recently, skipping email');
      return false;
    }

    // If no recent email and user hasn't been active, we can send one
    return true;
  } catch (error) {
    console.error('❌ Error checking email notification throttle:', error);
    // If there's an error, default to sending (better to send than miss)
    return true;
  }
};

/**
 * Check if user has been active in the conversation recently
 * @param {number} conversationId - Conversation ID
 * @param {number} userId - User ID
 * @returns {boolean} - Whether user has been active
 */
const checkUserActivityInConversation = async (conversationId, userId) => {
  try {
    // Check if user has sent messages in this conversation in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    // Get user's employee or restaurant user IDs
    const [employee, restaurantUsers] = await Promise.all([
      prisma.employee.findUnique({
        where: { userId: parseInt(userId) },
        select: { id: true }
      }),
      prisma.restaurantUser.findMany({
        where: { userId: parseInt(userId) },
        select: { id: true }
      })
    ]);

    const userEntityIds = [];
    if (employee) userEntityIds.push({ senderEmployeeId: employee.id });
    if (restaurantUsers.length > 0) {
      restaurantUsers.forEach(ru => {
        userEntityIds.push({ senderRestaurantUserId: ru.id });
      });
    }

    if (userEntityIds.length === 0) {
      return false; // User has no entity IDs, can't have been active
    }

    // Check if user has sent any messages in this conversation recently
    const recentUserMessages = await prisma.message.findFirst({
      where: {
        conversationId: parseInt(conversationId),
        createdAt: {
          gte: tenMinutesAgo
        },
        OR: userEntityIds
      }
    });

    // Also check if user has read the conversation recently by looking at notification read status
    const recentNotificationRead = await prisma.notification.findFirst({
      where: {
        userId: parseInt(userId),
        type: 'MESSAGE',
        isRead: true,
        updatedAt: {
          gte: tenMinutesAgo
        },
        metadata: {
          path: ['conversationId'],
          equals: conversationId
        }
      }
    });

    return !!(recentUserMessages || recentNotificationRead);
  } catch (error) {
    console.error('❌ Error checking user activity:', error);
    return false; // If error, assume user hasn't been active
  }
};

/**
 * Create or update in-app notification for conversation
 * @param {Object} params - Notification parameters
 */
const createOrUpdateInAppNotification = async ({
  recipientUserId,
  senderName,
  restaurantName,
  messagePreview,
  conversationId
}) => {
  try {
    // Check if there's already an unread notification for this conversation
    const existingNotification = await prisma.notification.findFirst({
      where: {
        userId: recipientUserId,
        type: 'MESSAGE',
        isRead: false,
        metadata: {
          path: ['conversationId'],
          equals: conversationId
        }
      }
    });

    if (existingNotification) {
      // Update existing notification with new message preview and timestamp
      await prisma.notification.update({
        where: { id: existingNotification.id },
        data: {
          message: `Nuevo mensaje de ${senderName} en ${restaurantName}: ${messagePreview}`,
          updatedAt: new Date()
        }
      });
      console.log('🔄 Updated existing message notification');
    } else {
      // Create new notification
      await createMessageNotification({
        recipientUserId,
        senderName,
        restaurantName,
        messagePreview,
        conversationId
      });
      console.log('✨ Created new message notification');
    }
  } catch (error) {
    console.error('❌ Failed to create/update in-app notification:', error);
    throw error;
  }
};

module.exports = {
  processMessageNotifications
};
