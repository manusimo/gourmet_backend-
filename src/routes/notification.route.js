const express = require('express');
const { prisma } = require('../db.js');
const { authenticateToken } = require('../middleware/authenticateToken.js');
const router = express.Router();

/**
 * Get all notifications for the authenticated user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to last 50 notifications
    });

    const unreadCount = await prisma.notification.count({
      where: { 
        userId,
        isRead: false 
      }
    });

    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

/**
 * Mark a specific notification as read
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = parseInt(req.params.id);

    const notification = await prisma.notification.updateMany({
      where: { 
        id: notificationId,
        userId // Ensure user can only update their own notifications
      },
      data: { isRead: true }
    });

    if (notification.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

/**
 * Mark all notifications as read for the authenticated user
 */
router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

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
 * Delete a specific notification
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
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
router.post('/', authenticateToken, async (req, res) => {
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
