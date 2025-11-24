/**
 * Data Cleaning Utilities for Job Creation
 * Handles cleaning and validation of extracted job data
 */

class JobDataCleaner {
  /**
   * Clean extracted data from AI response
   */
  static cleanExtractedData(data) {
    const cleaned = {};
    
    // Clean string fields
    const stringFields = ['position', 'schedule', 'contract', 'propina', 'period', 'description', 'requirements', 'functions'];
    stringFields.forEach(field => {
      if (data[field]) cleaned[field] = data[field].trim();
    });
    
    // Clean numeric fields
    const numericFields = ['salary', 'vacancies', 'yearsOfExperience'];
    numericFields.forEach(field => {
      if (data[field] && !isNaN(data[field])) {
        cleaned[field] = parseInt(data[field]);
      }
    });
    
    // Clean questions array
    if (Array.isArray(data.questions)) {
      cleaned.questions = data.questions.filter(q => q && q.trim()).map(q => q.trim());
    }
    
    return cleaned;
  }

  /**
   * Validate required fields for job creation
   */
  static validateJobData(data) {
    const requiredFields = ['position', 'schedule', 'contract', 'salary', 'description'];
    const missingFields = requiredFields.filter(field => !data[field] || data[field] === '');
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }

  /**
   * Prepare job data for database insertion
   */
  static prepareJobData(extractedData, restaurantContext) {
    // locationId should come from:
    // 1. extractedData (if user specified it in conversation)
    // 2. restaurantContext.locationId (if provided in request)
    // 3. null (will be selected by user in frontend before final creation)
    // We should NOT default to 1 as that might be incorrect
    const locationId = extractedData.locationId || restaurantContext.locationId || null;
    
    return {
      ...extractedData,
      restaurantId: restaurantContext.id,
      restaurantUserId: restaurantContext.userId,
      locationId: locationId
    };
  }
}

module.exports = JobDataCleaner;

