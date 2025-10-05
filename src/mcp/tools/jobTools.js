const { createJobOffer } = require('../../helpers/jobHelpers.js');
const BaseTool = require('./baseTool');
const OpenAI = require('openai');

/**
 * Create Job Offer Tool
 */
class CreateJobOfferTool extends BaseTool {
  constructor() {
    super(
      'create_job_offer',
      'Create a new job offer from structured data',
      {
        type: 'object',
        properties: {
          position: { type: 'string', description: 'Job position title' },
          locationId: { type: 'number', description: 'Location ID where the job is located' },
          schedule: { type: 'string', description: 'Work schedule (Full-time, Part-time, Otro)' },
          contract: { type: 'string', description: 'Contract type (A Plazo, Indefinido, Honorarios, Práctica, Otros)' },
          salary: { type: 'number', description: 'Salary amount' },
          propina: { type: 'string', description: 'Includes tips (Si/No)' },
          vacancies: { type: 'number', description: 'Number of available positions' },
          yearsOfExperience: { type: 'number', description: 'Required years of experience' },
          period: { type: 'string', description: 'Job period (Permanente, Reemplazo Temporal, Reemplazo Urgente, Sin información)' },
          description: { type: 'string', description: 'Job description' },
          requirements: { type: 'string', description: 'Job requirements' },
          functions: { type: 'string', description: 'Main job functions' },
          questions: { type: 'array', items: { type: 'string' }, description: 'Interview questions' },
          restaurantId: { type: 'number', description: 'Restaurant ID' },
          restaurantUserId: { type: 'number', description: 'Restaurant user ID who created the job' }
        },
        required: ['position', 'locationId', 'restaurantId', 'restaurantUserId']
      }
    );
  }

  async handle(args, { prisma }) {
    console.log('🤖 [MCP] Creating job offer with data:', args);
    
    const jobOffer = await createJobOffer(args);
    
    return this.createSuccessResponse({
      message: 'Job offer created successfully',
      jobOffer: {
        id: jobOffer.id,
        position: jobOffer.position,
        restaurantId: jobOffer.restaurantId,
        createdAt: jobOffer.createdAt
      }
    });
  }
}

/**
 * Process Job Creation Tool - Pure MCP approach
 */
class ProcessJobCreationTool extends BaseTool {
  constructor() {
    super(
      'process_job_creation',
      'Process natural language job creation requests using AI',
      {
        type: 'object',
        properties: {
          userMessage: { type: 'string', description: 'User message in natural language' },
          conversationHistory: { type: 'array', items: { type: 'object' }, description: 'Previous conversation context' },
          restaurantContext: { type: 'object', description: 'Restaurant context information' }
        },
        required: ['userMessage', 'restaurantContext']
      }
    );
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.systemPrompt = `Eres un asistente de IA especializado en crear ofertas de trabajo para restaurantes.

INSTRUCCIONES:
1. Analiza la descripción del trabajo proporcionada por el usuario
2. Extrae la información relevante y organízala en campos estructurados
3. Si falta información importante, haz preguntas específicas al usuario
4. Mantén un tono profesional y amigable
5. Siempre confirma los detalles antes de proceder
6. IMPORTANTE: Si falta información crítica (como posición, horario, salario), pregunta específicamente por ella
7. Usa el status "incomplete" cuando necesites más información del usuario

CAMPOS DISPONIBLES:
- position: Posición del trabajo (Garzón, Chef, Bartender, etc.)
- schedule: Horario (Full-time, Part-time, Otro)
- contract: Tipo de contrato (A Plazo, Indefinido, Honorarios, Práctica, Otros)
- salary: Salario (número)
- propina: Si incluye propinas (Si/No)
- vacancies: Número de vacantes
- yearsOfExperience: Años de experiencia requeridos (0-5+)
- period: Período (Permanente, Reemplazo Temporal, Reemplazo Urgente, Sin información)
- description: Descripción del trabajo
- requirements: Requisitos específicos
- functions: Funciones principales
- questions: Preguntas para la entrevista (array de strings)

RESPUESTA ESPERADA:
Siempre responde en formato JSON con esta estructura:
{
  "status": "complete|incomplete|question",
  "message": "Mensaje para el usuario",
  "extractedData": {
    "position": "string",
    "schedule": "string", 
    "contract": "string",
    "salary": number,
    "propina": "Si|No",
    "vacancies": number,
    "yearsOfExperience": number,
    "period": "string",
    "description": "string",
    "requirements": "string",
    "functions": "string",
    "questions": ["string"]
  },
  "missingFields": ["field1", "field2"],
  "suggestions": ["sugerencia1", "sugerencia2"]
}

EJEMPLOS DE POSICIONES VÁLIDAS:
- Garzón, Runner, Chef, Ayudante de Cocina, Anfitrión, Delivery, Cajero, Copero, Barista, Bartender, Sommelier, Maitre, Jefe de salón, Limpieza

EJEMPLOS DE HORARIOS VÁLIDOS:
- Full-time, Part-time, Otro

EJEMPLOS DE CONTRATOS VÁLIDAS:
- A Plazo, Indefinido, Honorarios, Práctica, Otros

EJEMPLOS DE PERÍODOS VÁLIDOS:
- Permanente, Reemplazo Temporal, Reemplazo Urgente, Sin información

Si el usuario proporciona información incompleta, haz preguntas específicas para completar los campos faltantes.`;
  }

  async handle(args, { prisma }) {
    const { userMessage, conversationHistory = [], restaurantContext } = args;
    
    try {
      console.log('🤖 [MCP] Processing job creation request:', userMessage);
      
      // Build messages for OpenAI
      const messages = [
        { role: "system", content: this.systemPrompt },
        ...conversationHistory,
        { role: "user", content: userMessage }
      ];

      // Add restaurant context
      if (restaurantContext.name) {
        messages[0].content += `\n\nCONTEXTO DEL RESTAURANTE: ${restaurantContext.name}`;
      }

      // Call OpenAI
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7
      });

      const responseText = completion.choices[0].message.content;
      
      // Parse AI response
      let aiResponse;
      try {
        aiResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Error parsing AI response:', parseError);
        return this.createErrorResponse('Error processing AI response');
      }

      // Clean extracted data
      if (aiResponse.extractedData) {
        aiResponse.extractedData = this.cleanExtractedData(aiResponse.extractedData);
      }

      // If complete, create the job
      if (aiResponse.status === 'complete' && aiResponse.extractedData) {
        try {
          const jobData = {
            ...aiResponse.extractedData,
            restaurantId: restaurantContext.id,
            restaurantUserId: restaurantContext.userId,
            locationId: restaurantContext.locationId || 1
          };

          const jobOffer = await createJobOffer(jobData);
          
          aiResponse.message = `¡Perfecto! He creado la oferta de trabajo para ${aiResponse.extractedData.position}. La oferta ha sido publicada exitosamente.`;
          aiResponse.jobCreated = true;
          aiResponse.jobId = jobOffer.id;
        } catch (jobError) {
          console.error('❌ Error creating job:', jobError);
          aiResponse.message = 'Hubo un error al crear la oferta de trabajo. Por favor, intenta de nuevo.';
          aiResponse.status = 'error';
        }
      }

      return this.createSuccessResponse(aiResponse);

    } catch (error) {
      console.error('❌ [MCP] Error processing job creation:', error);
      return this.createErrorResponse('Failed to process job creation request');
    }
  }

  cleanExtractedData(data) {
    const cleaned = {};
    
    // Clean string fields
    const stringFields = ['position', 'schedule', 'contract', 'propina', 'period', 'description', 'requirements', 'functions'];
    stringFields.forEach(field => {
      if (data[field]) cleaned[field] = data[field].trim();
    });
    
    // Clean numeric fields
    const numericFields = ['salary', 'vacancies', 'yearsOfExperience'];
    numericFields.forEach(field => {
      if (data[field] && !isNaN(data[field])) {
        cleaned[field] = parseInt(data[field]);
      }
    });
    
    // Clean questions array
    if (Array.isArray(data.questions)) {
      cleaned.questions = data.questions.filter(q => q && q.trim()).map(q => q.trim());
    }
    
    return cleaned;
  }
}

// Create tool instances
const createJobOfferTool = new CreateJobOfferTool();
const processJobCreationTool = new ProcessJobCreationTool();

const tools = [
  createJobOfferTool.getDefinition(),
  processJobCreationTool.getDefinition()
];

const handlers = {
  create_job_offer: (args, context) => createJobOfferTool.execute(args, context),
  process_job_creation: (args, context) => processJobCreationTool.execute(args, context)
};

module.exports = {
  getTools: () => tools,
  getHandlers: () => handlers
};
