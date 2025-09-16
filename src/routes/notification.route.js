const express = require('express');
const { prisma } = require('../db.js');
const { getUserIdFromCookie } = require('../helpers/cookies.js');
const router = express.Router();

// Test route to verify notification routes are working
router.get('/test', (req, res) => {
  console.log('🔔 Notification test route hit!');
  res.json({ success: true, message: 'Notification routes are working!' });
});

/**
 * Get all notifications for the authenticated user
 */
router.get('/', getUserIdFromCookie, async (req, res) => {
  try {
    console.log('🔔 Notification route: GET / called');
    console.log('🔔 Notification route: req.userId:', req.userId);
    console.log('🔔 Notification route: req.cookies:', req.cookies);
    console.log('🔔 Notification route: req.headers:', req.headers);
    
    const userId = req.userId;
    console.log('🔔 Notification route: userId:', userId);
    
    console.log('🔔 Notification route: Fetching notifications from database...');
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to last 50 notifications
    });
    console.log('🔔 Notification route: Found notifications:', notifications.length);

    console.log('🔔 Notification route: Counting unread notifications...');
    const unreadCount = await prisma.notification.count({
      where: { 
        userId,
        isRead: false 
      }
    });
    console.log('🔔 Notification route: Unread count:', unreadCount);

    const response = {
      success: true,
      notifications,
      unreadCount
    };
    console.log('🔔 Notification route: Sending response:', response);

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

/**
 * Mark a specific notification as read
 */
router.put('/:id/read', getUserIdFromCookie, async (req, res) => {
  try {
    const userId = req.userId;
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
