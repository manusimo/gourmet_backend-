# 🍽️ Gourmet Jobs Backend

A comprehensive job matching platform backend for the restaurant industry, featuring AI-powered job creation, talent matching, and intelligent candidate management.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Security](#security)
- [AI Features](#ai-features)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)

---

## 🎯 Overview

Gourmet Jobs is a full-stack job matching platform connecting restaurant employers with culinary professionals. The backend provides a robust REST API with advanced features including AI-powered job creation, intelligent candidate matching, real-time chat, and comprehensive admin tools.

### Key Capabilities

- **Job Management**: Create, manage, and track job postings
- **Application System**: Handle job applications with custom questionnaires
- **Talent Matching**: AI-powered candidate recommendations
- **Real-time Chat**: In-app messaging between employers and candidates
- **AI Agents**: Automated job creation and candidate communication
- **Admin Dashboard**: Comprehensive analytics and user management
- **Security**: Enterprise-grade authentication and authorization

---

## ✨ Features

### Core Features

- ✅ **User Authentication & Authorization**
  - JWT-based authentication with cookie support
  - Multi-factor authentication (MFA/TOTP)
  - Role-based access control (Admin, Company, Employee)
  - Account lockout protection
  - Token blacklisting

- ✅ **Job Management**
  - Create and manage job postings
  - Custom application questionnaires
  - Job filtering and search
  - Application tracking
  - Hiring workflow management

- ✅ **Talent Management**
  - Employee profiles with skills and experience
  - Talent pool management
  - Candidate recommendations
  - Application reviews and ratings

- ✅ **Communication**
  - Real-time chat system
  - Message notifications
  - Conversation management
  - Candidate messaging

- ✅ **Company Management**
  - Multi-restaurant support
  - Restaurant user management
  - Location management
  - Company profiles

### AI-Powered Features

- 🤖 **AI Job Creation Agent**
  - Natural language job posting creation
  - Automated job description generation
  - Intelligent field extraction

- 🎯 **Talent Matching (RAG)**
  - Retrieval-Augmented Generation for candidate matching
  - Semantic search for job-candidate matching
  - Intelligent candidate recommendations

- 💬 **Conversational Agents**
  - AI-powered chat assistants
  - Automated candidate communication
  - Interview scheduling assistance

- 📊 **MCP Protocol Integration**
  - Model Context Protocol for AI tool communication
  - Standardized AI agent interface
  - Extensible tool system

### Admin Features

- 📈 **Analytics Dashboard**
  - User metrics and statistics
  - Job posting analytics
  - Application tracking
  - Performance monitoring

- 🔒 **Security Monitoring**
  - DDoS attack detection
  - Error tracking and logging
  - Performance monitoring
  - Security alerts

- 👥 **User Management**
  - User administration
  - Account management
  - Flagged users handling
  - Bulk operations

---

## 🛠️ Tech Stack

### Core Technologies

- **Runtime**: Node.js (v20+)
- **Framework**: Express.js 4.18
- **Database**: PostgreSQL
- **ORM**: Prisma 5.11
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt

### Security

- **Helmet.js**: Security headers
- **express-rate-limit**: Rate limiting
- **xss**: XSS protection
- **express-validator**: Input validation
- **csurf**: CSRF protection

### AI/ML

- **OpenAI**: GPT-4 for AI agents
- **LangChain**: Agent orchestration
- **MCP SDK**: Model Context Protocol
- **Vector Embeddings**: For RAG system

### Additional Libraries

- **Multer**: File uploads
- **Nodemailer/SendGrid**: Email services
- **node-cron**: Scheduled tasks
- **AWS SDK**: Cloud storage (Wasabi S3)

---

## 🏗️ Architecture

### Project Structure

```
src/
├── routes/           # API route handlers (18 routes)
│   ├── admin.route.js
│   ├── auth.route.js
│   ├── job.route.js
│   ├── application.route.js
│   ├── chat.route.js
│   └── mcp/          # MCP protocol routes
│
├── services/         # Business logic layer (25+ services)
│   ├── admin/        # Admin-specific services
│   │   ├── adminUserService.js
│   │   ├── adminMetricsService.js
│   │   ├── adminSecurityService.js
│   │   └── adminDeletionService.js
│   ├── agents/       # AI agent services
│   ├── mcp/          # MCP protocol services
│   └── rag/          # RAG system services
│
├── middleware/       # Cross-cutting concerns (10 middleware)
│   ├── auth.js
│   ├── security.js
│   ├── validation.js
│   ├── errorTracking.js
│   └── performanceMonitoring.js
│
├── helpers/          # Reusable utilities (25+ helpers)
│   ├── authenticateToken.js
│   ├── cookies.js
│   ├── validationHelpers.js
│   └── ...
│
├── utils/            # Shared utilities
│   ├── responseHelpers.js
│   ├── logger.js
│   └── imageUrlUtils.js
│
└── tests/            # Test suite (23 test files)
    ├── routes/
    ├── middleware/
    └── helpers/
```

### Architecture Patterns

- **Layered Architecture**: Routes → Services → Helpers → Database
- **Service Layer Pattern**: Business logic separated from HTTP concerns
- **Middleware Pattern**: Reusable cross-cutting concerns
- **Dependency Injection**: Services and helpers are modular and testable

### Data Flow

```
Client Request
    ↓
Express Middleware (Auth, Validation, Security)
    ↓
Route Handler (Thin controllers)
    ↓
Service Layer (Business logic)
    ↓
Helpers (Reusable utilities)
    ↓
Prisma ORM
    ↓
PostgreSQL Database
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL database
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/mvergarab/gourmet_backend.git
   cd gourmet_backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up database**
   ```bash
   # Run Prisma migrations
   npx prisma migrate dev
   
   # Generate Prisma client
   npx prisma generate
   
   # (Optional) Seed database
   npx prisma db seed
   ```

5. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on `http://localhost:3000` (or the port specified in `PORT` environment variable).

---

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/gourmet_db"

# JWT
JWT_SECRET="your-super-secret-jwt-key"

# Server
PORT=3000
NODE_ENV=development

# Frontend
FRONTEND_URL="http://localhost:3001"

# OpenAI (for AI features)
OPENAI_API_KEY="sk-..."

# Email Services
SMTP_USER="your-email@example.com"
SMTP_PASS="your-email-password"
ADMIN_EMAIL="admin@example.com"

# Cloud Storage (Wasabi S3)
WASABI_ACCESS_KEY_ID="your-access-key"
WASABI_SECRET_ACCESS_KEY="your-secret-key"
WASABI_BUCKET="your-bucket-name"
WASABI_REGION="us-east-1"
WASABI_ENDPOINT="https://s3.us-east-1.wasabisys.com"
```

### Optional Variables

```env
# MCP Protocol
MCP_CLIENT_ENABLED=false
MCP_DEBUG=false

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Brevo (Email service)
BREVO_API_KEY="your-brevo-api-key"
```

---

## 📡 API Documentation

### Base URL

```
Development: http://localhost:3000
Production: https://your-domain.com
```

### Authentication

All protected endpoints require authentication via cookie or Bearer token:

```javascript
// Cookie-based (preferred for web)
Cookie: manu=<jwt-token>

// Bearer token (for APIs)
Authorization: Bearer <jwt-token>
```

### Main Endpoints

#### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/logout-all` - Logout from all devices
- `POST /api/auth/password-reset-request` - Request password reset
- `GET /api/auth/user/:id` - Get user information

#### Jobs
- `GET /api/job/jobs` - List all jobs (with filters)
- `POST /api/job/job` - Create job posting
- `GET /api/job/jobs/:id` - Get job details
- `PATCH /api/job/job/:id` - Update job posting
- `DELETE /api/job/job/:id` - Delete job posting
- `GET /api/job/jobs/recommended-jobs` - Get recommended jobs (AI-powered)

#### Applications
- `POST /api/application/application` - Submit job application
- `GET /api/applications/:applicationId` - Get application details
- `GET /api/job-offers/:jobOfferId/applicants` - Get applicants for a job

#### Chat
- `GET /api/chat/chat-token` - Get chat socket token
- `GET /api/chat/conversations` - Get all conversations
- `POST /api/chat/create-conversation` - Create conversation
- `GET /api/chat/conversations/:conversationId/messages` - Get messages
- `POST /api/chat/send-message` - Send message

#### Admin
- `GET /api/admin/users` - Get restaurant users
- `POST /api/admin/create-user` - Create restaurant user
- `GET /api/admin/total-counts` - Get dashboard metrics
- `GET /api/admin/metrics` - Get detailed metrics
- `GET /api/admin/all-users` - Get all users (admin only)
- `GET /api/admin/flagged-users` - Get locked accounts

#### AI Features
- `POST /api/mcp/ai-job-creation/process` - AI job creation
- `POST /api/mcp/talent-match/process` - AI talent matching
- `POST /api/rag/store` - Store knowledge document
- `POST /api/rag/search` - Semantic search

### Response Format

**Success Response:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error message",
  "error": "ERROR_CODE"
}
```

---

## 🔒 Security

### Security Features

- ✅ **Helmet.js**: Security headers (CSP, XSS protection, etc.)
- ✅ **Rate Limiting**: Protection against brute force attacks
  - Auth endpoints: 5 attempts per 15 minutes
  - General API: 100 requests per 15 minutes
- ✅ **XSS Protection**: Input sanitization on all text fields
- ✅ **CSRF Protection**: CSRF tokens on sensitive endpoints
- ✅ **JWT Authentication**: Secure token-based authentication
- ✅ **Token Blacklisting**: Invalidate compromised tokens
- ✅ **MFA Support**: Two-factor authentication with TOTP
- ✅ **Account Lockout**: Automatic lockout after failed attempts
- ✅ **Password Hashing**: bcrypt with proper salt rounds
- ✅ **Input Validation**: express-validator on all endpoints
- ✅ **DDoS Monitoring**: Custom middleware for attack detection
- ✅ **Request Size Limits**: 2MB limit on JSON/URL-encoded data

### Security Best Practices

- All passwords are hashed with bcrypt
- JWT tokens expire after 7 days
- Tokens are stored in HTTP-only cookies
- Sensitive data is sanitized before logging
- Error messages don't expose internal details in production

---

## 🤖 AI Features

### AI Job Creation Agent

Automatically creates job postings from natural language:

```javascript
// Example: "I need a chef for my restaurant in Santiago"
POST /api/mcp/ai-job-creation/process
{
  "message": "I need a chef for my restaurant in Santiago",
  "restaurantId": 123
}
```

**Features:**
- Extracts job details from natural language
- Asks for missing information
- Creates structured job postings
- Integrates with existing job system

### Talent Matching (RAG)

Semantic search for finding the best candidates:

```javascript
POST /api/rag/search
{
  "query": "chef with 5 years experience",
  "jobId": 456
}
```

**Features:**
- Vector embeddings for semantic search
- Candidate-job matching algorithm
- Intelligent recommendations
- Context-aware search

### Conversational Agents

AI-powered chat assistants for restaurant management:

- Automated candidate communication
- Interview scheduling assistance
- Job posting guidance
- Multi-step task handling

### MCP Protocol

Model Context Protocol for standardized AI tool communication:

- Isolated MCP server process
- Extensible tool system
- Standardized agent interface
- Tool discovery and execution

---

## 💻 Development

### Available Scripts

```bash
# Development
npm run dev              # Start with nodemon (auto-reload)
npm run dev:mcp         # Start with MCP client enabled

# Production
npm start                # Start production server

# MCP Server
npm run mcp-server       # Start standalone MCP server

# Testing
npm test                # Run test suite
```

### Code Structure

- **Routes**: Handle HTTP requests, delegate to services
- **Services**: Business logic, database operations
- **Middleware**: Authentication, validation, error handling
- **Helpers**: Reusable utility functions
- **Utils**: Shared utilities (logging, responses)

### Adding New Features

1. **Create Service** (if needed)
   ```javascript
   // src/services/myService.js
   class MyService {
     static async myMethod(params) {
       // Business logic
     }
   }
   ```

2. **Create Route**
   ```javascript
   // src/routes/my.route.js
   router.post('/my-endpoint', middleware, async (req, res) => {
     try {
       const result = await MyService.myMethod(req.body);
       sendSuccessResponse(res, 200, 'Success', result);
     } catch (error) {
       handleError(res, error, { logger: Logger });
     }
   });
   ```

3. **Add Middleware** (if needed)
   ```javascript
   // src/middleware/myMiddleware.js
   const myMiddleware = (req, res, next) => {
     // Middleware logic
     next();
   };
   ```

### Code Style

- Use `async/await` for asynchronous operations
- Use `Logger` instead of `console.log`
- Use `sendSuccessResponse` and error handlers for responses
- Follow existing patterns and structure
- Add JSDoc comments to service methods

---

## 🧪 Testing

### Test Structure

```
tests/
├── routes/        # Route handler tests
├── middleware/    # Middleware tests
└── helpers/       # Helper function tests
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/routes/auth.route.test.js
```

### Test Configuration

- **Framework**: Jest
- **Test Environment**: Node.js
- **Coverage Reports**: Text, LCOV, HTML
- **Timeout**: 10 seconds per test

---

## 🚢 Deployment

### Heroku Deployment

The application is configured for Heroku deployment:

```bash
# Add Heroku remote
git remote add heroku https://git.heroku.com/gourmet-jobs-backend.git

# Deploy
git push heroku main
```

### Environment Setup

Ensure all environment variables are set in your hosting platform:

- Database URL
- JWT Secret
- API Keys (OpenAI, Email, etc.)
- Cloud Storage credentials

### Database Migrations

Run migrations on deployment:

```bash
npx prisma migrate deploy
npx prisma generate
```

### Production Considerations

- Use Redis for token blacklist (instead of in-memory)
- Set up database error storage
- Configure proper CORS origins
- Set up monitoring and alerting
- Use process manager (PM2) for Node.js
- Configure reverse proxy (nginx)

---

## 📊 Monitoring & Logging

### Logging

- **Structured Logging**: JSON format with timestamps
- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Log Files**: Separate files for each level
- **Error Tracking**: Comprehensive error categorization

### Monitoring

- **Performance Monitoring**: Request timing and metrics
- **DDoS Monitoring**: Attack detection and alerting
- **Error Tracking**: Error categorization and storage
- **Health Checks**: Application health endpoints

---

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Ensure all tests pass
5. Submit a pull request

---

## 📝 License

ISC

---

## 👥 Authors

- **Manuel** - Initial work

---

## 🙏 Acknowledgments

- OpenAI for AI capabilities
- Prisma for excellent ORM
- Express.js community
- All contributors

---

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ for the restaurant industry**

