const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');
const { sendMessageNotification } = require('./emailService');

const prisma = new PrismaClient();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * AI Interview Service for Gourmet Jobs Platform
 * Handles automated interviews with AI agents, including:
 * - Voice/chat interviews
 * - Real-time analysis
 * - Interview scoring and recommendations
 * - Automated summaries
 */
class AiInterviewService {
  constructor() {
    this.defaultModel = 'gpt-4';
    this.whisperModel = 'whisper-1';
  }

  /**
   * Create a new interview session
   * @param {Object} interviewData - Interview session data
   * @returns {Object} Created interview session
   */
  async createInterviewSession(interviewData) {
    try {
      const {
        agentId,
        jobOfferId,
        employeeId,
        restaurantId,
        title,
        type = 'voice',
        scheduledDate
      } = interviewData;

      // Get interview template for this job
      const template = await this.getInterviewTemplate(jobOfferId);
      
      const interviewSession = await prisma.interviewSession.create({
        data: {
          agentId,
          jobOfferId,
          employeeId,
          restaurantId,
          title,
          type,
          scheduledDate,
          status: 'scheduled'
        }
      });

      // Create interview questions from template
      if (template) {
        await this.createInterviewQuestions(interviewSession.id, template.id);
      }

      // Send notification to candidate
      await this.sendInterviewScheduledNotification(interviewSession);

      return interviewSession;

    } catch (error) {
      console.error('❌ Error creating interview session:', error);
      throw error;
    }
  }

  /**
   * Start an interview session
   * @param {number} sessionId - Interview session ID
   * @returns {Object} Updated session with questions
   */
  async startInterview(sessionId) {
    try {
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
        include: {
          questions: {
            orderBy: { order: 'asc' }
          },
          employee: {
            include: { user: true }
          },
          jobOffer: true,
          agent: true
        }
      });

      if (!session) {
        throw new Error('Interview session not found');
      }

      // Update session status
      await prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          status: 'in_progress',
          actualStartDate: new Date()
        }
      });

      // Generate AI greeting
      const greeting = await this.generateInterviewGreeting(session);

      return {
        session,
        greeting,
        questions: session.questions
      };

    } catch (error) {
      console.error('❌ Error starting interview:', error);
      throw error;
    }
  }

  /**
   * Process candidate response during interview
   * @param {Object} responseData - Response data
   * @returns {Object} Analysis and next question
   */
  async processInterviewResponse(responseData) {
    try {
      const {
        sessionId,
        questionId,
        responseText,
        responseAudio,
        speakingTime,
        pauses
      } = responseData;

      // Save the response
      const response = await prisma.interviewResponse.create({
        data: {
          interviewSessionId: sessionId,
          questionId,
          responseText,
          responseAudio,
          speakingTime,
          pauses,
          length: responseText ? responseText.split(' ').length : 0
        }
      });

      // Analyze the response
      const analysis = await this.analyzeResponse(responseText, questionId);
      
      // Update response with analysis
      await prisma.interviewResponse.update({
        where: { id: response.id },
        data: {
          sentiment: analysis.sentiment,
          sentimentScore: analysis.sentimentScore,
          relevanceScore: analysis.relevanceScore,
          completenessScore: analysis.completenessScore,
          keywordMatches: analysis.keywordMatches
        }
      });

      // Get next question
      const nextQuestion = await this.getNextQuestion(sessionId, questionId);

      return {
        response,
        analysis,
        nextQuestion
      };

    } catch (error) {
      console.error('❌ Error processing interview response:', error);
      throw error;
    }
  }

  /**
   * Complete an interview session
   * @param {number} sessionId - Interview session ID
   * @returns {Object} Final evaluation and summary
   */
  async completeInterview(sessionId) {
    try {
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
        include: {
          responses: {
            include: { question: true }
          },
          employee: {
            include: { user: true }
          },
          jobOffer: true,
          agent: true
        }
      });

      if (!session) {
        throw new Error('Interview session not found');
      }

      // Generate comprehensive evaluation
      const evaluation = await this.generateInterviewEvaluation(session);
      
      // Create evaluation record
      const evaluationRecord = await prisma.interviewEvaluation.create({
        data: {
          interviewSessionId: sessionId,
          communication: evaluation.communication,
          technicalSkills: evaluation.technicalSkills,
          experience: evaluation.experience,
          culturalFit: evaluation.culturalFit,
          motivation: evaluation.motivation,
          problemSolving: evaluation.problemSolving,
          overallScore: evaluation.overallScore,
          recommendation: evaluation.recommendation,
          reasoning: evaluation.reasoning,
          strengths: evaluation.strengths,
          concerns: evaluation.concerns,
          followUpQuestions: evaluation.followUpQuestions
        }
      });

      // Update session with final results
      await prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          actualEndDate: new Date(),
          overallScore: evaluation.overallScore,
          recommendation: evaluation.recommendation,
          confidence: evaluation.confidence,
          summary: evaluation.summary,
          strengths: evaluation.strengths,
          weaknesses: evaluation.concerns,
          keyPoints: evaluation.keyPoints
        }
      });

      // Send results to restaurant
      await this.sendInterviewResultsNotification(session, evaluation);

      return {
        session: await prisma.interviewSession.findUnique({
          where: { id: sessionId },
          include: {
            employee: { include: { user: true } },
            jobOffer: true,
            agent: true
          }
        }),
        evaluation: evaluationRecord
      };

    } catch (error) {
      console.error('❌ Error completing interview:', error);
      throw error;
    }
  }

  /**
   * Analyze candidate response using AI
   */
  async analyzeResponse(responseText, questionId) {
    try {
      const question = await prisma.interviewQuestion.findUnique({
        where: { id: questionId }
      });

      const prompt = `
Analyze this interview response for a restaurant position:

Question: "${question.questionText}"
Question Type: ${question.questionType}
Expected Keywords: ${question.expectedKeywords.join(', ')}

Candidate Response: "${responseText}"

Provide analysis in JSON format:
{
  "sentiment": "positive|negative|neutral",
  "sentimentScore": -1.0 to 1.0,
  "relevanceScore": 0.0 to 1.0,
  "completenessScore": 0.0 to 1.0,
  "keywordMatches": ["keyword1", "keyword2"],
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"]
}`;

      const completion = await openai.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      });

      return JSON.parse(completion.choices[0].message.content);

    } catch (error) {
      console.error('❌ Error analyzing response:', error);
      return {
        sentiment: 'neutral',
        sentimentScore: 0,
        relevanceScore: 0.5,
        completenessScore: 0.5,
        keywordMatches: [],
        strengths: [],
        concerns: []
      };
    }
  }

  /**
   * Generate comprehensive interview evaluation
   */
  async generateInterviewEvaluation(session) {
    try {
      const prompt = `
        Analyze this complete interview for a restaurant position:

        Job: ${session.jobOffer.position}
        Candidate: ${session.employee.user.name}
        Restaurant: ${session.jobOffer.restaurant.name}

        Interview Responses:
        ${session.responses.map(r => `
        Q: ${r.question.questionText}
        A: ${r.responseText}
        Sentiment: ${r.sentiment} (${r.sentimentScore})
        Relevance: ${r.relevanceScore}
        Completeness: ${r.completenessScore}
        `).join('\n')}

        Provide comprehensive evaluation in JSON format:
        {
        "communication": 1-10,
        "technicalSkills": 1-10,
        "experience": 1-10,
        "culturalFit": 1-10,
        "motivation": 1-10,
        "problemSolving": 1-10,
        "overallScore": 1-10,
        "recommendation": "strong_hire|hire|maybe|no_hire",
        "reasoning": "detailed explanation",
        "strengths": ["strength1", "strength2"],
        "concerns": ["concern1", "concern2"],
        "followUpQuestions": ["question1", "question2"],
        "summary": "comprehensive interview summary",
        "keyPoints": ["point1", "point2"],
        "confidence": 0.0-1.0
        }`;

      const completion = await openai.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.3
      });

      return JSON.parse(completion.choices[0].message.content);

    } catch (error) {
      console.error('❌ Error generating evaluation:', error);
      return {
        communication: 5,
        technicalSkills: 5,
        experience: 5,
        culturalFit: 5,
        motivation: 5,
        problemSolving: 5,
        overallScore: 5,
        recommendation: 'maybe',
        reasoning: 'Unable to complete full analysis',
        strengths: [],
        concerns: [],
        followUpQuestions: [],
        summary: 'Interview analysis incomplete',
        keyPoints: [],
        confidence: 0.5
      };
    }
  }

  /**
   * Generate interview greeting
   */
  async generateInterviewGreeting(session) {
    try {
      const prompt = `
Generate a warm, professional greeting for an AI interview:

Job: ${session.jobOffer.position}
Restaurant: ${session.jobOffer.restaurant.name}
Candidate: ${session.employee.user.name}
Agent: ${session.agent.name}

Create a friendly, professional greeting that:
- Welcomes the candidate
- Explains the interview process
- Sets expectations
- Makes them feel comfortable

Keep it conversational and under 100 words.`;

      const completion = await openai.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7
      });

      return completion.choices[0].message.content;

    } catch (error) {
      console.error('❌ Error generating greeting:', error);
      return `Hello ${session.employee.user.name}! I'm ${session.agent.name}, your AI interviewer for the ${session.jobOffer.position} position at ${session.jobOffer.restaurant.name}. I'm excited to learn more about you today. Let's begin!`;
    }
  }

  /**
   * Get interview template for job
   */
  async getInterviewTemplate(jobOfferId) {
    try {
      const jobOffer = await prisma.jobOffer.findUnique({
        where: { id: jobOfferId },
        include: { restaurant: true }
      });

      // Try to find restaurant-specific template first
      let template = await prisma.interviewTemplate.findFirst({
        where: {
          restaurantId: jobOffer.restaurantId,
          isActive: true
        },
        include: { questions: { orderBy: { order: 'asc' } } }
      });

      // Fall back to global template
      if (!template) {
        template = await prisma.interviewTemplate.findFirst({
          where: {
            restaurantId: null,
            isActive: true
          },
          include: { questions: { orderBy: { order: 'asc' } } }
        });
      }

      return template;

    } catch (error) {
      console.error('❌ Error getting interview template:', error);
      return null;
    }
  }

  /**
   * Create interview questions from template
   */
  async createInterviewQuestions(sessionId, templateId) {
    try {
      const templateQuestions = await prisma.interviewTemplateQuestion.findMany({
        where: { templateId },
        orderBy: { order: 'asc' }
      });

      for (const templateQuestion of templateQuestions) {
        await prisma.interviewQuestion.create({
          data: {
            interviewSessionId: sessionId,
            questionText: templateQuestion.questionText,
            questionType: templateQuestion.questionType,
            category: templateQuestion.category,
            order: templateQuestion.order,
            isRequired: templateQuestion.isRequired,
            expectedKeywords: templateQuestion.expectedKeywords
          }
        });
      }

    } catch (error) {
      console.error('❌ Error creating interview questions:', error);
    }
  }

  /**
   * Get next question in interview
   */
  async getNextQuestion(sessionId, currentQuestionId) {
    try {
      const currentQuestion = await prisma.interviewQuestion.findUnique({
        where: { id: currentQuestionId }
      });

      const nextQuestion = await prisma.interviewQuestion.findFirst({
        where: {
          interviewSessionId: sessionId,
          order: { gt: currentQuestion.order }
        },
        orderBy: { order: 'asc' }
      });

      return nextQuestion;

    } catch (error) {
      console.error('❌ Error getting next question:', error);
      return null;
    }
  }

  /**
   * Send interview scheduled notification
   */
  async sendInterviewScheduledNotification(session) {
    try {
      const candidate = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { user: true }
      });

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: session.restaurantId }
      });

      await sendMessageNotification({
        senderName: 'Gourmet Jobs AI',
        senderEmail: 'noreply@gourmetjobs.cl',
        recipientName: candidate.user.name,
        recipientEmail: candidate.user.email,
        messagePreview: `Interview scheduled for ${session.title} on ${session.scheduledDate.toLocaleDateString()}`,
        restaurantName: restaurant.name,
        conversationId: session.id
      });

    } catch (error) {
      console.error('❌ Error sending interview notification:', error);
    }
  }

  /**
   * Send interview results notification
   */
  async sendInterviewResultsNotification(session, evaluation) {
    try {
      // Get restaurant owner/HR email
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: session.restaurantId },
        include: { user: true }
      });

      await sendMessageNotification({
        senderName: 'Gourmet Jobs AI',
        senderEmail: 'noreply@gourmetjobs.cl',
        recipientName: restaurant.user.name,
        recipientEmail: restaurant.user.email,
        messagePreview: `Interview completed for ${session.employee.user.name} - Score: ${evaluation.overallScore}/10 - Recommendation: ${evaluation.recommendation}`,
        restaurantName: restaurant.name,
        conversationId: session.id
      });

    } catch (error) {
      console.error('❌ Error sending results notification:', error);
    }
  }
}

module.exports = new AiInterviewService();
