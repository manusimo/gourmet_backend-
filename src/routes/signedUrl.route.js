const express = require('express');
const AWS = require('aws-sdk');

const router = express.Router();

// Generate signed URL for Wasabi images
router.get('/signed-url/*', async (req, res) => {
  try {
    // Extract the image key from the wildcard path
    const imageKey = req.params[0];
    console.log('🔗 Generating signed URL for key:', imageKey);
    
    const wasabiS3 = new AWS.S3({
      endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
      region: process.env.WASABI_REGION || 'us-east-1',
      accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
      secretAccessKey: process.env.WASABI_SECRET_KEY_ID,
      s3ForcePathStyle: true,
    });

    const params = {
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: imageKey,
      Expires: 3600 // URL valid for 1 hour
    };

    const signedUrl = wasabiS3.getSignedUrl('getObject', params);
    console.log('✅ Signed URL generated successfully');
    
    res.json({
      success: true,
      url: signedUrl,
      expiresIn: 3600
    });
  } catch (error) {
    console.error('❌ Error generating signed URL:', error.message);
    res.status(404).json({ 
      success: false, 
      error: 'Image not found' 
    });
  }
});

module.exports = router;