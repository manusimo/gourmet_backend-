/**
 * Utility functions for handling image URLs and converting them to signed URL endpoints
 */

/**
 * Convert company image URLs to signed URL endpoints
 * @param {Object} restaurant - Restaurant object with image URLs
 * @returns {Object} Restaurant object with converted image URLs
 */
const convertCompanyImageUrls = (restaurant) => {
  if (!restaurant) {
    return restaurant;
  }

  const convertedRestaurant = { ...restaurant };

  // For now, just return the URLs as-is since signed URL endpoints aren't implemented yet
  // The frontend can handle blob URLs and direct URLs directly
  console.log('🔗 [imageUrlUtils] Returning restaurant with original image URLs (signed URL endpoints not implemented yet)');
  
  return convertedRestaurant;
};

/**
 * Convert employee image URLs to signed URL endpoints
 * @param {Object} employee - Employee object with image URLs
 * @returns {Object} Employee object with converted image URLs
 */
const convertEmployeeImageUrls = (employee) => {
  if (!employee) {
    return employee;
  }

  const convertedEmployee = { ...employee };

  // Convert profile image URL to signed URL endpoint
  if (convertedEmployee.profileImageUrl && 
      convertedEmployee.profileImageUrl !== 'No photo' &&
      !convertedEmployee.profileImageUrl.includes('signed-url') &&
      !convertedEmployee.profileImageUrl.startsWith('http')) {
    
    // If it's a blob URL, keep it as is (for local development)
    if (convertedEmployee.profileImageUrl.startsWith('blob:')) {
      console.log('🔗 [imageUrlUtils] Keeping blob URL for employee profile image:', convertedEmployee.profileImageUrl);
    } else {
      // Convert to signed URL endpoint
      convertedEmployee.profileImageUrl = `/api/employee/signed-url/${convertedEmployee.profileImageUrl}`;
      console.log('🔗 [imageUrlUtils] Converted employee profile image to signed URL endpoint:', convertedEmployee.profileImageUrl);
    }
  }

  return convertedEmployee;
};

/**
 * Check if a URL is a blob URL (for local development)
 * @param {string} url - URL to check
 * @returns {boolean} True if it's a blob URL
 */
const isBlobUrl = (url) => {
  return url && url.startsWith('blob:');
};

/**
 * Check if a URL is already a signed URL endpoint
 * @param {string} url - URL to check
 * @returns {boolean} True if it's already a signed URL endpoint
 */
const isSignedUrlEndpoint = (url) => {
  return url && url.includes('signed-url');
};

module.exports = {
  convertCompanyImageUrls,
  convertEmployeeImageUrls,
  isBlobUrl,
  isSignedUrlEndpoint
};
