const { prisma } = require('../db.js');

/**
 * Create contact submission
 * @param {Object} contactData - Contact submission data
 * @param {string} contactData.name - Contact name
 * @param {string} contactData.email - Contact email
 * @param {string} [contactData.phone] - Contact phone (optional)
 * @param {string} contactData.subject - Contact subject
 * @param {string} contactData.message - Contact message
 * @returns {Promise<Object>} Created contact submission
 */
const createContactSubmission = async ({ name, email, phone, subject, message }) => {
  return await prisma.contactSubmission.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      subject: subject.trim(),
      message: message.trim()
    }
  });
};

module.exports = {
  createContactSubmission
};

