/**
 * Data Extraction Helpers
 * Extracts job data from natural language using regex patterns
 */

class DataExtraction {
  /**
   * Extract position from message
   */
  static extractPosition(message) {
    const positions = {
      'garzon': 'Garzón', 'garzón': 'Garzón', 'waiter': 'Garzón', 'mesero': 'Garzón',
      'runner': 'Runner', 'chef': 'Chef', 'cook': 'Chef', 'cocinero': 'Chef',
      'ayudante de cocina': 'Ayudante de Cocina', 'ayudante cocina': 'Ayudante de Cocina',
      'anfitrion': 'Anfitrión', 'anfitrión': 'Anfitrión', 'host': 'Anfitrión',
      'delivery': 'Delivery', 'repartidor': 'Delivery', 'cajero': 'Cajero', 'cashier': 'Cajero',
      'copero': 'Copero', 'barista': 'Barista', 'bartender': 'Bartender', 'barman': 'Bartender',
      'sommelier': 'Sommelier', 'maitre': 'Maitre',
      'jefe de salon': 'Jefe de salón', 'jefe de salón': 'Jefe de salón', 'jefe salon': 'Jefe de salón',
      'limpieza': 'Limpieza', 'cleaner': 'Limpieza', 'aseo': 'Limpieza',
      'chef ejecutivo': 'Chef Ejecutivo', 'sous chef': 'Sous Chef',
      'jefe de cocina': 'Jefe de Cocina', 'maestro de cocina': 'Maestro de Cocina',
      'maestro pastelero': 'Maestro Pastelero', 'pastelero': 'Pastelero',
      'panadero': 'Panadero', 'repostero': 'Repostero', 'charcutero': 'Charcutero',
      'pizzero': 'Pizzero', 'itamae': 'Itamae', 'sushiman': 'Sushiman',
      'ayudante de sushi': 'Ayudante de Sushi', 'parrillero': 'Parrillero',
      'cocinero frío': 'Cocinero Frío', 'cocinero frio': 'Cocinero Frío',
      'cocinero caliente': 'Cocinero Caliente',
      'manipulador de alimentos': 'Manipulador de Alimentos',
      'encargado de producción': 'Encargado de Producción', 'encargado de produccion': 'Encargado de Producción',
      'operador de cocina': 'Operador de Cocina', 'operador de planta': 'Operador de Planta',
      'operador multifuncional': 'Operador Multifuncional',
      'encargado de reservas': 'Encargado de Reservas',
      'recepcionista de restaurante': 'Recepcionista de Restaurante', 'recepcionista': 'Recepcionista de Restaurante',
      'supervisor de salon': 'Supervisor de Salón', 'supervisor de salón': 'Supervisor de Salón',
      'personal de banquetería': 'Personal de Banquetería', 'personal de banqueteria': 'Personal de Banquetería',
      'encargado de bodega': 'Encargado de Bodega', 'repositor': 'Repositor',
      'personal de mantenimiento': 'Personal de Mantenimiento',
      'jefe de local': 'Jefe de Local', 'administrador de local': 'Administrador de Local',
      'jefe de sucursales': 'Jefe de Sucursales', 'administrador de restaurante': 'Administrador de Restaurante',
      'encargado de compras': 'Encargado de Compras', 'control de calidad': 'Control de Calidad',
      'catador de vinos': 'Catador de Vinos', 'coordinador de banquetes': 'Coordinador de Banquetes',
      'montajista': 'Montajista', 'mixologo': 'Mixólogo', 'mixólogo': 'Mixólogo'
    };
    
    const lowerMessage = message.toLowerCase();
    for (const [key, value] of Object.entries(positions)) {
      if (lowerMessage.includes(key)) {
        return value;
      }
    }
    return 'Posición no especificada';
  }

  /**
   * Extract salary from message
   */
  static extractSalary(message) {
    const largeSalaryMatch = message.match(/\$?(\d{6,}(?:,\d{3})*(?:\.\d{2})?)/);
    if (largeSalaryMatch) {
      return parseInt(largeSalaryMatch[1].replace(/,/g, ''));
    }
    
    const smallSalaryMatch = message.match(/\$?(\d{3,5}(?:,\d{3})*(?:\.\d{2})?)/);
    if (smallSalaryMatch) {
      return parseInt(smallSalaryMatch[1].replace(/,/g, ''));
    }
    
    return 0;
  }

  /**
   * Extract schedule from message
   */
  static extractSchedule(message) {
    if (message.includes('tiempo completo') || message.includes('full-time') || message.includes('full time')) {
      return 'Full-time';
    }
    if (message.includes('medio tiempo') || message.includes('part-time') || message.includes('part time')) {
      return 'Part-time';
    }
    return '';
  }

  /**
   * Extract contract from message
   */
  static extractContract(message) {
    if (message.includes('a plazo') || message.includes('plazo')) return 'A Plazo';
    if (message.includes('indefinido')) return 'Indefinido';
    if (message.includes('honorarios')) return 'Honorarios';
    if (message.includes('práctica') || message.includes('practica')) return 'Práctica';
    return '';
  }

  /**
   * Extract vacancies from message
   */
  static extractVacancies(message) {
    const vacancyMatch = message.match(/(\d+)\s*(?:vacantes?|puestos?|empleados?)/i);
    return vacancyMatch ? parseInt(vacancyMatch[1]) : 1;
  }

  /**
   * Extract years of experience from message
   */
  static extractYearsOfExperience(message) {
    if (message.includes('sin experiencia') || message.includes('0 años') || message.includes('0 año')) {
      return 0;
    }
    const expMatch = message.match(/(\d+)\s*(?:años?|año)/i);
    return expMatch ? parseInt(expMatch[1]) : null;
  }

  /**
   * Extract period from message
   */
  static extractPeriod(message) {
    if (message.includes('permanente')) return 'Permanente';
    if (message.includes('reemplazo temporal') || message.includes('temporal')) return 'Reemplazo Temporal';
    if (message.includes('reemplazo urgente') || message.includes('urgente')) return 'Reemplazo Urgente';
    return '';
  }

  /**
   * Extract description from message
   */
  static extractDescription(message) {
    const patterns = [
      /descrip[ció]n[:\s]*(.+?)(?:\n|$)/i,
      /describe[:\s]*(.+?)(?:\n|$)/i,
      /el trabajo es[:\s]*(.+?)(?:\n|$)/i,
      /ambiente[:\s]*(.+?)(?:\n|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * Extract functions from message
   */
  static extractFunctions(message) {
    const patterns = [
      /funciones[:\s]*(.+?)(?:\n|$)/i,
      /tareas[:\s]*(.+?)(?:\n|$)/i,
      /debe[:\s]*(.+?)(?:\n|$)/i,
      /responsabilidades[:\s]*(.+?)(?:\n|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * Extract requirements from message
   */
  static extractRequirements(message) {
    const patterns = [
      /requisitos[:\s]*(.+?)(?:\n|$)/i,
      /necesita[:\s]*(.+?)(?:\n|$)/i,
      /debe tener[:\s]*(.+?)(?:\n|$)/i,
      /experiencia en[:\s]*(.+?)(?:\n|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * Extract questions from message
   */
  static extractQuestions(message) {
    const patterns = [/pregunta[:\s]*(.+?)(?:\n|$)/i, /¿(.+?)\?/g];
    const questions = [];
    
    for (const pattern of patterns) {
      const matches = message.match(pattern);
      if (matches) {
        if (Array.isArray(matches)) {
          matches.forEach(match => {
            if (match.trim().length > 10) {
              questions.push({ question: match.trim() });
            }
          });
        } else if (matches.trim().length > 10) {
          questions.push({ question: matches.trim() });
        }
      }
    }
    return questions;
  }

  /**
   * Extract all data from message
   */
  static extractAllFromMessage(message) {
    const lowerMessage = message.toLowerCase();
    return {
      position: this.extractPosition(lowerMessage),
      salary: this.extractSalary(lowerMessage),
      schedule: this.extractSchedule(lowerMessage),
      contract: this.extractContract(lowerMessage),
      vacancies: this.extractVacancies(lowerMessage),
      yearsOfExperience: this.extractYearsOfExperience(lowerMessage),
      period: this.extractPeriod(lowerMessage),
      description: this.extractDescription(message),
      functions: this.extractFunctions(message),
      requirements: this.extractRequirements(message),
      questions: this.extractQuestions(message)
    };
  }
}

module.exports = DataExtraction;

