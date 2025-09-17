const { prisma } = require('../db.js');
const { sendJobApplicationNotification } = require('./emailService.js');
const { createJobApplicationNotification, createJobApplicationNotificationForSpecificUser } = require('./notificationService.js');

/**
 * Process notifications for a job application
 * @param {Object} params - Application parameters
 * @param {number} params.jobPostId - Job post ID
 * @param {number} params.employeeId - Employee ID
 * @param {number} params.applicationId - Application ID
 * @param {Object} params.jobPost - Job post data
 */
const processApplicationNotifications = async ({ jobPostId, employeeId, applicationId, jobPost }) => {
  try {
    console.log(`🔔 Processing notifications for application ${applicationId} to job ${jobPostId}`);

    // Get total application count for this job post
    const totalApplications = await prisma.application.count({
      where: { jobPostId: jobPostId }
    });

    console.log(`📊 Job ${jobPostId} now has ${totalApplications} applications`);

    // Check if this is a milestone (50, 100, 150, 200, etc.)
    const isMilestone = totalApplications > 0 && totalApplications % 50 === 0;
    
    if (isMilestone) {
      await sendMilestoneEmailNotification({
        jobPostId,
        employeeId,
        applicationId,
        jobPost,
        totalApplications
      });
    }

    // Always create in-app notification for every application
    await createInAppNotification({
      jobPostId,
      employeeId,
      applicationId,
      jobPost
    });

    console.log('✅ Application notifications processed successfully');
  } catch (error) {
    console.error('❌ Failed to process application notifications:', error);
    // Don't throw error - notifications shouldn't break application creation
  }
};

/**
 * Send milestone email notification
 * @param {Object} params - Milestone notification parameters
 */
const sendMilestoneEmailNotification = async ({ jobPostId, employeeId, applicationId, jobPost, totalApplications }) => {
  try {
    console.log(`🎯 Milestone reached: ${totalApplications} applications for job ${jobPostId}`);
    
    // Get restaurant and employee details for notification
    const [restaurant, employee] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: jobPost.restaurantId },
        select: { 
          name: true, 
          user: { select: { email: true } },
          restaurantUsers: {
            include: { user: { select: { email: true } } }
          }
        }
      }),
      prisma.employee.findUnique({
        where: { id: employeeId },
        select: { user: { select: { name: true, email: true } } }
      })
    ]);

    if (restaurant && employee) {
      // Collect all email addresses (owner + all staff)
      const allEmails = [
        restaurant.user.email, // Restaurant owner
        ...restaurant.restaurantUsers.map(ru => ru.user.email) // All staff members
      ];

      // Remove duplicates
      const uniqueEmails = [...new Set(allEmails)];

      // Send milestone email notification to all users
      const emailPromises = uniqueEmails.map(email => 
        sendJobApplicationNotification({
          applicantName: employee.user.name,
          applicantEmail: employee.user.email,
          jobTitle: jobPost.position,
          restaurantName: restaurant.name,
          restaurantEmail: email, // Send to each user individually
          applicationId: applicationId,
          isMilestone: true,
          totalApplications: totalApplications
        })
      );

      await Promise.all(emailPromises);
      console.log(`📧 Milestone email notification sent to ${uniqueEmails.length} users for ${totalApplications} applications`);
    }
  } catch (error) {
    console.error('❌ Failed to send milestone email notification:', error);
  }
};

/**
 * Create in-app notification for application
 * @param {Object} params - In-app notification parameters
 */
const createInAppNotification = async ({ jobPostId, employeeId, applicationId, jobPost }) => {
  try {
    // Get employee and restaurant details
    const [employee, restaurant] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        select: { user: { select: { name: true } } }
      }),
      prisma.restaurant.findUnique({
        where: { id: jobPost.restaurantId },
        select: { name: true }
      })
    ]);

    if (employee && restaurant) {
      // Create notification for ALL restaurant staff (admin + staff)
      await createJobApplicationNotification({
        restaurantUserId: jobPost.restaurantUserId,
        applicantName: employee.user.name,
        jobTitle: jobPost.position,
        restaurantName: restaurant.name,
        applicationId: applicationId
      });
      console.log('🔔 In-app notification created for all restaurant staff');
    }
  } catch (error) {
    console.error('❌ Failed to create in-app notification:', error);
  }
};

module.exports = {
  processApplicationNotifications
};
