const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');

const prisma = new PrismaClient();

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Email templates
const getEmailTemplate = (type, meeting, reason = null) => {
  const { employee, restaurant, scheduledDate, title, description, meetingLink } = meeting;
  const employeeName = employee?.user?.name || 'Applicant';
  const restaurantName = restaurant?.name || 'Restaurant';
  const meetingDate = new Date(scheduledDate).toLocaleString('es-CL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago'
  });

  const baseTemplate = {
    from: process.env.EMAIL_USER,
    to: employee.user.email,
    subject: '',
    html: ''
  };

  switch (type) {
    case 'meeting_scheduled':
      return {
        ...baseTemplate,
        subject: `🎯 Reunión programada con ${restaurantName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">¡Hola ${employeeName}!</h2>
            <p>Nos complace informarte que hemos programado una reunión contigo.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2c3e50; margin-top: 0;">📅 Detalles de la reunión</h3>
              <p><strong>Restaurante:</strong> ${restaurantName}</p>
              <p><strong>Título:</strong> ${title}</p>
              <p><strong>Fecha y hora:</strong> ${meetingDate}</p>
              ${description ? `<p><strong>Descripción:</strong> ${description}</p>` : ''}
              ${meetingLink ? `<p><strong>Enlace de la reunión:</strong> <a href="${meetingLink}" style="color: #3498db;">${meetingLink}</a></p>` : ''}
            </div>
            
            <p>Por favor, asegúrate de estar disponible en la fecha y hora programada. Si necesitas reprogramar, puedes contactarnos a través de la plataforma.</p>
            
            <p>¡Esperamos conocerte pronto!</p>
            <p>El equipo de ${restaurantName}</p>
          </div>
        `
      };

    case 'meeting_updated':
      return {
        ...baseTemplate,
        subject: `🔄 Reunión actualizada con ${restaurantName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">¡Hola ${employeeName}!</h2>
            <p>Te informamos que hemos actualizado los detalles de tu reunión.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2c3e50; margin-top: 0;">📅 Detalles actualizados</h3>
              <p><strong>Restaurante:</strong> ${restaurantName}</p>
              <p><strong>Título:</strong> ${title}</p>
              <p><strong>Fecha y hora:</strong> ${meetingDate}</p>
              ${description ? `<p><strong>Descripción:</strong> ${description}</p>` : ''}
              ${meetingLink ? `<p><strong>Enlace de la reunión:</strong> <a href="${meetingLink}" style="color: #3498db;">${meetingLink}</a></p>` : ''}
            </div>
            
            <p>Por favor, revisa los nuevos detalles y asegúrate de estar disponible.</p>
            
            <p>El equipo de ${restaurantName}</p>
          </div>
        `
      };

    case 'meeting_cancelled':
      return {
        ...baseTemplate,
        subject: `❌ Reunión cancelada con ${restaurantName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">¡Hola ${employeeName}!</h2>
            <p>Lamentamos informarte que hemos cancelado la reunión programada.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2c3e50; margin-top: 0;">📅 Reunión cancelada</h3>
              <p><strong>Restaurante:</strong> ${restaurantName}</p>
              <p><strong>Título:</strong> ${title}</p>
              <p><strong>Fecha programada:</strong> ${meetingDate}</p>
            </div>
            
            <p>Te contactaremos pronto para reprogramar una nueva reunión.</p>
            <p>Gracias por tu comprensión.</p>
            
            <p>El equipo de ${restaurantName}</p>
          </div>
        `
      };

    case 'meeting_rescheduled':
      return {
        ...baseTemplate,
        subject: `🔄 Reunión reprogramada con ${restaurantName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">¡Hola ${employeeName}!</h2>
            <p>Te informamos que hemos reprogramado tu reunión.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2c3e50; margin-top: 0;">📅 Nueva fecha y hora</h3>
              <p><strong>Restaurante:</strong> ${restaurantName}</p>
              <p><strong>Título:</strong> ${title}</p>
              <p><strong>Nueva fecha y hora:</strong> ${meetingDate}</p>
              ${description ? `<p><strong>Descripción:</strong> ${description}</p>` : ''}
              ${meetingLink ? `<p><strong>Enlace de la reunión:</strong> <a href="${meetingLink}" style="color: #3498db;">${meetingLink}</a></p>` : ''}
              ${reason ? `<p><strong>Motivo del cambio:</strong> ${reason}</p>` : ''}
            </div>
            
            <p>Por favor, asegúrate de estar disponible en la nueva fecha y hora.</p>
            
            <p>El equipo de ${restaurantName}</p>
          </div>
        `
      };

    default:
      return baseTemplate;
  }
};

// Create in-app notification
const createInAppNotification = async (userId, type, title, message, data = null) => {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: data ? JSON.stringify(data) : null
      }
    });
  } catch (error) {
    console.error('Error creating in-app notification:', error);
  }
};

// Main notification processing function
const processMeetingNotifications = async ({ meeting, type, restaurantId, employeeId, reason = null }) => {
  try {
    console.log(`🔔 Processing ${type} notification for meeting:`, meeting.id);

    // Get employee and restaurant details
    const [employee, restaurant] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: true }
      }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        include: { user: true }
      })
    ]);

    if (!employee || !restaurant) {
      console.error('Employee or restaurant not found for notification');
      return;
    }

    // Create in-app notification for employee
    const notificationMessages = {
      meeting_scheduled: {
        title: 'Reunión programada',
        message: `Tienes una reunión programada con ${restaurant.name}`
      },
      meeting_updated: {
        title: 'Reunión actualizada',
        message: `Se han actualizado los detalles de tu reunión con ${restaurant.name}`
      },
      meeting_cancelled: {
        title: 'Reunión cancelada',
        message: `Se ha cancelado tu reunión con ${restaurant.name}`
      },
      meeting_rescheduled: {
        title: 'Reunión reprogramada',
        message: `Se ha reprogramado tu reunión con ${restaurant.name}`
      }
    };

    const notification = notificationMessages[type];
    if (notification) {
      await createInAppNotification(
        employee.userId,
        'meeting',
        notification.title,
        notification.message,
        { meetingId: meeting.id, type }
      );
    }

    // Send email notification
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = createTransporter();
      const emailTemplate = getEmailTemplate(type, meeting, reason);

      await transporter.sendMail(emailTemplate);
      console.log(`✅ Email notification sent to ${employee.user.email}`);
    } else {
      console.log('⚠️ Email credentials not configured, skipping email notification');
    }

    // Create in-app notification for restaurant staff
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: { restaurantId },
      include: { user: true }
    });

    const restaurantNotificationMessages = {
      meeting_scheduled: {
        title: 'Reunión programada',
        message: `Se ha programado una reunión con ${employee.user.name}`
      },
      meeting_updated: {
        title: 'Reunión actualizada',
        message: `Se han actualizado los detalles de la reunión con ${employee.user.name}`
      },
      meeting_cancelled: {
        title: 'Reunión cancelada',
        message: `Se ha cancelado la reunión con ${employee.user.name}`
      },
      meeting_rescheduled: {
        title: 'Reunión reprogramada',
        message: `Se ha reprogramado la reunión con ${employee.user.name}`
      }
    };

    const restaurantNotification = restaurantNotificationMessages[type];
    if (restaurantNotification) {
      for (const restaurantUser of restaurantUsers) {
        await createInAppNotification(
          restaurantUser.userId,
          'meeting',
          restaurantNotification.title,
          restaurantNotification.message,
          { meetingId: meeting.id, type, employeeId }
        );
      }
    }

    console.log(`✅ All notifications processed for meeting ${meeting.id}`);

  } catch (error) {
    console.error('Error processing meeting notifications:', error);
  }
};

// Send meeting reminder
const sendMeetingReminder = async (meetingId) => {
  try {
    const meeting = await prisma.scheduledCall.findUnique({
      where: { id: meetingId },
      include: {
        employee: {
          include: { user: true }
        },
        restaurant: true
      }
    });

    if (!meeting || meeting.status !== 'scheduled') {
      return;
    }

    const meetingDate = new Date(meeting.scheduledDate);
    const now = new Date();
    const timeDiff = meetingDate.getTime() - now.getTime();
    const hoursUntilMeeting = timeDiff / (1000 * 60 * 60);

    // Send reminder if meeting is within 24 hours
    if (hoursUntilMeeting <= 24 && hoursUntilMeeting > 0) {
      const reminderTemplate = {
        from: process.env.EMAIL_USER,
        to: meeting.employee.user.email,
        subject: `⏰ Recordatorio: Reunión mañana con ${meeting.restaurant.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">¡Hola ${meeting.employee.user.name}!</h2>
            <p>Este es un recordatorio de que tienes una reunión programada mañana.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2c3e50; margin-top: 0;">📅 Detalles de la reunión</h3>
              <p><strong>Restaurante:</strong> ${meeting.restaurant.name}</p>
              <p><strong>Título:</strong> ${meeting.title}</p>
              <p><strong>Fecha y hora:</strong> ${meetingDate.toLocaleString('es-CL', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Santiago'
              })}</p>
              ${meeting.meetingLink ? `<p><strong>Enlace de la reunión:</strong> <a href="${meeting.meetingLink}" style="color: #3498db;">${meeting.meetingLink}</a></p>` : ''}
            </div>
            
            <p>¡Nos vemos mañana!</p>
            <p>El equipo de ${meeting.restaurant.name}</p>
          </div>
        `
      };

      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const transporter = createTransporter();
        await transporter.sendMail(reminderTemplate);
        console.log(`✅ Reminder sent for meeting ${meetingId}`);
      }
    }

  } catch (error) {
    console.error('Error sending meeting reminder:', error);
  }
};

module.exports = {
  processMeetingNotifications,
  sendMeetingReminder
};
