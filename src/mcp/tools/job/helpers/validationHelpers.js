/**
 * Validation Helpers for Job Creation
 * Static helper functions for field validation, missing fields detection, and user suggestions
 */

class ValidationHelpers {
  static fieldDefinitions = {
      position: {
        validator: (value) => !value || value === 'Posición no especificada',
        suggestion: 'Especifica la posición: Chef Ejecutivo, Sous Chef, Jefe de Cocina, Maestro de Cocina, Maestro Pastelero, Pastelero, Panadero, Repostero, Charcutero, Pizzero, Itamae, Sushiman, Ayudante de Sushi, Parrillero, Cocinero Frío, Cocinero Caliente, Manipulador de Alimentos, Encargado de Producción, Operador de Cocina, Operador de Planta, Operador Multifuncional, Encargado de Reservas, Recepcionista de Restaurante, Supervisor de Salón, Personal de Banquetería, Encargado de Bodega, Repositor, Personal de Mantenimiento, Jefe de Local, Administrador de Local, Jefe de Sucursales, Administrador de Restaurante, Encargado de Compras, Control de Calidad, Catador de Vinos, Coordinador de Banquetes, Montajista, Mixólogo'
      },
      schedule: {
        validator: (value) => !value,
        suggestion: 'Menciona el horario: Full-time (tiempo completo), Part-time (medio tiempo), u Otro'
      },
      salary: {
        validator: (value) => !value || value === 0,
        suggestion: 'Indica el salario ofrecido (solo el número, ej: 1200000)'
      },
      contract: {
        validator: (value) => !value,
        suggestion: 'Especifica el tipo de contrato: A Plazo, Indefinido, Honorarios, Práctica, u Otros'
      },
      vacancies: {
        validator: (value) => !value || value === 0,
        suggestion: 'Indica el número de vacantes'
      },
      yearsOfExperience: {
        validator: (value) => value === null || value === undefined || value === '',
        suggestion: 'Especifica los años de experiencia: Sin experiencia (0), 1 año, 2 años, 3 años, 4 años, o +5 años'
      },
      period: {
        validator: (value) => !value,
        suggestion: 'Indica el período: Permanente, Reemplazo Temporal, Reemplazo Urgente, o Sin información'
      },
      description: {
        validator: (value) => !value,
        suggestion: 'Describe el trabajo y sus responsabilidades'
      },
      requirements: {
        validator: (value) => !value,
        suggestion: 'Menciona los requisitos específicos del puesto'
      },
      functions: {
        validator: (value) => !value,
        suggestion: 'Describe las funciones principales del trabajo'
      },
      questions: {
        validator: (value) => !value || value.length === 0,
        suggestion: 'Agrega al menos una pregunta para la entrevista'
      }
    };

  /**
   * Get missing field names based on validation rules
   * @param {Object} data - Job data object
   * @returns {Array} Array of missing field names
   */
  static getMissingFields(data) {
    return Object.entries(this.fieldDefinitions)
      .filter(([fieldName, definition]) => definition.validator(data[fieldName]))
      .map(([fieldName, _]) => fieldName);
  }

  /**
   * Get user suggestions for missing fields
   * @param {Object} data - Job data object
   * @returns {Array} Array of suggestion messages
   */
  static getSuggestions(data) {
    return Object.entries(this.fieldDefinitions)
      .filter(([fieldName, definition]) => definition.validator(data[fieldName]))
      .map(([fieldName, definition]) => definition.suggestion);
  }

  /**
   * Check if job data has minimum required fields
   * @param {Object} data - Job data object
   * @returns {boolean} True if has minimum data
   */
  static hasMinimumData(data) {
    const requiredFields = ['position', 'schedule', 'contract', 'vacancies', 'functions', 'description', 'requirements', 'salary', 'period', 'yearsOfExperience', 'questions'];
    return requiredFields.every(field => {
      if (field === 'questions') {
        return data[field] && data[field].length > 0;
      }
      if (field === 'locationId') {
        // locationId is handled separately in the frontend (user selection)
        return true;
      }
      return data[field] && data[field] !== '' && data[field] !== 0;
    });
  }

  /**
   * Validate a specific field
   * @param {string} fieldName - Name of the field to validate
   * @param {any} value - Value to validate
   * @returns {boolean} True if field is valid
   */
  static validateField(fieldName, value) {
    const definition = this.fieldDefinitions[fieldName];
    if (!definition) {
      return true; // Unknown field, consider valid
    }
    return !definition.validator(value);
  }

  /**
   * Get suggestion for a specific field
   * @param {string} fieldName - Name of the field
   * @returns {string} Suggestion message
   */
  static getFieldSuggestion(fieldName) {
    const definition = this.fieldDefinitions[fieldName];
    return definition ? definition.suggestion : '';
  }
}

module.exports = ValidationHelpers;
