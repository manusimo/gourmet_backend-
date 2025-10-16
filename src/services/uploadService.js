const AWS = require('aws-sdk');
const crypto = require('crypto');
const path = require('path');

// Wasabi configuration
const WASABI_BUCKET = process.env.WASABI_BUCKET_NAME;
const WASABI_REGION = process.env.WASABI_REGION || 'us-east-1';
const WASABI_ENDPOINT = process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com';

// Debug logging
console.log('🔧 Wasabi Configuration:');
console.log('  - Bucket:', WASABI_BUCKET);
console.log('  - Region:', WASABI_REGION);
console.log('  - Endpoint:', WASABI_ENDPOINT);
console.log('  - Access Key ID:', process.env.WASABI_ACCESS_KEY_ID ? 'Set' : 'Missing');
console.log('  - Secret Key ID:', process.env.WASABI_SECRET_KEY_ID ? 'Set' : 'Missing');

// Configure AWS SDK for Wasabi
AWS.config.update({
  accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
  secretAccessKey: process.env.WASABI_SECRET_KEY_ID,
  region: WASABI_REGION,
});

const wasabiS3 = new AWS.S3({
  endpoint: WASABI_ENDPOINT,
  region: WASABI_REGION,
  s3ForcePathStyle: true, // Required for Wasabi
});

// File validation
const allowedMimeTypes = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp'
];

const maxFileSize = 5 * 1024 * 1024; // 5MB

// Generate unique filename
const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalName);
  return `${timestamp}-${randomString}${extension}`;
};

// Validate file
const validateFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { 
      valid: false, 
      error: `Invalid file type. Only ${allowedMimeTypes.join(', ')} are allowed.` 
    };
  }

  if (file.size > maxFileSize) {
    return { 
      valid: false, 
      error: `File too large. Maximum size is ${maxFileSize / (1024 * 1024)}MB` 
    };
  }

  return { valid: true };
};

// Upload single file to Wasabi
const uploadFile = async (file, folder = 'uploads') => {
  try {
    console.log('📤 uploadFile called for:', file.originalname, 'in folder:', folder);
    console.log('📤 uploadFile mimetype/size:', file.mimetype, file.size, 'buffer bytes:', file && file.buffer ? file.buffer.length : 'no buffer');
    
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      console.log('❌ File validation failed for:', file.originalname, validation.error);
      return {
        success: false,
        error: validation.error
      };
    }

    const uniqueFileName = generateUniqueFileName(file.originalname);
    const key = `${folder}/${uniqueFileName}`;
    console.log('📤 Generated key:', key);

    const params = {
      Bucket: WASABI_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
      // No ACL - keep bucket private for security
    };

    console.log('📤 Uploading to Wasabi with params:', { Bucket: params.Bucket, Key: params.Key, ContentType: params.ContentType });
    const result = await wasabiS3.upload(params).promise();
    console.log('✅ Upload successful for:', file.originalname, 'Location:', result.Location);
    
    return {
      success: true,
      url: result.Location,
      key: key,
      size: file.size,
      type: file.mimetype
    };
  } catch (error) {
    console.error('❌ Error uploading to Wasabi for file:', file && file.originalname ? file.originalname : 'unknown', error.message);
    if (error && error.stack) {
      console.error(error.stack);
    }
    return {
      success: false,
      error: error.message
    };
  }
};

// Upload multiple files to Wasabi
const uploadMultipleFiles = async (files, folder = 'uploads') => {
  try {
    console.log('📤 uploadMultipleFiles called with:', files.length, 'files');
    console.log('📤 Files details:', files.map(file => ({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    })));
    console.log('📤 Buffers present?:', files.map(f => (f && f.buffer ? f.buffer.length : 'no buffer')));
    
    if (!files || files.length === 0) {
      console.log('❌ No files provided to uploadMultipleFiles');
      return {
        success: false,
        error: 'No files provided'
      };
    }

    // Validate all files first
    console.log('📤 Validating files...');
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        console.log('❌ File validation failed:', file.originalname, validation.error);
        return {
          success: false,
          error: validation.error
        };
      }
    }
    console.log('✅ All files validated successfully');

    // Upload all files
    console.log('📤 Starting parallel uploads...');
    const uploadPromises = files.map((file, index) => {
      console.log(`📤 Uploading file ${index + 1}/${files.length}:`, file.originalname);
      return uploadFile(file, folder);
    });
    
    const results = await Promise.all(uploadPromises);
    console.log('📤 Upload results:', results);

    // Check if any uploads failed
    const failedUploads = results.filter(result => !result.success);
    if (failedUploads.length > 0) {
      console.log('❌ Some uploads failed:', failedUploads);
      return {
        success: false,
        error: `Failed to upload ${failedUploads.length} files`,
        details: failedUploads.map(result => result.error)
      };
    }

    console.log('✅ All files uploaded successfully');
    return {
      success: true,
      files: results,
      count: results.length
    };
  } catch (error) {
    console.error('❌ Error uploading multiple files to Wasabi:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Delete file from Wasabi
const deleteFile = async (key) => {
  try {
    const params = {
      Bucket: WASABI_BUCKET,
      Key: key
    };

    await wasabiS3.deleteObject(params).promise();
    return { success: true };
  } catch (error) {
    console.error('Error deleting from Wasabi:', error);
    return { success: false, error: error.message };
  }
};

// Extract key from Wasabi URL
const extractKeyFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // Remove leading slash
  } catch (error) {
    console.error('Error extracting key from URL:', error);
    return null;
  }
};

module.exports = {
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
  extractKeyFromUrl,
  validateFile,
  generateUniqueFileName
};