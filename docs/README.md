# 📚 Gourmet Backend Documentation

## 🗂️ Documentation Structure

### 📋 **Production**
- [Production Readiness Checklist](production/PRODUCTION_READINESS.md) - What's needed for production deployment

### 🤖 **MCP (Model Context Protocol)**
- [MCP Refactored Guide](mcp/MCP_REFACTORED.md) - Complete MCP implementation guide
- [Embedded MCP Integration](mcp/EMBEDDED_MCP_INTEGRATION.md) - How MCP integrates with the backend

### 🏗️ **System Architecture**
- [System Documentation](system/) - Core system components and guides

### 📦 **Archive**
- [Legacy Documentation](archive/) - Old README files and deprecated docs

---

## 🚀 **Quick Start**

### **For Development:**
1. Read [MCP Refactored Guide](mcp/MCP_REFACTORED.md) to understand the architecture
2. Check [Embedded MCP Integration](mcp/EMBEDDED_MCP_INTEGRATION.md) for setup

### **For Production:**
1. **CRITICAL:** Review [Production Readiness Checklist](production/PRODUCTION_READINESS.md)
2. Follow the 3-day sprint plan for production deployment

---

## 🎯 **Current Status**

- **Architecture:** ✅ Complete (MCP, RAG, Multi-Agent)
- **Core Functionality:** ✅ Complete (Job Creation, Call Scheduling)
- **Production Ready:** ❌ 40% (Need security, testing, monitoring)

**Target:** Production deployment in 3-4 days

---

## 📁 **File Organization**

All documentation is now centralized in this `docs/` directory:

```
docs/
├── README.md                    # This file
├── production/                  # Production deployment docs
├── mcp/                        # MCP architecture docs
├── system/                     # System component docs
└── archive/                    # Legacy documentation
```

---

## 🔗 **Related Documentation**

- **Frontend:** See `gourmet_frontend/` workspace
- **ML System:** See `ml-recommendation-system/` workspace
- **API Docs:** Generated from code (coming soon)

---

**Last Updated:** $(date)  
**Status:** 🟡 In Development - Production Ready in 3-4 days
