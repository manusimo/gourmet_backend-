import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import xss from 'xss';
import cookieParser from 'cookie-parser';

// Import middleware
import { ddosMonitoring } from './middleware/ddosMonitoring.js';
import { performanceMonitoring } from './middleware/performanceMonitoring.js';
import { errorTrackingMiddleware, Logger } from './middleware/errorTracking.js';
import { enhancedSecurityMiddleware } from './middleware/security.js';

// Import routes
import authRoutes from './routes/auth.route.js';
import contactRoutes from './routes/contact.route.js';
import employeeRoutes from './routes/employee.route.js';
import companyRoutes from './routes/company.route.js';
import jobRoutes from './routes/job.route.js';
import applicationRoutes from './routes/application.route.js';
import poolRoutes from './routes/pool.route.js';
import chatRoutes from './routes/chat.route.js';
import adminRoutes from './routes/admin.route.js';
import csrfProtectionRoutes from './routes/csrfProtection.route.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// ENHANCED SECURITY CONFIGURATION
// ============================================================================

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

app.use(cookieParser());

// Apply XSS protection after body parsing
app.use(xssMiddleware);

// ============================================================================
// ENHANCED CORS CONFIGURATION
// ============================================================================

const allowedOrigins = [process.env.FRONTEND_URL, process.env.CHAT_SERVICE_URL];

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

// ============================================================================
// ENHANCED RATE LIMITING
// ============================================================================

// General rate limiting with enhanced security
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { 
    success: false, 
    error: 'Too many requests, please try again later' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  },
  onLimitReached: (req, res) => {
    Logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.originalUrl
    });
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
  onLimitReached: (req, res) => {
    Logger.error('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.originalUrl
    });
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

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Apply specific rate limiting to vulnerable endpoints
app.use('/api/signin', authLimiter);
app.use('/api/signup', authLimiter);
app.use('/api/password-reset-request', authLimiter);
app.use('/api/password-reset-confirm', authLimiter);
app.use('/api/contact', contactLimiter);
app.use('/api/mfa', mfaLimiter);

// ============================================================================
// HEALTH CHECK ENDPOINT (BEFORE AUTHENTICATION)
// ============================================================================

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

// ============================================================================
// API ROUTE HANDLERS
// ============================================================================

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

// ============================================================================
// SECURITY ENDPOINT
// ============================================================================

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

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

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

// ============================================================================
// SERVER STARTUP AND GRACEFUL SHUTDOWN
// ============================================================================

const server = app.listen(PORT, () => {
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
});

// Enhanced graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  Logger.info(`${signal} received. Shutting down gracefully...`);
  
  server.close(() => {
    Logger.info('HTTP server closed');
    console.log('HTTP server closed');
    
    // Close database connections
    // prisma.$disconnect() if needed
    
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

export default app;
