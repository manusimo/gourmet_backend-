# MCP Services Directory

This directory contains all services that use the Model Context Protocol (MCP) for AI agent interactions.

## 📁 **Directory Structure**

```
src/services/mcp/
├── index.js                           # Centralized exports
├── aiJobCreationServiceMCP.js         # Job creation agent with MCP
├── conversationalCallSchedulerMCP.js  # Call scheduling agent with MCP
└── README.md                          # This file
```

## 🤖 **Available Services**

### **1. AIJobCreationServiceMCP**
- **Purpose**: Creates job offers from natural language prompts
- **MCP Tools Used**: `create_job_offer`
- **Route**: `/api/ai-job-creation-mcp/`

### **2. ConversationalCallSchedulerMCP**
- **Purpose**: Schedules interview calls with job applicants
- **MCP Tools Used**: `schedule_interview_call`, `get_job_applications`
- **Route**: `/api/ai-call-scheduler-mcp/`

## 🔧 **How to Use**

### **Import Services**
```javascript
const { AIJobCreationServiceMCP, ConversationalCallSchedulerMCP } = require('../services/mcp');
```

### **Initialize Service**
```javascript
const agent = new AIJobCreationServiceMCP();
await agent.initialize();
```

### **Use Service**
```javascript
const result = await agent.processMessage(message, history, context);
```

## ➕ **Adding New MCP Services**

1. **Create new service file** in this directory
2. **Extend the service** with MCP client integration
3. **Add to index.js** exports
4. **Create route file** in `src/routes/`
5. **Update main app** to include new routes

### **Example New Service**
```javascript
const EmbeddedMCPClient = require('../../mcp/embeddedClient.js');

class MyNewMCPService {
  constructor() {
    this.mcpClient = new EmbeddedMCPClient();
  }

  async processRequest(data) {
    const result = await this.mcpClient.callTool('my_tool', data);
    return result;
  }
}

module.exports = MyNewMCPService;
```

## 🎯 **Benefits of This Organization**

- ✅ **Clear Separation**: MCP services are grouped together
- ✅ **Easy Discovery**: All MCP services in one place
- ✅ **Consistent Imports**: Centralized exports via index.js
- ✅ **Scalable**: Easy to add new MCP services
- ✅ **Maintainable**: Clear structure for future development

## 🔗 **Related Files**

- **MCP Server**: `src/mcp/embeddedServer.js`
- **MCP Client**: `src/mcp/embeddedClient.js`
- **MCP Tools**: `src/mcp/tools/`
- **Routes**: `src/routes/*MCP.route.js`
