const express = require('express');
const { checkAdmin, checkCompany } = require('../helpers/authenticateToken.js');
const { requireRole, setUserRole } = require('../middleware/auth.js');
const { getUserIdFromCookie, getRestaurantUserIdFromCookie } = require('../helpers/cookies.js');
const { getRestaurantUsers } = require('../middleware/company.js');
const { sendSuccessResponse, handleCompanyError } = require('../utils/responseHelpers.js');
const { Logger } = require('../middleware/errorTracking.js');
const AdminUserService = require('../services/admin/adminUserService.js');
const AdminMetricsService = require('../services/admin/adminMetricsService.js');
const AdminSecurityService = require('../services/admin/adminSecurityService.js');

const router = express.Router();

// ========== Restaurant User Management ==========

// GET /admin/users - Get all users for the company
router.get('/users', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), getRestaurantUsers, (req, res) => {
  try {
    const { restaurantUsers } = req;
    sendSuccessResponse(res, 200, null, restaurantUsers);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { restaurantId: req.restaurantId, userId: req.userId },
      logger: Logger
    });
  }
});

// POST /admin/create-user - Create a new user for the company
router.post('/create-user', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, phoneNumber } = req.body;
    const { restaurantId } = req;

    const user = await AdminUserService.createRestaurantUser({
        name,
        email,
        phoneNumber,
      restaurantId
    });

    sendSuccessResponse(res, 201, 'User created successfully', user);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { restaurantId: req.restaurantId, userId: req.userId, email },
      logger: Logger
    });
  }
});

// PATCH /admin/user/update - Update user information
router.patch('/user/update', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { id, name, email, phoneNumber } = req.body;
    const { restaurantId } = req;

    const updatedUser = await AdminUserService.updateRestaurantUser({
      userId: id,
      restaurantId,
      name,
      email,
      phoneNumber
    });

    sendSuccessResponse(res, 200, 'User updated successfully', updatedUser);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { userId: id, restaurantId: req.restaurantId, currentUserId: req.userId },
      logger: Logger
    });
  }
});

// DELETE /admin/user/:id - Delete user from restaurant
router.delete('/user/:id', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { restaurantId } = req;

    const result = await AdminUserService.deleteRestaurantUser({
      userId: id,
      restaurantId
    });

    sendSuccessResponse(res, 200, 'User deleted successfully', result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { userId: req.params.id, restaurantId: req.restaurantId, currentUserId: req.userId },
      logger: Logger
    });
  }
});

// GET /admin/user/:id - Get specific user by ID
router.get('/user/:id', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { restaurantId } = req;

    const user = await AdminUserService.getRestaurantUserById({
      userId: id,
      restaurantId
    });

    sendSuccessResponse(res, 200, null, user);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { userId: req.params.id, restaurantId: req.restaurantId, currentUserId: req.userId },
      logger: Logger
    });
  }
});

// ========== Metrics & Analytics ==========

// GET /admin/total-counts - Get total counts for dashboard
router.get('/total-counts', async (req, res) => {
  try {
    const totalCounts = await AdminMetricsService.getTotalCounts();
    sendSuccessResponse(res, 200, null, totalCounts);
    } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/total-counts' },
      logger: Logger
    });
  }
});

// GET /admin/metrics - Legacy endpoint for compatibility
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await AdminMetricsService.getMetrics();
    res.json(metrics);
    } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/metrics' },
      logger: Logger
    });
  }
});

// ========== Security & Monitoring ==========

// GET /admin/security/ddos-stats - Get DDoS monitoring statistics
router.get('/security/ddos-stats', (req, res) => {
  try {
    const stats = AdminSecurityService.getDDoSStats();
    sendSuccessResponse(res, 200, null, stats);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/security/ddos-stats' },
      logger: Logger
    });
  }
});

// POST /admin/security/reset-monitoring - Reset DDoS monitoring data
router.post('/security/reset-monitoring', (req, res) => {
  try {
    const result = AdminSecurityService.resetDDoSMonitoring();
    sendSuccessResponse(res, 200, result.message);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/security/reset-monitoring' },
      logger: Logger
    });
  }
});

// GET /admin/security/alert-config - Get current alert configuration
router.get('/security/alert-config', (req, res) => {
  try {
    const config = AdminSecurityService.getAlertConfig();
    sendSuccessResponse(res, 200, null, config);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/security/alert-config' },
      logger: Logger
    });
  }
});

// ========== Performance Monitoring ==========

// GET /admin/performance/stats - Get performance statistics
router.get('/performance/stats', (req, res) => {
  try {
    const stats = AdminSecurityService.getPerformanceStats();
    sendSuccessResponse(res, 200, null, stats);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/performance/stats' },
      logger: Logger
    });
  }
});

// GET /admin/performance/health - Get application health status
router.get('/performance/health', (req, res) => {
  try {
    const health = AdminSecurityService.getHealthStatus();
    sendSuccessResponse(res, 200, null, health);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/performance/health' },
      logger: Logger
    });
  }
});

// ========== Error Tracking ==========

// GET /admin/errors/stats - Get error statistics
router.get('/errors/stats', (req, res) => {
  try {
    const stats = AdminSecurityService.getErrorStats();
    sendSuccessResponse(res, 200, null, stats);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/errors/stats' },
      logger: Logger
    });
  }
});

// GET /admin/errors/search - Search and filter errors
router.get('/errors/search', (req, res) => {
  try {
    const result = AdminSecurityService.searchErrors(req.query);
    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/errors/search', query: req.query },
      logger: Logger
    });
  }
});

// ========== System Overview ==========

// GET /admin/system/overview - Complete system overview
router.get('/system/overview', async (req, res) => {
  try {
    const systemOverview = await AdminMetricsService.getSystemOverview();
    sendSuccessResponse(res, 200, null, systemOverview);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/system/overview' },
      logger: Logger
    });
  }
});

// ========== User Management (Admin) ==========

// GET /admin/flagged-users - Get all flagged users (locked accounts)
router.get('/flagged-users', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const result = await AdminUserService.getFlaggedUsers();
    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/flagged-users', userId: req.userId },
      logger: Logger
    });
  }
});

// POST /admin/unflag-user - Unflag a user (reset account lockout)
router.post('/unflag-user', checkCompany, getUserIdFromCookie, getRestaurantUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;

    const result = await AdminUserService.unflagUser({ userId });

    sendSuccessResponse(res, 200, result.message, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { userId: req.body.userId, currentUserId: req.userId, endpoint: '/admin/unflag-user' },
      logger: Logger
    });
  }
});

// GET /admin/all-users - Get all users (professionals and company admins)
router.get('/all-users', checkAdmin, getUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const result = await AdminUserService.getAllUsers();
    sendSuccessResponse(res, 200, null, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { endpoint: '/admin/all-users', userId: req.userId },
      logger: Logger
    });
  }
});

// DELETE /admin/delete-user - Delete a user and all related data
router.delete('/delete-user', checkAdmin, getUserIdFromCookie, setUserRole, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.body;
    const { userId: currentUserId } = req;

    const result = await AdminUserService.deleteUser({ userId, currentUserId });

    sendSuccessResponse(res, 200, result.message, result);
  } catch (error) {
    handleCompanyError(res, error, {
      context: { userId: req.body.userId, currentUserId: req.userId, endpoint: '/admin/delete-user' },
      logger: Logger
    });
  }
});

module.exports = router;