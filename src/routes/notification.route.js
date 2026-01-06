const express = require('express');
const { getUserIdFromCookie } = require('../helpers/cookies.js');
const { sendSuccessResponse, handleNotificationError } = require('../utils/responseHelpers.js');
const Logger = require('../utils/logger.js');
const { getNotifications, markNotificationAsReadById } = require('../services/notificationService.js');
const router = express.Router();

/**
 * Get all notifications for the authenticated user
 */
router.get('/', getUserIdFromCookie, async (req, res) => {
  try {
    const result = await getNotifications({
      userId: req.userId,
      limit: 50
    });

    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleNotificationError(res, error, {
      context: {
        userId: req.userId
      },
      logger: Logger
    });
  }
});

/**
 * Mark a specific notification as read
 */
router.put('/:id/read', getUserIdFromCookie, async (req, res) => {
  try {
    await markNotificationAsReadById({
      notificationId: req.params.id,
      userId: req.userId
    });

    sendSuccessResponse(res, 200, 'Notification marked as read');
  } catch (error) {
    handleNotificationError(res, error, {
      context: {
        notificationId: req.params.id,
        userId: req.userId
      },
      logger: Logger
    });
  }
});

/**
 * Mark all notifications as read for the authenticated user
 */
router.put('/mark-all-read', getUserIdFromCookie, async (req, res) => {
  try {
    const userId = req.userId;

    await prisma.notification.updateMany({
      where: { 
        userId,
        isRead: false 
      },
      data: { isRead: true }
    });

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read'
    });
  }
});

/**
 * Mark notifications as read by conversationId
 */
router.put('/mark-read-by-conversation/:conversationId', getUserIdFromCookie, async (req, res) => {
  try {
    const userId = req.userId;
    const conversationId = parseInt(req.params.conversationId);
    // Get all unread MESSAGE notifications first
    const allUnread = await prisma.notification.findMany({
      where: {
        userId,
        type: 'MESSAGE',
        isRead: false
      }
    });

    // Filter by conversationId by parsing JSON data
    const toMarkAsRead = allUnread.filter(notif => {
      if (!notif.data) return false;
      try {
        const parsed = JSON.parse(notif.data);
        // Handle both string and integer conversationId (stored as "5" but compared to 5)
        const notifConversationId = parsed.conversationId;
        // Use == for type coercion or convert both to same type
        return notifConversationId == conversationId || 
               parseInt(notifConversationId) === conversationId ||
               notifConversationId === conversationId.toString();
      } catch {
        // Fallback: check if string contains conversationId (handle both "5" and 5 formats)
        return notif.data.includes(`"conversationId":${conversationId}`) || 
               notif.data.includes(`"conversationId": ${conversationId}`) ||
               notif.data.includes(`"conversationId":"${conversationId}"`);
      }
    });

    // Mark them as read
    let result = { count: 0 };
    if (toMarkAsRead.length > 0) {
      result = await prisma.notification.updateMany({
        where: {
          id: { in: toMarkAsRead.map(n => n.id) }
        },
        data: { isRead: true }
      });
    }

    res.json({
      success: true,
      message: 'Notifications marked as read',
      count: result.count
    });
  } catch (error) {
    console.error('❌ Error marking notifications as read by conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read'
    });
  }
});

/**
 * Delete a specific notification
 */
router.delete('/:id', getUserIdFromCookie, async (req, res) => {
  try {
    const userId = req.userId;
    const notificationId = parseInt(req.params.id);

    const notification = await prisma.notification.deleteMany({
      where: { 
        id: notificationId,
        userId // Ensure user can only delete their own notifications
      }
    });

    if (notification.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification'
    });
  }
});

/**
 * Create a new notification (internal use)
 */
router.post('/', getUserIdFromCookie, async (req, res) => {
  try {
    const { userId, type, title, message, data } = req.body;

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: data ? JSON.stringify(data) : null
      }
    });

    res.status(201).json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create notification'
    });
  }
});

module.exports = router;
