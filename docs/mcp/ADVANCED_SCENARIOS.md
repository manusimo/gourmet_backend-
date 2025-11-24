# Advanced Agent Scenarios - Dynamic Tool Selection

## 🎯 **Your Example: "Give me the last 5 jobs, get best applicants, schedule a call"**

This is a **perfect example** of when you need dynamic tool selection!

## ❌ **Why Hardcoded Logic Fails**

Your current hardcoded flow can't handle this:

```javascript
// Your current code
if (cleanedResponse.status === 'ready_to_publish') {
  // This only handles NEW job creation
}

if (cleanedResponse.jobCreated && cleanedResponse.askForCandidates) {
  // This only handles candidates for JUST CREATED jobs
}
```

**Problem:** User is asking about **existing jobs from the past**, not creating a new one!

## ✅ **What Dynamic Selection Would Do**

### **Step 1: LLM Reasons About the Request**

```
User: "Give me the last 5 jobs I posted, then from that one get the best applicants and schedule a call"

LLM thinks:
1. User wants to see their past jobs (not creating new)
2. Need to get jobs for this restaurant
3. Then find candidates for one of those jobs
4. Then schedule a call with a candidate

I need to call tools in this sequence:
- get_restaurant_jobs (get last 5 jobs)
- match_best_applicants (for one of those jobs)
- schedule_interview_call (with a candidate)
```

### **Step 2: LLM Calls Tools Dynamically**

```javascript
// LLM decides to call these tools:
1. get_restaurant_jobs({ restaurantId: 123, limit: 5, orderBy: 'createdAt' })
   → Returns: [job1, job2, job3, job4, job5]

2. match_best_applicants({ jobId: job1.id, limit: 5 })
   → Returns: [candidate1, candidate2, candidate3]

3. schedule_interview_call({ 
     restaurantId: 123, 
     employeeId: candidate1.employeeId,
     scheduledDate: '...',
     title: 'Entrevista para ' + job1.position
   })
   → Returns: Call scheduled
```

## 🔧 **What You'd Need to Add**

### **1. Create `get_restaurant_jobs` Tool**

```javascript
// mcp/tools/data/getRestaurantJobs.js
class GetRestaurantJobsTool extends BaseTool {
  constructor() {
    super(
      'get_restaurant_jobs',
      'Get jobs posted by a restaurant, with optional filters and sorting',
      {
        type: 'object',
        properties: {
          restaurantId: { type: 'number', description: 'Restaurant ID' },
          limit: { type: 'number', description: 'Maximum number of jobs to return', default: 10 },
          orderBy: { type: 'string', description: 'Sort by: createdAt, applications, position', default: 'createdAt' },
          position: { type: 'string', description: 'Filter by position' }
        },
        required: ['restaurantId']
      }
    );
  }

  async handle(args, { prisma }) {
    const { restaurantId, limit = 10, orderBy = 'createdAt', position } = args;
    
    const jobs = await prisma.jobOffer.findMany({
      where: {
        restaurantId: parseInt(restaurantId),
        deletedAt: null,
        ...(position && { position: { contains: position, mode: 'insensitive' } })
      },
      include: {
        location: true,
        restaurant: true,
        _count: { select: { applications: true } }
      },
      orderBy: orderBy === 'createdAt' 
        ? { createdAt: 'desc' }
        : { applications: { _count: 'desc' } },
      take: limit
    });

    return this.createSuccessResponse({
      jobs: jobs.map(job => ({
        id: job.id,
        position: job.position,
        createdAt: job.createdAt,
        applicationsCount: job._count.applications,
        location: job.location?.address
      })),
      count: jobs.length
    });
  }
}
```

### **2. Enable Dynamic Tool Selection**

You have two options:

#### **Option A: Add to Current System (Hybrid)**
Keep hardcoded logic for common flows, add dynamic for complex queries:

```javascript
// In processJobCreation.js
async handle(args, { prisma }) {
  const { userMessage, conversationHistory, restaurantContext } = args;
  
  // Check if it's a complex query (not job creation)
  const isComplexQuery = this.isComplexQuery(userMessage);
  
  if (isComplexQuery) {
    // Use dynamic tool selection
    return await this.handleComplexQuery(userMessage, conversationHistory, restaurantContext);
  }
  
  // Otherwise use hardcoded flow (current logic)
  // ... your existing code
}

async handleComplexQuery(userMessage, conversationHistory, restaurantContext) {
  // Give LLM all available tools and let it decide
  const availableTools = [
    { name: 'get_restaurant_jobs', description: 'Get jobs for a restaurant' },
    { name: 'match_best_applicants', description: 'Find candidates for a job' },
    { name: 'schedule_interview_call', description: 'Schedule a call' },
    { name: 'send_message_to_candidate', description: 'Send message' }
  ];
  
  // LLM decides which tools to call
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: 'system', content: 'You are an agent. Use tools to help the user.' },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ],
    tools: availableTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: getToolSchema(tool.name)
      }
    })),
    tool_choice: 'auto' // LLM decides!
  });
  
  // Execute tools LLM wants to call
  if (response.choices[0].message.tool_calls) {
    for (const toolCall of response.choices[0].message.tool_calls) {
      const result = await executeTool(toolCall.function.name, toolCall.function.arguments);
      // LLM can use result to decide next tool
    }
  }
}
```

#### **Option B: Use LangGraph (Advanced)**
Your `/process-advanced` endpoint already has this! LangGraph handles dynamic tool selection automatically.

## 🎯 **Example Flow with Dynamic Selection**

**User:** "Give me the last 5 jobs I posted, then from the first one get the best applicants and schedule a call"

### **LLM Reasoning Process:**

```
Step 1: LLM thinks
  "User wants last 5 jobs. I need get_restaurant_jobs tool."
  
Step 2: LLM calls
  get_restaurant_jobs({ restaurantId: 123, limit: 5 })
  → Returns: [job1, job2, job3, job4, job5]

Step 3: LLM thinks
  "User said 'from that one' - they mean the first job (job1).
   I need to find candidates for job1, then schedule a call."

Step 4: LLM calls
  match_best_applicants({ jobId: job1.id, limit: 5 })
  → Returns: [candidate1, candidate2, candidate3]

Step 5: LLM thinks
  "User wants to schedule a call. I should schedule with the top candidate (candidate1)."

Step 6: LLM calls
  schedule_interview_call({
    restaurantId: 123,
    employeeId: candidate1.employeeId,
    jobId: job1.id,
    scheduledDate: 'tomorrow 10am'
  })
  → Returns: Call scheduled

Step 7: LLM responds
  "I found your last 5 jobs. For the first job (Chef), I found 3 candidates.
   I've scheduled a call with [Candidate Name] for tomorrow at 10am."
```

## 💡 **Key Difference**

### **Hardcoded (Your Current System)**
```javascript
// You write: "If user says X, do Y"
if (userMessage.includes('candidatos')) {
  await findCandidates();
}
// Limited to what you programmed
```

### **Dynamic (Advanced System)**
```javascript
// LLM reasons: "Based on this conversation, I should do X, Y, Z"
LLM sees: "last 5 jobs" → Decides: call get_restaurant_jobs
LLM sees: "get applicants" → Decides: call match_best_applicants  
LLM sees: "schedule call" → Decides: call schedule_interview_call
// Can handle any scenario LLM understands
```

## 🚀 **Implementation Path**

1. **Create `get_restaurant_jobs` tool** (add to `data/` directory)
2. **Add dynamic selection** for complex queries
3. **Keep hardcoded** for common job creation flow
4. **Test with your example**: "Give me last 5 jobs..."

This gives you:
- ✅ Predictable behavior for common cases (hardcoded)
- ✅ Flexibility for complex queries (dynamic)
- ✅ Best of both worlds!

