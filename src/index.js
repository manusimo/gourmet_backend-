// Load environment variables
// Use path relative to this file to ensure .env is found regardless of working directory
const path = require('path');
const envPath = path.join(__dirname, '../.env');
const envResult = require('dotenv').config({ path: envPath });

// Log environment variable loading status
if (envResult.error) {
  console.warn('⚠️  [ENV] Warning: Could not load .env file:', envResult.error.message);
  console.log('📁 [ENV] Looking for .env at:', envPath);
} else {
  console.log('✅ [ENV] Environment variables loaded from:', envPath);
  console.log('🔑 [ENV] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `SET (length: ${process.env.OPENAI_API_KEY.length})` : 'NOT SET');
}

// Ensure WHATWG ReadableStream exists (used by MCP SDK SSE client)
try {
  if (!globalThis.ReadableStream) {
    const { ReadableStream, TransformStream, WritableStream } = require('stream/web');
    globalThis.ReadableStream = ReadableStream;
    globalThis.TransformStream = TransformStream;
    globalThis.WritableStream = WritableStream;
  }
} catch (_) {
  // ignore if not available
}

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss');
const cookieParser = require('cookie-parser');
const multer = require('multer');

// Import middleware
const { ddosMonitoring } = require('./middleware/ddosMonitoring.js');
const { performanceMonitoring } = require('./middleware/performanceMonitoring.js');
const { errorTrackingMiddleware, Logger } = require('./middleware/errorTracking.js');
const { enhancedSecurityMiddleware } = require('./middleware/security.js');

// Import routes
const authRoutes = require('./routes/auth.route.js');
const contactRoutes = require('./routes/contact.route.js');
const employeeRoutes = require('./routes/employee.route.js');
const companyRoutes = require('./routes/company.route.js');
const jobRoutes = require('./routes/job.route.js');
const applicationRoutes = require('./routes/application.route.js');
const poolRoutes = require('./routes/pool.route.js');
const chatRoutes = require('./routes/chat.route.js');
const adminRoutes = require('./routes/admin.route.js');
const csrfProtectionRoutes = require('./routes/csrfProtection.route.js');
const notificationRoutes = require('./routes/notification.route.js');
const signedUrlRoutes = require('./routes/signedUrl.route.js');
// const meetingRoutes = require('./routes/meeting.route.js');
// const meetingAgentRoutes = require('./routes/meetingAgent.route.js');
// MCP server is now standalone - no embedded server needed

// MCP routes will be mounted after server starts

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Heroku (required for rate limiting and IP detection)
app.set('trust proxy', 1);

// Remove x-powered-by header
app.disable('x-powered-by');

// Add comprehensive security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false // Needed for CORS
}));

// Apply monitoring middleware early (before security to track attacks)
app.use(ddosMonitoring);
app.use(performanceMonitoring);

// Apply enhanced security middleware to all routes
app.use(enhancedSecurityMiddleware);

// Enhanced XSS Protection middleware
const xssMiddleware = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitizeObject = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = xss(obj[key], {
            whiteList: {}, // No HTML tags allowed
            stripIgnoreTag: true,
            stripIgnoreTagBody: ['script']
          });
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    };
    sanitizeObject(req.body);
  }
  next();
};

// Enhanced request size limits with security considerations
app.use(express.json({ 
  limit: '2mb', // Reduced from 10mb for security
  strict: true,
  verify: (req, res, buf) => {
    // Check for malformed JSON
    try {
      JSON.parse(buf);
    } catch (e) {
      Logger.error('Malformed JSON detected', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: buf.length
      });
      res.status(400).json({ 
        success: false, 
        message: 'Invalid JSON format' 
      });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ 
  limit: '2mb', 
  extended: true,
  parameterLimit: 100 // Limit number of parameters
}));

// Configure multer for handling multipart/form-data (file uploads)
const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory for processing
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common file types
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and documents are allowed.'));
    }
  }
});

// Apply multer middleware to handle multipart/form-data globally
app.use(upload.any());

app.use(cookieParser());

// Apply XSS protection after body parsing
app.use(xssMiddleware);

const allowedOrigins = [
  process.env.FRONTEND_URL, 
  process.env.CHAT_SERVICE_URL,
  'http://localhost:3001', // Frontend development server
  'http://localhost:3000',  // Backend development server
  'https://gourmetjobs.cl',
  'https://www.gourmetjobs.cl',
  'https://api.makisoftwareagency.cl',
  'https://api.makisoftwareagency.com', // Backend API domain
  'https://makisoftwareagency.com' // Previous frontend domain (for backwards compatibility)
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      Logger.warn('CORS violation attempt', {
        origin,
        timestamp: new Date().toISOString()
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With', 'X-MFA-Token'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));


// General rate limiting for all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000 requests per window for development
  message: { 
    success: false, 
    error: 'Too many requests, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and development
    return req.path === '/health' || req.path === '/api/health' || process.env.NODE_ENV === 'development';
  }
});

// Strict rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { 
    success: false, 
    error: 'Too many login attempts, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development mode
    return process.env.NODE_ENV === 'dev';
  }
});

// Contact form rate limiting
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 contact submissions per hour
  message: { 
    success: false, 
    error: 'Too many contact submissions, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// MFA-specific rate limiting
const mfaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 MFA attempts per window
  message: { 
    success: false, 
    error: 'Too many MFA attempts, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all routes EXCEPT MCP endpoints
app.use((req, res, next) => {
  // Skip rate limiting for MCP endpoints
  if (req.path.startsWith('/mcp/')) {
    return next();
  }
  return generalLimiter(req, res, next);
});

// Apply specific rate limiting to vulnerable endpoints
app.use('/api/signin', authLimiter);
app.use('/api/signup', authLimiter);
app.use('/api/password-reset-request', authLimiter);
app.use('/api/password-reset-confirm', authLimiter);
app.use('/api/set-password', authLimiter);
app.use('/api/contact', contactLimiter);
app.use('/api/mfa', mfaLimiter);
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    security: {
      ddosMonitoring: 'active',
      performanceMonitoring: 'active',
      errorTracking: 'active',
      enhancedSecurity: 'active'
    }
  });
});

app.use('/api', authRoutes);
app.use('/api', contactRoutes);
app.use('/api', employeeRoutes);
app.use('/api', companyRoutes);
app.use('/api', jobRoutes);
app.use('/api', applicationRoutes);
app.use('/api', poolRoutes);
app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', csrfProtectionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/company', signedUrlRoutes);
// app.use('/api', meetingRoutes);
// app.use('/api', meetingAgentRoutes);

// Mount AI Job Creation routes (MCP routes)
try {
  const { aiJobCreationRoutes } = require('./routes/mcp');
  app.use('/api/ai-job-creation', aiJobCreationRoutes);
  console.log('🧭 AI Job Creation routes mounted');
} catch (e) {
  console.error('❌ Failed to mount AI Job Creation routes:', e);
}

// Security status endpoint
app.get('/api/security/status', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      securityLevel: 'Enhanced',
      features: {
        sqlInjectionDetection: true,
        xssProtection: true,
        csrfProtection: true,
        rateLimiting: true,
        ddosMonitoring: true,
        performanceMonitoring: true,
        errorTracking: true,
        tokenBlacklisting: true,
        accountLockout: true,
        mfaSupport: true
      },
      headers: {
        helmet: true,
        csp: true,
        xssProtection: true,
        frameOptions: true
      }
    }
  });
});

// Error tracking middleware (before global error handler)
app.use(errorTrackingMiddleware);

// Enhanced global error handler
app.use((error, req, res, next) => {
  // Log the error
  Logger.error('Global error handler', {
    error: error.message,
    stack: error.stack,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.originalUrl,
    method: req.method
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details
    });
  }

  if (error.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token'
    });
  }

  if (error.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : error.message,
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  Logger.warn('404 - Route not found', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});


const server = app.listen(PORT, async () => {
  Logger.info('🚀 Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    memory: process.memoryUsage(),
    securityFeatures: {
      enhancedSecurity: true,
      ddosMonitoring: true,
      performanceMonitoring: true,
      errorTracking: true,
      sqlInjectionDetection: true,
      accountLockout: true,
      tokenBlacklisting: true,
      mfaSupport: true
    }
  });

  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🛡️  Enhanced security middleware enabled`);
  console.log(`📊 Health check available at /health`);
  console.log(`🔍 DDoS monitoring active - Email alerts enabled`);
  console.log(`⚡ Performance monitoring active`);
  console.log(`📝 Error tracking & logging enabled`);
  console.log(`🔒 SQL injection detection active`);
  console.log(`🔐 Account lockout mechanism active`);
  console.log(`🎫 Token blacklisting active`);
  console.log(`🔑 Multi-factor authentication support enabled`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🛡️  Security status: /api/security/status`);

  // MCP routes are now mounted above with other routes
});

// Enhanced graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  Logger.info(`${signal} received. Shutting down gracefully...`);
  
  server.close(async () => {
    Logger.info('HTTP server closed');
    console.log('HTTP server closed');
    
    // MCP server is standalone - no cleanup needed
    
    // Close database connections
    try {
      const { prisma } = require('./db.js');
      await prisma.$disconnect();
      console.log('🗄️ Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
    }
    
    Logger.info('Process terminated');
    console.log('Process terminated');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    Logger.error('Could not close connections in time, forcefully shutting down');
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle different termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions with enhanced logging
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
    pid: process.pid
  });
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections with enhanced logging
process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection', {
    reason: reason?.toString(),
    promise: promise?.toString(),
    pid: process.pid
  });
  console.error('Unhandled Rejection:', reason);
});

module.exports = app;
