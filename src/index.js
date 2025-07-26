import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.route.js';
import employeeRoutes from './routes/employee.route.js';
import companyRoutes from './routes/company.route.js';
import jobRoutes from './routes/job.route.js';
import applicationRoutes from './routes/application.route.js';
import chatRoutes from './routes/chat.route.js';
import poolRoutes from './routes/pool.route.js';
import csrfProtectionRoutes from './routes/csrfProtection.route.js';
import adminRouter from './routes/admin.route.js';
import contactRoutes from './routes/contact.route.js';

const app = express();

// BARE MINIMUM SECURITY: Request size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

const allowedOrigins = [process.env.FRONTEND_URL, process.env.CHAT_SERVICE_URL];

const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
  credentials: true,
};

app.use(cors(corsOptions));

// BARE MINIMUM SECURITY: Basic rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to auth routes
app.use('/api/signin', authLimiter);
app.use('/api/signup', authLimiter);

app.use('/api', authRoutes);
app.use('/api', contactRoutes);
app.use('/api', employeeRoutes);
app.use('/api', companyRoutes);
app.use('/api', jobRoutes);
app.use('/api', applicationRoutes);
app.use('/api', chatRoutes);
app.use('/api', poolRoutes);
app.use('/api', csrfProtectionRoutes);
app.use('/api/admin', adminRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
