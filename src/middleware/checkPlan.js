const { prisma } = require('../db.js');

// Middleware para filtrar rutas según el plan del usuario (solo para restaurantes/empresas)
function requirePlan(plans = []) {
  return async (req, res, next) => {
    try {
      // Solo verificar planes para usuarios de restaurantes
      const restaurantUserId = req.restaurantUserId;
      
      if (!restaurantUserId) {
        return res.status(401).json({ message: 'No autenticado como usuario de restaurante' });
      }

      // Buscar el usuario de restaurante y su usuario asociado
      const restaurantUser = await prisma.restaurantUser.findUnique({
        where: { id: restaurantUserId },
        include: {
          user: true
        }
      });

      if (!restaurantUser || !restaurantUser.user) {
        return res.status(401).json({ message: 'Usuario de restaurante no encontrado' });
      }

      const user = restaurantUser.user;

      // Verificar el plan del usuario
      if (!plans.includes(user.payment_status)) {
        // Mensaje específico para explorador de talento
        if (plans.includes('plus') && plans.includes('premium')) {
          return res.status(403).json({ 
            message: 'Tu plan actual no permite acceder al explorador de talento. Necesitas un plan PLUS o PREMIUM para acceder a esta función.' 
          });
        }
        
        // Mensaje general para otras funcionalidades
        return res.status(403).json({ 
          message: 'Tu plan actual no permite acceder a esta función. Necesitas un plan PRO o superior para usar el chat y mensajería.' 
        });
      }

      // Si el plan no es "starter", verificar la vigencia del pago (30 días)
      if (user.payment_status !== 'starter') {
        const lastPayment = user.last_payment ? new Date(user.last_payment) : null;
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        
        if (!lastPayment || lastPayment < thirtyDaysAgo) {
          return res.status(403).json({ 
            message: 'Tu suscripción ha expirado. Por favor, renueva tu pago para continuar usando esta función.' 
          });
        }
      }

      // Agregar el usuario al request para uso posterior
      req.user = user;
      next();
    } catch (error) {
      console.error('Error en middleware requirePlan:', error);
      return res.status(500).json({ message: 'Error interno del servidor' });
    }
  };
}

// Middleware para verificar límites de job offers según el plan (solo para restaurantes/empresas)
function checkJobOfferLimit() {
  return async (req, res, next) => {
    try {
      // Solo verificar límites para usuarios de restaurantes
      const restaurantUserId = req.restaurantUserId;
      
      if (!restaurantUserId) {
        // Si no es usuario de restaurante, permitir acceso (empleados no tienen límites)
        return next();
      }

      // Buscar el usuario de restaurante y su usuario asociado
      const restaurantUser = await prisma.restaurantUser.findUnique({
        where: { id: restaurantUserId },
        include: {
          user: true,
          jobOffers: {
            where: { deletedAt: null }
          }
        }
      });

      if (!restaurantUser || !restaurantUser.user) {
        return res.status(401).json({ message: 'Usuario de restaurante no encontrado' });
      }

      const user = restaurantUser.user;
      const currentJobOffers = restaurantUser.jobOffers.length;

      // Definir límites según el plan
      const planLimits = {
        'starter': 1,
        'pro': 5,
        'plus': 10,
        'premium': Infinity
      };

      const limit = planLimits[user.payment_status] || 1;

      // Verificar si ha alcanzado el límite
      if (currentJobOffers >= limit) {
        const planNames = {
          'starter': 'STARTER',
          'pro': 'PRO',
          'plus': 'PLUS',
          'premium': 'PREMIUM'
        };

        const currentPlan = planNames[user.payment_status] || 'STARTER';
        
        if (user.payment_status === 'premium') {
          return res.status(403).json({ 
            message: 'Has alcanzado el límite de ofertas de trabajo. Contacta soporte si necesitas más.' 
          });
        } else {
          return res.status(403).json({ 
            message: `Has alcanzado el límite de ${limit} ofertas de trabajo de tu plan ${currentPlan}. Actualiza a un plan superior para publicar más ofertas.`,
            currentPlan: user.payment_status,
            currentJobOffers,
            limit,
            upgradeMessage: `Actualiza a ${user.payment_status === 'starter' ? 'PRO' : user.payment_status === 'pro' ? 'PLUS' : 'PREMIUM'} para publicar más ofertas.`
          });
        }
      }

      // Verificar vigencia del pago para planes pagos
      if (user.payment_status !== 'starter') {
        const lastPayment = user.last_payment ? new Date(user.last_payment) : null;
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        
        if (!lastPayment || lastPayment < thirtyDaysAgo) {
          return res.status(403).json({ 
            message: 'Tu suscripción ha expirado. Por favor, renueva tu pago para continuar publicando ofertas.' 
          });
        }
      }

      // Agregar información útil al request
      req.user = user;
      req.currentJobOffers = currentJobOffers;
      req.jobOfferLimit = limit;
      req.remainingJobOffers = limit - currentJobOffers;

      next();
    } catch (error) {
      console.error('Error en middleware checkJobOfferLimit:', error);
      return res.status(500).json({ message: 'Error interno del servidor' });
    }
  };
}

// Middleware para verificar límites de ubicaciones según el plan
function checkLocationLimit() {
  return async (req, res, next) => {
    try {
      // Obtener el userId del request (para creación de restaurantes)
      const userId = req.userId;
      
      if (!userId) {
        return res.status(401).json({ message: 'No autenticado' });
      }

      // Buscar el usuario
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(401).json({ message: 'Usuario no encontrado' });
      }

      // Obtener las ubicaciones del request
      const locations = req.body.locations || [];
      const requestedLocations = locations.length;

      // Definir límites de ubicaciones según el plan
      const locationLimits = {
        'starter': 1,
        'pro': 5,
        'plus': 10,
        'premium': Infinity
      };

      const limit = locationLimits[user.payment_status] || 1;

      // Verificar si excede el límite
      if (requestedLocations > limit) {
        const planNames = {
          'starter': 'STARTER',
          'pro': 'PRO',
          'plus': 'PLUS',
          'premium': 'PREMIUM'
        };

        const currentPlan = planNames[user.payment_status] || 'STARTER';
        
        if (user.payment_status === 'premium') {
          return res.status(403).json({ 
            message: 'Has excedido el límite de ubicaciones. Contacta soporte si necesitas más.' 
          });
        } else {
          return res.status(403).json({ 
            message: `Tu plan ${currentPlan} permite máximo ${limit} ubicaciones. Estás intentando crear ${requestedLocations} ubicaciones. Actualiza a un plan superior para más ubicaciones.`,
            currentPlan: user.payment_status,
            requestedLocations,
            limit,
            upgradeMessage: `Actualiza a ${user.payment_status === 'starter' ? 'PRO' : user.payment_status === 'pro' ? 'PLUS' : 'PREMIUM'} para más ubicaciones.`
          });
        }
      }

      // Verificar vigencia del pago para planes pagos
      if (user.payment_status !== 'starter') {
        const lastPayment = user.last_payment ? new Date(user.last_payment) : null;
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        
        if (!lastPayment || lastPayment < thirtyDaysAgo) {
          return res.status(403).json({ 
            message: 'Tu suscripción ha expirado. Por favor, renueva tu pago para continuar creando restaurantes.' 
          });
        }
      }

      // Agregar información útil al request
      req.user = user;
      req.locationLimit = limit;
      req.requestedLocations = requestedLocations;

      next();
    } catch (error) {
      console.error('Error en middleware checkLocationLimit:', error);
      return res.status(500).json({ message: 'Error interno del servidor' });
    }
  };
} 

module.exports = {
  requirePlan,
  checkLocationLimit,
  checkJobOfferLimit,
}; 