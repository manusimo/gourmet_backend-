const { getEmployeeById: getEmployeeByIdHelper } = require('../helpers/employeeHelpers.js');
const { handleEmployeeError } = require('../utils/responseHelpers.js');
const { Logger } = require('../middleware/errorTracking.js');

/**
 * Middleware to validate and fetch employee by ID from params
 * Attaches employee to req.employee and req.employeeId
 */
const getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error = new Error('ID de empleado es requerido.');
      error.statusCode = 400;
      error.code = 'MISSING_EMPLOYEE_ID';
      return handleEmployeeError(res, error, { logger: Logger });
    }

    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      const error = new Error('ID de empleado inválido.');
      error.statusCode = 400;
      error.code = 'INVALID_EMPLOYEE_ID';
      return handleEmployeeError(res, error, { logger: Logger });
    }

    // Fetch employee
    const employee = await getEmployeeByIdHelper(parsedId);

    if (!employee) {
      Logger.warn('Employee not found', { employeeId: parsedId });
      const error = new Error('Perfil de empleado no encontrado.');
      error.statusCode = 404;
      error.code = 'EMPLOYEE_NOT_FOUND';
      return handleEmployeeError(res, error, { logger: Logger });
    }

    // Attach to request object
    req.employee = employee;
    req.employeeId = parsedId;

    next();
  } catch (error) {
    return handleEmployeeError(res, error, {
      context: { employeeId: req.params?.id },
      logger: Logger
    });
  }
};

module.exports = {
  getEmployeeById
};

