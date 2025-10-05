# MCP Routes Directory

This directory contains all routes that use the Model Context Protocol (MCP) for AI agent interactions.

## 📁 **Directory Structure**

```
src/routes/mcp/
├── index.js                           # Centralized exports
├── aiJobCreation.route.js             # Job creation agent routes
├── aiCallScheduler.route.js           # Call scheduling agent routes
└── README.md                          # This file
```

## 🛣️ **Available Routes**

### **1. AI Job Creation Routes**
- **File**: `aiJobCreation.route.js`
- **Base Path**: `/api/ai-job-creation`
- **Service**: `AIJobCreationServiceMCP`

#### **Endpoints:**
- `POST /api/ai-job-creation/process` - Process job creation message
- `POST /api/ai-job-creation/validate` - Validate job data
- `GET /api/ai-job-creation/health` - Health check

### **2. AI Call Scheduler Routes**
- **File**: `aiCallScheduler.route.js`
- **Base Path**: `/api/ai-call-scheduler`
- **Service**: `ConversationalCallSchedulerMCP`

#### **Endpoints:**
- `POST /api/ai-call-scheduler/schedule-calls` - Start AI agents for call scheduling
- `POST /api/ai-call-scheduler/process-message` - Process candidate message
- `GET /api/ai-call-scheduler/health` - Health check

## 🔧 **How to Use**

### **Import Routes**
```javascript
const { aiJobCreationRoutes, aiCallSchedulerRoutes } = require('./routes/mcp');
```

### **Register Routes in Main App**
```javascript
app.use('/api/ai-job-creation', aiJobCreationRoutes);
app.use('/api/ai-call-scheduler', aiCallSchedulerRoutes);
```

## ➕ **Adding New MCP Routes**

1. **Create new route file** in this directory
2. **Import MCP service** from `../../services/mcp`
3. **Add to index.js** exports
4. **Update main app** to include new routes

### **Example New Route**
```javascript
const express = require('express');
const router = express.Router();
const { MyNewMCPService } = require('../../services/mcp');

const service = new MyNewMCPService();

router.post('/my-endpoint', async (req, res) => {
  try {
    const result = await service.processRequest(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

## 🎯 **Benefits of This Organization**

- ✅ **Clear Separation**: MCP routes are grouped together
- ✅ **Easy Discovery**: All MCP routes in one place
- ✅ **Consistent Imports**: Centralized exports via index.js
- ✅ **Scalable**: Easy to add new MCP routes
- ✅ **Maintainable**: Clear structure for future development

## 🔗 **Related Files**

- **MCP Services**: `src/services/mcp/`
- **MCP Server**: `src/mcp/embeddedServer.js`
- **MCP Client**: `src/mcp/embeddedClient.js`
- **MCP Tools**: `src/mcp/tools/`
- **Main App**: `src/index.js`
