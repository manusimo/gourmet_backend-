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
 * Universal function to convert any image key to actual signed URL
 * @param {string} imageUrl - The image URL (can be full Wasabi URL, blob URL, or just image key)
 * @param {string} defaultImage - Default image path if no image provided (optional)
 * @returns {string} - Actual signed URL or default image
 */
const convertImageKeyToSignedUrl = async (imageUrl, defaultImage = '/default-restaurant.png') => {
  console.log('🔗 convertImageKeyToSignedUrl called with:', { imageUrl, defaultImage });
  
  if (!imageUrl || imageUrl === 'No photo') {
    console.log('🔗 No image URL provided, returning default:', defaultImage);
    return defaultImage;
  }

  // If it's a blob URL, return as is (for local previews)
  if (imageUrl.startsWith('blob:')) {
    console.log('🔗 Image URL is a blob URL, returning as is:', imageUrl);
    return imageUrl;
  }

  // Extract key from Wasabi signed URL if it's already a full Wasabi URL
  let imageKey = imageUrl;
  
  if (imageUrl.includes('wasabisys.com')) {
    try {
      // Parse the Wasabi URL to extract the key
      // Format: https://s3.us-east-1.wasabisys.com/gourmet-staging/path/to/image.png?params
      const url = new URL(imageUrl);
      // Remove leading slash and bucket name from pathname
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      // Remove bucket name (first part after domain)
      pathParts.shift(); // Remove 'gourmet-staging'
      imageKey = pathParts.join('/');
      
      console.log('🔗 Extracted key from Wasabi URL:', imageKey);
      console.log('🔗 Regenerating signed URL to ensure it\'s not expired');
    } catch (error) {
      console.error('❌ Error parsing Wasabi URL, trying to use as key:', error.message);
      // If parsing fails, try to extract key from path directly
      const match = imageUrl.match(/wasabisys\.com\/[^\/]+\/(.+?)(?:\?|$)/);
      if (match && match[1]) {
        imageKey = match[1];
      }
    }
  } else if (imageUrl.startsWith('http')) {
    // If it's a non-Wasabi HTTP URL, return as is
    console.log('🔗 Image URL is a full non-Wasabi URL, returning as is:', imageUrl);
    return imageUrl;
  }

  // Generate a fresh signed URL for the key
  if (!imageKey.includes('http')) {
    try {
      console.log('🔗 Generating signed URL for Wasabi key:', imageKey);
      console.log('🔗 Environment variables check:', {
        WASABI_ENDPOINT: process.env.WASABI_ENDPOINT ? 'SET' : 'NOT SET',
        WASABI_REGION: process.env.WASABI_REGION ? 'SET' : 'NOT SET',
        WASABI_ACCESS_KEY_ID: process.env.WASABI_ACCESS_KEY_ID ? 'SET' : 'NOT SET',
        WASABI_SECRET_KEY_ID: process.env.WASABI_SECRET_KEY_ID ? 'SET' : 'NOT SET',
        WASABI_BUCKET_NAME: process.env.WASABI_BUCKET_NAME ? 'SET' : 'NOT SET'
      });
      
      const AWS = require('aws-sdk');
      
      const wasabiS3 = new AWS.S3({
        endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
        region: process.env.WASABI_REGION || 'us-east-1',
        accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
        secretAccessKey: process.env.WASABI_SECRET_KEY_ID,
        s3ForcePathStyle: true,
      });

      // Clean the key (remove bucket prefix if present)
      let cleanKey = imageKey;
      if (imageKey.startsWith('gourmet-staging/')) {
        cleanKey = imageKey.replace('gourmet-staging/', '');
      }

      const params = {
        Bucket: process.env.WASABI_BUCKET_NAME,
        Key: cleanKey,
        Expires: 3600 // URL valid for 1 hour
      };

      console.log('🔗 S3 params:', params);
      const signedUrl = wasabiS3.getSignedUrl('getObject', params);
      console.log('🔗 Generated signed URL for key:', cleanKey, '->', signedUrl);
      return signedUrl;
    } catch (error) {
      console.error('❌ Error generating signed URL for:', imageKey, error.message);
      console.error('❌ Full error:', error);
      return defaultImage;
    }
  }

  // Fallback: return as is if we couldn't process it
  console.log('🔗 Could not process image URL, returning as is:', imageUrl);
  return imageUrl;
};

/**
 * Universal function to convert image URLs in any object or array
 * @param {Object|Array} data - Object or array containing image URLs
 * @param {Array} imageFields - Array of field names that contain image URLs
 * @returns {Object|Array} - Data with converted image URLs
 */
const convertImageUrls = async (data, imageFields = ['profileImageUrl', 'profileCarouselUrls']) => {
  if (!data) return data;

  // Handle arrays
  if (Array.isArray(data)) {
    return await Promise.all(
      data.map(item => convertImageUrls(item, imageFields))
    );
  }

  // Handle objects
  if (typeof data === 'object') {
    const convertedData = { ...data };
    
    for (const field of imageFields) {
      if (convertedData[field]) {
        if (Array.isArray(convertedData[field])) {
          // Handle arrays of image URLs (like profileCarouselUrls)
          convertedData[field] = await Promise.all(
            convertedData[field].map(url => convertImageKeyToSignedUrl(url))
          );
        } else {
          // Handle single image URL
          convertedData[field] = await convertImageKeyToSignedUrl(convertedData[field]);
        }
      }
    }
    
    return convertedData;
  }

  return data;
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
  convertImageKeyToSignedUrl,
  convertImageUrls, // Universal function for any data type
  isBlobUrl,
  isSignedUrlEndpoint
};
