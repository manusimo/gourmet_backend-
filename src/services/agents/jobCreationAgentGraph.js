/**
 * Advanced Job Creation Agent with LangGraph
 * Implements auto-reasoning using LangGraph to orchestrate MCP tools
 */

const { StateGraph, END, Annotation } = require('@langchain/langgraph');
const OpenAI = require('openai');
const { getToolHandler } = require('../../mcp/tools');
const { JobRAGService } = require('../rag');
const { createConversation } = require('../../helpers/chatHelpers');
const { prisma } = require('../../db');

/**
 * State that flows through the agent graph
 * LangGraph uses Annotation.Root() for state schema definition
 */
const stateSchema = Annotation.Root({
  // User input
  userMessage: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => ''
  }),
  conversationHistory: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),
  restaurantContext: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => ({})
  }),
  
  // Agent's reasoning
  reasoning: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => ''
  }),
  nextAction: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  confidence: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => 0
  }),
  plan: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),
  completedActions: Annotation({
    reducer: (x, y) => {
      const current = x || [];
      const newActions = y ? (Array.isArray(y) ? y : [y]) : [];
      return [...current, ...newActions];
    },
    default: () => []
  }),
  
  // Extracted data
  extractedJobData: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  status: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  
  // Results from tools
  similarJobs: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),
  recommendedCandidates: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),
  createdJobId: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  contactedCandidates: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),
  
  // Final response
  response: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  error: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
});

/**
 * The agent REASONS about what to do next using LLM
 * This is the key difference: agent decides, not hardcoded if/else
 */
async function reasoningNode(state) {
  const { userMessage, extractedJobData, status, similarJobs, recommendedCandidates, completedActions } = state;
  
  console.log('🧠 [AGENT] Reasoning about next action...');
  
  // Build context for reasoning
  const contextSummary = {
    hasUserMessage: !!userMessage,
    hasJobData: !!extractedJobData,
    hasPosition: !!extractedJobData?.position,
    jobStatus: status || 'unknown',
    hasSimilarJobs: similarJobs.length > 0,
    hasCandidates: recommendedCandidates.length > 0,
    completedActions: completedActions,
    missingFields: extractedJobData ? 
      Object.entries(extractedJobData)
        .filter(([key, value]) => !value || value === '' || value === 0)
        .map(([key]) => key)
      : []
  };
  
  // Use LLM to reason about what to do
  const reasoningPrompt = `You are an intelligent job creation agent. Analyze the current situation and decide what to do next.

Current State:
- User Message: "${userMessage || 'none'}"
- Job Status: ${contextSummary.jobStatus}
- Has Position: ${contextSummary.hasPosition ? `Yes (${extractedJobData?.position})` : 'No'}
- Missing Fields: ${contextSummary.missingFields.join(', ') || 'None'}
- Has Similar Jobs: ${contextSummary.hasSimilarJobs ? `Yes (${similarJobs.length})` : 'No'}
- Has Candidates: ${contextSummary.hasCandidates ? `Yes (${recommendedCandidates.length})` : 'No'}
- Completed Actions: ${completedActions.join(', ') || 'None'}

Available Actions:
1. extract_data - Extract job information from user message (use if no job data yet)
2. search_similar_jobs - Find similar jobs for reference (use if have position but want to help user)
3. search_candidates - Find recommended candidates (use if have position and job is complete or user asked)
4. create_job - Create the job posting (use if status is 'ready_to_publish')
5. contact_candidates - Contact recommended candidates via chat (use if have candidates and job created)
6. ask_questions - Ask user for missing information (use if missing critical fields)
7. complete - Finish and return response (use if done or need user input)

REASONING INSTRUCTIONS:
- Think step by step about what information you have
- Determine what information is missing
- Consider what would be most helpful to the user
- Decide the best next action based on the current state
- Be strategic: extract data first, then search similar jobs to help user, then search candidates if appropriate

Respond ONLY with valid JSON in this exact format:
{
  "reasoning": "Your thought process explaining why you chose this action (2-3 sentences)",
  "nextAction": "action_name",
  "confidence": 0.95,
  "plan": ["action1", "action2", "action3"]
}

Choose one of these exact action names: extract_data, search_similar_jobs, search_candidates, create_job, contact_candidates, ask_questions, complete`;

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a reasoning agent. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: reasoningPrompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent reasoning
      max_tokens: 500,
    });
    
    const responseText = response.choices[0].message.content.trim();
    
    // Parse JSON response
    let reasoning;
    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      reasoning = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ [AGENT] Failed to parse reasoning response:', parseError);
      console.error('Raw response:', responseText);
      // Fallback to safe default
      reasoning = {
        reasoning: "Failed to parse reasoning, defaulting to extract_data",
        nextAction: contextSummary.hasJobData ? 'complete' : 'extract_data',
        confidence: 0.5,
        plan: []
      };
    }
    
    console.log('🧠 [AGENT REASONING]', reasoning.reasoning);
    console.log('🎯 [AGENT DECISION] Next action:', reasoning.nextAction);
    console.log('📊 [AGENT CONFIDENCE]', reasoning.confidence);
    
    return {
      ...state,
      reasoning: reasoning.reasoning,
      nextAction: reasoning.nextAction,
      confidence: reasoning.confidence,
      plan: reasoning.plan || [],
    };
    
  } catch (error) {
    console.error('❌ [AGENT] Error in reasoning node:', error);
    // Fallback to safe default
    return {
      ...state,
      reasoning: `Error in reasoning: ${error.message}. Defaulting to extract_data.`,
      nextAction: state.extractedJobData ? 'complete' : 'extract_data',
      confidence: 0.3,
      error: error.message
    };
  }
}

/**
 * Extract job data from user message
 * Calls your existing MCP tool
 */
async function extractDataNode(state) {
  console.log('📝 [AGENT] Extracting job data...');
  
  try {
    const handler = getToolHandler('process_job_creation');
    if (!handler) {
      throw new Error('process_job_creation tool not found');
    }
    
    const result = await handler({
      userMessage: state.userMessage,
      conversationHistory: state.conversationHistory,
      restaurantContext: state.restaurantContext
    }, { prisma });
    
    // Parse MCP tool response
    let parsedResult;
    if (typeof result === 'string') {
      parsedResult = JSON.parse(result);
    } else if (result.content && result.content[0] && result.content[0].text) {
      parsedResult = JSON.parse(result.content[0].text);
    } else {
      parsedResult = result;
    }
    
    // Extract the actual data
    const extractedData = parsedResult.extractedData || parsedResult.data?.extractedData;
    const status = parsedResult.status || parsedResult.data?.status;
    const message = parsedResult.message || parsedResult.data?.message;
    
    console.log('✅ [AGENT] Job data extracted:', {
      hasPosition: !!extractedData?.position,
      status: status
    });
    
    return {
      ...state,
      extractedJobData: extractedData,
      status: status,
      response: message,
      completedActions: [...state.completedActions, 'extract_data']
    };
    
  } catch (error) {
    console.error('❌ [AGENT] Error extracting job data:', error);
    return {
      ...state,
      error: `Error extracting job data: ${error.message}`,
      nextAction: 'complete'
    };
  }
}

/**
 * Search for similar jobs
 */
async function searchSimilarJobsNode(state) {
  console.log('🔍 [AGENT] Searching for similar jobs...');
  
  try {
    if (!state.extractedJobData || !state.extractedJobData.position) {
      console.log('⚠️ [AGENT] No position found, skipping similar jobs search');
      return {
        ...state,
        completedActions: [...state.completedActions, 'search_similar_jobs']
      };
    }
    
    const ragService = new JobRAGService();
    const similarJobs = await ragService.searchSimilarJobs(state.extractedJobData, 3);
    
    console.log(`✅ [AGENT] Found ${similarJobs.length} similar jobs`);
    
    return {
      ...state,
      similarJobs: similarJobs,
      completedActions: [...state.completedActions, 'search_similar_jobs']
    };
    
  } catch (error) {
    console.error('❌ [AGENT] Error searching similar jobs:', error);
    return {
      ...state,
      similarJobs: [],
      completedActions: [...state.completedActions, 'search_similar_jobs']
    };
  }
}

/**
 * Search for recommended candidates
 */
async function searchCandidatesNode(state) {
  console.log('👥 [AGENT] Searching for recommended candidates...');
  
  try {
    if (!state.extractedJobData || !state.extractedJobData.position) {
      console.log('⚠️ [AGENT] No position found, skipping candidates search');
      return {
        ...state,
        completedActions: [...state.completedActions, 'search_candidates']
      };
    }
    
    const ragService = new JobRAGService();
    const candidates = await ragService.searchSimilarApplicants(state.extractedJobData, 5);
    
    // Format candidates
    const formattedCandidates = candidates.map(rec => ({
      name: `${rec.employee.user?.name || ''} ${rec.employee.user?.surname || ''}`.trim(),
      email: rec.employee.user?.email || 'No email',
      similarity: Math.round(rec.similarity * 100),
      matchReasons: rec.matchReasons || [],
      employeeId: rec.employee.id,
      hasExperience: rec.employee.experiences?.length > 0,
      hasEducation: rec.employee.educations?.length > 0,
      canContact: true,
      contactMethod: 'chat',
      contactEndpoint: '/api/contact-recommended-candidate',
      jobPostId: state.createdJobId || null
    }));
    
    console.log(`✅ [AGENT] Found ${formattedCandidates.length} recommended candidates`);
    
    return {
      ...state,
      recommendedCandidates: formattedCandidates,
      completedActions: [...state.completedActions, 'search_candidates']
    };
    
  } catch (error) {
    console.error('❌ [AGENT] Error searching candidates:', error);
    return {
      ...state,
      recommendedCandidates: [],
      completedActions: [...state.completedActions, 'search_candidates']
    };
  }
}

/**
 * Create the job posting
 */
async function createJobNode(state) {
  console.log('✅ [AGENT] Creating job posting...');
  
  try {
    if (!state.extractedJobData || state.status !== 'ready_to_publish') {
      console.log('⚠️ [AGENT] Job not ready to publish');
      return {
        ...state,
        completedActions: [...state.completedActions, 'create_job']
      };
    }
    
    const handler = getToolHandler('create_job_offer');
    if (!handler) {
      throw new Error('create_job_offer tool not found');
    }
    
    const result = await handler({
      jobData: state.extractedJobData,
      restaurantContext: state.restaurantContext
    }, { prisma });
    
    // Parse result
    let parsedResult;
    if (typeof result === 'string') {
      parsedResult = JSON.parse(result);
    } else if (result.content && result.content[0] && result.content[0].text) {
      parsedResult = JSON.parse(result.content[0].text);
    } else {
      parsedResult = result;
    }
    
    const jobId = parsedResult.jobId || parsedResult.data?.jobId;
    
    console.log(`✅ [AGENT] Job created with ID: ${jobId}`);
    
    return {
      ...state,
      createdJobId: jobId,
      status: 'ready_to_publish',
      completedActions: [...state.completedActions, 'create_job']
    };
    
  } catch (error) {
    console.error('❌ [AGENT] Error creating job:', error);
    return {
      ...state,
      error: `Error creating job: ${error.message}`,
      completedActions: [...state.completedActions, 'create_job']
    };
  }
}

/**
 * Contact recommended candidates
 */
async function contactCandidatesNode(state) {
  console.log('💬 [AGENT] Contacting candidates...');
  
  try {
    if (!state.recommendedCandidates || state.recommendedCandidates.length === 0) {
      console.log('⚠️ [AGENT] No candidates to contact');
      return {
        ...state,
        completedActions: [...state.completedActions, 'contact_candidates']
      };
    }
    
    const conversations = [];
    for (const candidate of state.recommendedCandidates) {
      try {
        const conversation = await createConversation({
          employeeId: candidate.employeeId,
          jobPostId: state.createdJobId,
          restaurantUserId: state.restaurantContext.userId,
          restaurantId: state.restaurantContext.id,
          type: 'applicant'
        });
        conversations.push(conversation);
      } catch (error) {
        console.error(`❌ [AGENT] Error contacting candidate ${candidate.employeeId}:`, error);
      }
    }
    
    console.log(`✅ [AGENT] Contacted ${conversations.length} candidates`);
    
    return {
      ...state,
      contactedCandidates: conversations,
      completedActions: [...state.completedActions, 'contact_candidates']
    };
    
  } catch (error) {
    console.error('❌ [AGENT] Error contacting candidates:', error);
    return {
      ...state,
      error: `Error contacting candidates: ${error.message}`,
      completedActions: [...state.completedActions, 'contact_candidates']
    };
  }
}

/**
 * Ask user questions (end state)
 */
async function askQuestionsNode(state) {
  console.log('❓ [AGENT] Need to ask user questions');
  
  // Build response with missing fields
  const missingFields = state.extractedJobData ? 
    Object.entries(state.extractedJobData)
      .filter(([key, value]) => !value || value === '' || value === 0)
      .map(([key]) => key)
    : [];
  
  const message = state.response || `Para continuar, necesito más información: ${missingFields.join(', ')}`;
  
  return {
    ...state,
    response: message,
    status: 'incomplete',
    nextAction: 'complete'
  };
}

/**
 * Complete and format final response
 */
async function completeNode(state) {
  console.log('✅ [AGENT] Completing and formatting response...');
  
  // Build comprehensive response
  let response = state.response || 'Proceso completado.';
  
  // Add similar jobs info
  if (state.similarJobs.length > 0) {
    response += `\n\n📋 **TRABAJOS SIMILARES:**\nHe encontrado ${state.similarJobs.length} trabajo(s) similar(es) que puedes usar como referencia.`;
  }
  
  // Add candidates info
  if (state.recommendedCandidates.length > 0) {
    response += `\n\n👥 **CANDIDATOS RECOMENDADOS:**\nHe encontrado ${state.recommendedCandidates.length} candidato(s) que coinciden con los requisitos. Puedes contactarlos directamente mediante chat.`;
  }
  
  // Add job creation info
  if (state.createdJobId) {
    response += `\n\n✅ **TRABAJO CREADO:**\nTu oferta de trabajo ha sido creada exitosamente (ID: ${state.createdJobId}).`;
  }
  
  return {
    ...state,
    response: response,
    nextAction: 'end'
  };
}

/**
 * Routes to the appropriate action based on agent's reasoning
 */
function routeToAction(state) {
  const { nextAction } = state;
  
  console.log(`🔄 [AGENT] Routing to action: ${nextAction}`);
  
  // Map agent's decision to actual node
  const actionMap = {
    'extract_data': 'extract',
    'search_similar_jobs': 'searchSimilarJobs',
    'search_candidates': 'searchCandidates',
    'create_job': 'createJob',
    'contact_candidates': 'contactCandidates',
    'ask_questions': 'askQuestions',
    'complete': 'complete',
    'end': END
  };
  
  return actionMap[nextAction] || 'complete';
}

/**
 * Create the LangGraph workflow
 * Uses real LangGraph StateGraph API
 */
function createJobCreationGraph() {
  console.log('🔧 [LANGGRAPH] Creating StateGraph workflow...');
  
  // Create the graph with state schema
  const workflow = new StateGraph(stateSchema)
    // Entry point: agent reasons about what to do
    .addNode("reasoning", reasoningNode)
    
    // Action nodes (your MCP tools)
    .addNode("extract", extractDataNode)
    .addNode("searchSimilarJobs", searchSimilarJobsNode)
    .addNode("searchCandidates", searchCandidatesNode)
    .addNode("createJob", createJobNode)
    .addNode("contactCandidates", contactCandidatesNode)
    .addNode("askQuestions", askQuestionsNode)
    .addNode("complete", completeNode)
    
    // Conditional routing: agent decides where to go based on nextAction
    .addConditionalEdges(
      "reasoning",
      routeToAction,
      {
        "extract": "extract",
        "searchSimilarJobs": "searchSimilarJobs",
        "searchCandidates": "searchCandidates",
        "createJob": "createJob",
        "contactCandidates": "contactCandidates",
        "askQuestions": "askQuestions",
        "complete": "complete",
        [END]: END
      }
    )
    
    // After each action, go back to reasoning (agent decides next step)
    .addEdge("extract", "reasoning")
    .addEdge("searchSimilarJobs", "reasoning")
    .addEdge("searchCandidates", "reasoning")
    .addEdge("createJob", "reasoning")
    .addEdge("contactCandidates", "reasoning")
    .addEdge("askQuestions", "reasoning")
    
    // Complete node ends the workflow
    .addEdge("complete", END)
    
    // Set entry point
    .setEntryPoint("reasoning");
  
  // Compile the graph
  const compiledGraph = workflow.compile();
  
  console.log('✅ [LANGGRAPH] Workflow compiled successfully');
  
  return compiledGraph;
}


class AdvancedJobCreationAgent {
  constructor() {
    try {
      this.graph = createJobCreationGraph();
      console.log('🚀 [AGENT] Advanced Job Creation Agent initialized with LangGraph');
    } catch (error) {
      console.error('❌ [AGENT] Error initializing LangGraph:', error);
      throw error;
    }
  }
  
  /**
   * Process job creation request using advanced agent with LangGraph
   */
  async processRequest(userMessage, conversationHistory = [], restaurantContext = {}) {
    try {
      console.log('🤖 [AGENT] Processing request with LangGraph agent:', userMessage);
      
      // Create initial state (LangGraph will use defaults from schema)
      const initialState = {
        userMessage,
        conversationHistory,
        restaurantContext
      };
      
      // Run the graph using LangGraph's invoke method
      const finalState = await this.graph.invoke(initialState);
      
      console.log('✅ [AGENT] LangGraph workflow completed');
      console.log('📊 [AGENT] Completed actions:', finalState.completedActions);
      console.log('🧠 [AGENT] Final reasoning:', finalState.reasoning);
      
      // Format response in your existing format
      const response = {
        success: true,
        status: finalState.status || 'complete',
        message: finalState.response || 'Proceso completado.',
        extractedData: finalState.extractedJobData,
        similarJobs: finalState.similarJobs,
        recommendedCandidates: finalState.recommendedCandidates,
        jobId: finalState.createdJobId,
        reasoning: finalState.reasoning, // Show agent's reasoning
        completedActions: finalState.completedActions || [],
        debugInfo: {
          source: 'Advanced Agent (LangGraph)',
          model: 'gpt-3.5-turbo',
          timestamp: new Date().toISOString(),
          totalActions: (finalState.completedActions || []).length,
          langGraphVersion: '1.0.1'
        }
      };
      
      // Handle errors
      if (finalState.error) {
        response.success = false;
        response.error = finalState.error;
        response.message = `Error: ${finalState.error}`;
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ [AGENT] Error processing request:', error);
      console.error('❌ [AGENT] Error stack:', error.stack);
      return {
        success: false,
        status: 'error',
        message: `Error: ${error.message}`,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }
}

module.exports = AdvancedJobCreationAgent;

