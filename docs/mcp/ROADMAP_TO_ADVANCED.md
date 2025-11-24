# Roadmap: Intermediate → Advanced Agent System

## 🎯 **Goal: Enable Dynamic Tool Selection**

Transform your current hardcoded system into an advanced system that can handle complex, multi-step queries.

## 📋 **Step-by-Step Implementation**

### **Phase 1: Add Missing Tools** (Foundation)

#### **Step 1.1: Create `get_restaurant_jobs` Tool**
- Location: `mcp/tools/data/getRestaurantJobs.js`
- Purpose: Get past jobs for a restaurant
- Why: Needed for queries like "show me my last 5 jobs"

#### **Step 1.2: Register Tool**
- Add to `mcp/tools/data/index.js`
- Register in main `mcp/tools/index.js`

### **Phase 2: Enable Dynamic Tool Selection** (Core Feature)

#### **Step 2.1: Detect Complex Queries**
- Add method to detect if query needs dynamic selection
- Examples: "last 5 jobs", "jobs from last month", "candidates for job X"

#### **Step 2.2: Implement Dynamic Handler**
- Create method that uses OpenAI function calling
- Give LLM all available tools
- Let LLM decide which to call

#### **Step 2.3: Tool Execution Loop**
- Execute tools LLM wants to call
- Feed results back to LLM
- LLM decides next tool based on results

### **Phase 3: Hybrid System** (Best of Both)

#### **Step 3.1: Route Logic**
- Simple queries → Hardcoded flow (current system)
- Complex queries → Dynamic selection (new system)

#### **Step 3.2: Fallback**
- If dynamic fails → Fall back to hardcoded
- Ensures reliability

## 🚀 **Implementation Plan**

### **Week 1: Foundation**
1. Create `get_restaurant_jobs` tool
2. Test tool independently
3. Add to tool registry

### **Week 2: Dynamic Selection**
1. Implement query detection
2. Add OpenAI function calling
3. Test with simple multi-tool queries

### **Week 3: Integration**
1. Integrate with current system
2. Add hybrid routing
3. Test complex scenarios

### **Week 4: Polish**
1. Error handling
2. Edge cases
3. Documentation

## 💡 **Quick Start: Minimal Implementation**

Start with the simplest version that works, then iterate.

