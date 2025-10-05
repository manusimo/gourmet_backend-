const { PrismaClient } = require('@prisma/client');
const { processMeetingNotifications } = require('./meetingNotificationService.js');

const prisma = new PrismaClient();

// AI Agent for intelligent meeting scheduling
class MeetingAgentService {
  constructor() {
    this.capabilities = [
      'schedule_meetings',
      'suggest_optimal_times',
      'handle_rescheduling',
      'send_reminders',
      'analyze_availability'
    ];
  }

  // Analyze applicant profile and suggest meeting type
  async analyzeApplicantForMeeting(employeeId, jobOfferId) {
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          user: true,
          applications: {
            where: { jobPostId: jobOfferId },
            include: {
              answers: {
                include: {
                  question: true
                }
              }
            }
          },
          experiences: true,
          educations: true
        }
      });

      if (!employee) {
        throw new Error('Employee not found');
      }

      const analysis = {
        employeeId,
        jobOfferId,
        profileScore: this.calculateProfileScore(employee),
        experienceLevel: this.assessExperienceLevel(employee),
        educationLevel: this.assessEducationLevel(employee),
        applicationQuality: this.assessApplicationQuality(employee.applications[0]),
        suggestedMeetingType: this.suggestMeetingType(employee),
        priority: this.calculatePriority(employee),
        recommendedDuration: this.recommendDuration(employee),
        suggestedQuestions: this.generateSuggestedQuestions(employee)
      };

      return analysis;
    } catch (error) {
      console.error('Error analyzing applicant:', error);
      throw error;
    }
  }

  // Calculate profile completeness score
  calculateProfileScore(employee) {
    let score = 0;
    const maxScore = 100;

    // Basic info (20 points)
    if (employee.name) score += 5;
    if (employee.aboutMe && employee.aboutMe.length > 50) score += 5;
    if (employee.position) score += 5;
    if (employee.location) score += 5;

    // Experience (30 points)
    if (employee.experiences && employee.experiences.length > 0) {
      score += Math.min(30, employee.experiences.length * 10);
    }

    // Education (20 points)
    if (employee.educations && employee.educations.length > 0) {
      score += Math.min(20, employee.educations.length * 10);
    }

    // Skills (15 points)
    if (employee.skills && employee.skills.length > 0) {
      score += Math.min(15, employee.skills.length * 3);
    }

    // Profile image (5 points)
    if (employee.profileImageUrl && employee.profileImageUrl !== 'No photo') {
      score += 5;
    }

    // Contact info (10 points)
    if (employee.phoneNumber && employee.phoneNumber !== '+56912345678') score += 5;
    if (employee.user.email) score += 5;

    return Math.min(score, maxScore);
  }

  // Assess experience level
  assessExperienceLevel(employee) {
    const experienceCount = employee.experiences?.length || 0;
    const yearsOfExperience = parseInt(employee.yearsOfExperience) || 0;

    if (yearsOfExperience >= 5 || experienceCount >= 3) {
      return 'senior';
    } else if (yearsOfExperience >= 2 || experienceCount >= 2) {
      return 'intermediate';
    } else if (yearsOfExperience >= 1 || experienceCount >= 1) {
      return 'junior';
    } else {
      return 'entry';
    }
  }

  // Assess education level
  assessEducationLevel(employee) {
    const educationCount = employee.educations?.length || 0;
    
    if (educationCount >= 2) {
      return 'high';
    } else if (educationCount === 1) {
      return 'medium';
    } else {
      return 'basic';
    }
  }

  // Assess application quality
  assessApplicationQuality(application) {
    if (!application) return 'incomplete';

    const answerCount = application.answers?.length || 0;
    const avgAnswerLength = application.answers?.reduce((sum, answer) => 
      sum + answer.answer.length, 0) / answerCount || 0;

    if (answerCount >= 3 && avgAnswerLength >= 50) {
      return 'excellent';
    } else if (answerCount >= 2 && avgAnswerLength >= 30) {
      return 'good';
    } else if (answerCount >= 1) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  // Suggest meeting type based on analysis
  suggestMeetingType(employee) {
    const profileScore = this.calculateProfileScore(employee);
    const experienceLevel = this.assessExperienceLevel(employee);
    const applicationQuality = this.assessApplicationQuality(employee.applications[0]);

    if (profileScore >= 80 && experienceLevel === 'senior' && applicationQuality === 'excellent') {
      return 'final_interview';
    } else if (profileScore >= 60 && (experienceLevel === 'intermediate' || experienceLevel === 'senior')) {
      return 'technical_interview';
    } else if (profileScore >= 40) {
      return 'initial_screening';
    } else {
      return 'phone_screening';
    }
  }

  // Calculate priority for scheduling
  calculatePriority(employee) {
    const profileScore = this.calculateProfileScore(employee);
    const experienceLevel = this.assessExperienceLevel(employee);
    const applicationQuality = this.assessApplicationQuality(employee.applications[0]);

    let priority = 0;

    // Profile score weight (40%)
    priority += (profileScore / 100) * 40;

    // Experience level weight (30%)
    const experienceWeight = {
      'senior': 30,
      'intermediate': 20,
      'junior': 10,
      'entry': 5
    };
    priority += experienceWeight[experienceLevel] || 0;

    // Application quality weight (30%)
    const qualityWeight = {
      'excellent': 30,
      'good': 20,
      'fair': 10,
      'poor': 5,
      'incomplete': 0
    };
    priority += qualityWeight[applicationQuality] || 0;

    return Math.round(priority);
  }

  // Recommend meeting duration
  recommendDuration(employee) {
    const meetingType = this.suggestMeetingType(employee);
    
    const durationMap = {
      'phone_screening': 15,
      'initial_screening': 30,
      'technical_interview': 45,
      'final_interview': 60
    };

    return durationMap[meetingType] || 30;
  }

  // Generate suggested questions for the meeting
  generateSuggestedQuestions(employee) {
    const questions = [];
    const experienceLevel = this.assessExperienceLevel(employee);
    const applicationQuality = this.assessApplicationQuality(employee.applications[0]);

    // Base questions for all candidates
    questions.push({
      question: "Cuéntame sobre ti y tu experiencia en el sector gastronómico",
      category: "general",
      importance: "high"
    });

    questions.push({
      question: "¿Por qué te interesa trabajar en nuestro restaurante?",
      category: "motivation",
      importance: "high"
    });

    // Experience-based questions
    if (experienceLevel === 'senior' || experienceLevel === 'intermediate') {
      questions.push({
        question: "Describe una situación desafiante que hayas enfrentado en el trabajo y cómo la resolviste",
        category: "experience",
        importance: "high"
      });

      questions.push({
        question: "¿Cómo manejas el trabajo bajo presión durante las horas pico?",
        category: "skills",
        importance: "medium"
      });
    }

    // Application quality-based questions
    if (applicationQuality === 'excellent' || applicationQuality === 'good') {
      questions.push({
        question: "Basándome en tu aplicación, veo que mencionaste [specific answer]. ¿Podrías expandir sobre eso?",
        category: "application_followup",
        importance: "medium"
      });
    }

    // Skills-based questions
    if (employee.skills && employee.skills.length > 0) {
      questions.push({
        question: `Veo que tienes experiencia en ${employee.skills.slice(0, 2).join(' y ')}. ¿Cómo aplicas estas habilidades en tu trabajo diario?`,
        category: "skills",
        importance: "medium"
      });
    }

    // Availability questions
    questions.push({
      question: "¿Cuál es tu disponibilidad horaria y qué días prefieres trabajar?",
      category: "availability",
      importance: "high"
    });

    return questions;
  }

  // Suggest optimal meeting times based on restaurant schedule
  async suggestOptimalTimes(restaurantId, employeeId, preferredDate = null) {
    try {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId }
      });

      if (!restaurant) {
        throw new Error('Restaurant not found');
      }

      // Get existing meetings for the restaurant
      const existingMeetings = await prisma.scheduledCall.findMany({
        where: {
          restaurantId,
          status: {
            not: 'cancelled'
          }
        },
        select: {
          scheduledDate: true,
          duration: true
        }
      });

      // Define optimal time slots (avoiding peak hours)
      const optimalSlots = [];
      const startDate = preferredDate ? new Date(preferredDate) : new Date();
      
      // Generate slots for the next 7 days
      for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + day);
        
        // Skip weekends for business meetings
        if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
          continue;
        }

        // Optimal times: 10-11 AM, 2-4 PM (avoiding lunch rush)
        const timeSlots = [
          { hour: 10, minute: 0 },
          { hour: 10, minute: 30 },
          { hour: 14, minute: 0 },
          { hour: 14, minute: 30 },
          { hour: 15, minute: 0 },
          { hour: 15, minute: 30 }
        ];

        for (const slot of timeSlots) {
          const slotTime = new Date(currentDate);
          slotTime.setHours(slot.hour, slot.minute, 0, 0);

          // Check if slot is available
          const isAvailable = !existingMeetings.some(meeting => {
            const meetingStart = new Date(meeting.scheduledDate);
            const meetingEnd = new Date(meetingStart);
            meetingEnd.setMinutes(meetingEnd.getMinutes() + meeting.duration);
            
            return slotTime >= meetingStart && slotTime < meetingEnd;
          });

          if (isAvailable && slotTime > new Date()) {
            optimalSlots.push({
              date: slotTime.toISOString(),
              time: slotTime.toLocaleTimeString('es-CL', { 
                hour: '2-digit', 
                minute: '2-digit',
                timeZone: 'America/Santiago'
              }),
              day: slotTime.toLocaleDateString('es-CL', { 
                weekday: 'long',
                timeZone: 'America/Santiago'
              }),
              priority: this.calculateSlotPriority(slotTime)
            });
          }
        }
      }

      // Sort by priority and return top 10
      return optimalSlots
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 10);

    } catch (error) {
      console.error('Error suggesting optimal times:', error);
      throw error;
    }
  }

  // Calculate slot priority based on time and day
  calculateSlotPriority(slotTime) {
    let priority = 0;
    
    // Prefer morning slots (10-11 AM)
    if (slotTime.getHours() >= 10 && slotTime.getHours() < 12) {
      priority += 30;
    }
    
    // Prefer afternoon slots (2-4 PM)
    if (slotTime.getHours() >= 14 && slotTime.getHours() < 16) {
      priority += 25;
    }
    
    // Prefer weekdays
    if (slotTime.getDay() >= 1 && slotTime.getDay() <= 5) {
      priority += 20;
    }
    
    // Prefer earlier dates
    const daysFromNow = Math.ceil((slotTime.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    priority += Math.max(0, 25 - daysFromNow);
    
    return priority;
  }

  // Auto-schedule meeting based on analysis
  async autoScheduleMeeting(restaurantId, employeeId, jobOfferId, agentId = null) {
    try {
      // Analyze the applicant
      const analysis = await this.analyzeApplicantForMeeting(employeeId, jobOfferId);
      
      // Get optimal time slots
      const optimalSlots = await this.suggestOptimalTimes(restaurantId, employeeId);
      
      if (optimalSlots.length === 0) {
        throw new Error('No available time slots found');
      }

      // Select the best slot
      const bestSlot = optimalSlots[0];
      const meetingDate = new Date(bestSlot.date);

      // Create meeting title based on analysis
      const meetingTitle = this.generateMeetingTitle(analysis);

      // Create the meeting
      const meeting = await prisma.scheduledCall.create({
        data: {
          agentId,
          restaurantId,
          employeeId,
          title: meetingTitle,
          description: this.generateMeetingDescription(analysis),
          scheduledDate: meetingDate,
          duration: analysis.recommendedDuration,
          status: 'scheduled'
        },
        include: {
          employee: {
            include: { user: true }
          },
          restaurant: true,
          agent: true
        }
      });

      // Send notifications
      await processMeetingNotifications({
        meeting,
        type: 'meeting_scheduled',
        restaurantId,
        employeeId
      });

      return {
        meeting,
        analysis,
        suggestedQuestions: analysis.suggestedQuestions
      };

    } catch (error) {
      console.error('Error auto-scheduling meeting:', error);
      throw error;
    }
  }

  // Generate meeting title based on analysis
  generateMeetingTitle(analysis) {
    const meetingTypeMap = {
      'phone_screening': 'Llamada de preselección',
      'initial_screening': 'Entrevista inicial',
      'technical_interview': 'Entrevista técnica',
      'final_interview': 'Entrevista final'
    };

    return meetingTypeMap[analysis.suggestedMeetingType] || 'Entrevista de trabajo';
  }

  // Generate meeting description based on analysis
  generateMeetingDescription(analysis) {
    const descriptions = {
      'phone_screening': 'Llamada telefónica para conocer más sobre tu perfil y experiencia.',
      'initial_screening': 'Primera entrevista para evaluar tu fit con la empresa y el puesto.',
      'technical_interview': 'Entrevista técnica para evaluar tus habilidades específicas.',
      'final_interview': 'Entrevista final con el equipo directivo.'
    };

    return descriptions[analysis.suggestedMeetingType] || 'Entrevista para evaluar tu candidatura.';
  }

  // Get meeting insights and recommendations
  async getMeetingInsights(meetingId) {
    try {
      const meeting = await prisma.scheduledCall.findUnique({
        where: { id: meetingId },
        include: {
          employee: {
            include: {
              user: true,
              applications: {
                include: {
                  answers: {
                    include: {
                      question: true
                    }
                  }
                }
              }
            }
          },
          restaurant: true
        }
      });

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      const analysis = await this.analyzeApplicantForMeeting(
        meeting.employeeId, 
        meeting.employee.applications[0]?.jobPostId
      );

      return {
        meeting,
        analysis,
        insights: {
          candidateStrength: this.getCandidateStrength(analysis),
          preparationTips: this.getPreparationTips(analysis),
          riskFactors: this.getRiskFactors(analysis),
          followUpActions: this.getFollowUpActions(analysis)
        }
      };

    } catch (error) {
      console.error('Error getting meeting insights:', error);
      throw error;
    }
  }

  // Get candidate strength assessment
  getCandidateStrength(analysis) {
    if (analysis.priority >= 80) return 'excellent';
    if (analysis.priority >= 60) return 'good';
    if (analysis.priority >= 40) return 'fair';
    return 'needs_improvement';
  }

  // Get preparation tips for the interviewer
  getPreparationTips(analysis) {
    const tips = [];

    if (analysis.experienceLevel === 'entry') {
      tips.push('Focus on potential and willingness to learn');
      tips.push('Ask about career goals and motivation');
    }

    if (analysis.applicationQuality === 'poor') {
      tips.push('Ask for clarification on application answers');
      tips.push('Focus on verbal communication skills');
    }

    if (analysis.profileScore < 50) {
      tips.push('Ask about missing information in profile');
      tips.push('Verify contact information and availability');
    }

    return tips;
  }

  // Get risk factors to watch for
  getRiskFactors(analysis) {
    const risks = [];

    if (analysis.profileScore < 40) {
      risks.push('Incomplete profile information');
    }

    if (analysis.applicationQuality === 'poor') {
      risks.push('Low quality application responses');
    }

    if (analysis.experienceLevel === 'entry' && analysis.educationLevel === 'basic') {
      risks.push('Limited experience and education');
    }

    return risks;
  }

  // Get follow-up actions
  getFollowUpActions(analysis) {
    const actions = [];

    if (analysis.priority >= 70) {
      actions.push('Schedule follow-up interview if first goes well');
      actions.push('Prepare job offer details');
    }

    if (analysis.experienceLevel === 'senior') {
      actions.push('Discuss leadership opportunities');
      actions.push('Evaluate for management potential');
    }

    return actions;
  }
}

module.exports = new MeetingAgentService();
