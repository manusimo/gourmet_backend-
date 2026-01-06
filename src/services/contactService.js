const Logger = require('../utils/logger.js');
const { createContactSubmission } = require('../helpers/contactHelpers.js');

/**
 * Contact Service
 * Handles business logic for contact form operations
 */
class ContactService {
  /**
   * Submit contact form
   * @param {Object} params - Contact submission parameters
   * @param {string} params.name - Contact name
   * @param {string} params.email - Contact email
   * @param {string} [params.phone] - Contact phone (optional)
   * @param {string} params.subject - Contact subject
   * @param {string} params.message - Contact message
   * @returns {Promise<Object>} Created contact submission with formatted response
   * @throws {Error} If validation fails or creation fails
   */
  static async submitContact({ name, email, phone, subject, message }) {
    Logger.info('Submitting contact form', { email, subject });

    // Validate required fields (defense in depth)
    if (!name || !email || !subject || !message) {
      const error = new Error('All required fields must be provided');
      error.statusCode = 400;
      error.code = 'MISSING_REQUIRED_FIELDS';
      throw error;
    }

    // Create contact submission
    const submission = await createContactSubmission({
      name,
      email,
      phone,
      subject,
      message
    });

    Logger.info('Contact submission created successfully', {
      submissionId: submission.id,
      email: submission.email
    });

    // Format response data
    return {
      submissionId: submission.id,
      timestamp: submission.createdAt
    };
  }
}

module.exports = ContactService;

