import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.route.js';
import employeeRoutes from './routes/employee.route.js';
import companyRoutes from './routes/company.route.js';
import jobRoutes from './routes/job.route.js';
import applicationRoutes from './routes/application.route.js';
import chatRoutes from './routes/chat.route.js';
import poolRoutes from './routes/pool.route.js';

const app = express();

app.use(express.json());
app.use(cookieParser());

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  optionsSuccessStatus: 200,
  credentials: true,
};

app.use(cors(corsOptions));

// Setup routes
app.use('/api', authRoutes);
app.use('/api', employeeRoutes);
app.use('/api', companyRoutes);
app.use('/api', jobRoutes);
app.use('/api', applicationRoutes);
app.use('/api', chatRoutes)
app.use('/api', poolRoutes)

const PORT = process.env.PORT; 
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
