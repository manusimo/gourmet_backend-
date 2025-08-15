# 🎯 Sistema de Planes - Gourmet Jobs Backend

## 📋 Resumen Ejecutivo

El sistema de planes implementado en Gourmet Jobs Backend permite restringir el acceso a funcionalidades específicas según el plan de pago del usuario. Solo los usuarios de restaurantes (empresas) tienen planes de pago, mientras que los empleados no tienen restricciones.

## 🏗️ Arquitectura del Sistema

### 📁 Archivos Principales
- **`src/middleware/checkPlan.js`** - Middlewares de verificación de planes
- **`src/routes/company.route.js`** - Rutas de empresas con límites de ubicaciones
- **`src/routes/job.route.js`** - Rutas de trabajos con límites de ofertas
- **`src/routes/chat.route.js`** - Rutas de chat con restricciones por plan
- **`src/routes/pool.route.js`** - Rutas de talent pool con restricciones
- **`src/routes/employee.route.js`** - Rutas de empleados con búsqueda restringida

### 🗄️ Base de Datos
- **Modelo User**: Campos `payment_status` y `last_payment` agregados
- **Migración**: `20250725040944_add_payment_status_to_user`

## 💰 Planes Disponibles

### 📊 Comparativa de Planes

| Funcionalidad | STARTER | PRO | PLUS | PREMIUM |
|---------------|---------|-----|------|---------|
| **Ubicaciones** | 1 | 5 | 10 | ∞ |
| **Job Offers** | 1 | 5 | 10 | ∞ |
| **Chat/Mensajería** | ❌ | ✅ | ✅ | ✅ |
| **Explorador de Talento** | ❌ | ❌ | ✅ | ✅ |
| **Búsqueda de Empleados** | ❌ | ❌ | ✅ | ✅ |
| **Precio** | Gratuito | $49.900 +IVA | $69.900 +IVA | $99.900 +IVA |

### 🔄 Vigencia de Pagos
- **STARTER**: Sin límite de tiempo
- **PRO/PLUS/PREMIUM**: 30 días desde el último pago
- **Expiración**: Acceso bloqueado después de 30 días sin renovación

## 🔒 Middlewares Implementados

### 1. `requirePlan(plans = [])`
**Propósito**: Restringe acceso a rutas según el plan del usuario

**Parámetros**:
- `plans`: Array de planes permitidos (ej: `['pro', 'plus', 'premium']`)

**Validaciones**:
- Verifica que el usuario tenga uno de los planes especificados
- Valida vigencia del pago (30 días para planes pagos)
- Mensajes personalizados según la funcionalidad

**Uso**:
```javascript
router.post('/send-message', requirePlan(['pro', 'plus', 'premium']), async (req, res) => {
  // Solo usuarios con plan PRO+ pueden acceder
});
```

### 2. `checkJobOfferLimit()`
**Propósito**: Verifica límites de ofertas de trabajo según el plan

**Límites por Plan**:
- **STARTER**: 1 oferta
- **PRO**: 5 ofertas
- **PLUS**: 10 ofertas
- **PREMIUM**: Sin límite

**Validaciones**:
- Cuenta ofertas activas del restaurante
- Bloquea creación si se excede el límite
- Informa sobre actualización de plan

**Uso**:
```javascript
router.post('/job', checkJobOfferLimit(), async (req, res) => {
  // Verifica límites antes de crear oferta
});
```

### 3. `checkLocationLimit()`
**Propósito**: Verifica límites de ubicaciones al crear/actualizar restaurantes

**Límites por Plan**:
- **STARTER**: 1 ubicación
- **PRO**: 5 ubicaciones
- **PLUS**: 10 ubicaciones
- **PREMIUM**: Sin límite

**Validaciones**:
- Verifica cantidad de ubicaciones en el request
- Bloquea si excede el límite del plan
- Aplica a creación y actualización de restaurantes

**Uso**:
```javascript
router.post('/company', checkLocationLimit(), async (req, res) => {
  // Verifica límites de ubicaciones
});
```

## 🛣️ Rutas Protegidas

### 💬 Chat y Mensajería (Plan PRO+)
```javascript
// Rutas protegidas con requirePlan(['pro', 'plus', 'premium'])
POST /api/send-message
POST /api/create-conversation
```

### 👥 Explorador de Talento (Plan PLUS+)
```javascript
// Rutas protegidas con requirePlan(['plus', 'premium'])
GET /api/talent-pool
POST /api/talent-pool
GET /api/talent-pool/check
GET /api/employees/search
GET /api/company/talents-application
```

### 📝 Job Offers (Límites por Plan)
```javascript
// Ruta protegida con checkJobOfferLimit()
POST /api/job
```

### 🏢 Creación/Actualización de Empresas (Límites de Ubicaciones)
```javascript
// Rutas protegidas con checkLocationLimit()
POST /api/company
PATCH /api/company
```

### 📊 Información de Plan
```javascript
// Ruta para consultar información del plan
GET /api/my-plan-info
```

## 📨 Respuestas del Sistema

### ✅ Respuesta Exitosa con Información de Plan
```json
{
  "message": "Job offer created successfully",
  "jobOffer": { ... },
  "planInfo": {
    "currentPlan": "PRO",
    "remainingJobOffers": 4,
    "totalLimit": 5,
    "upgradeMessage": "Te quedan 4 ofertas de trabajo de tu plan PRO."
  }
}
```

### ❌ Respuesta de Error por Plan Insuficiente
```json
{
  "message": "Tu plan actual no permite acceder al explorador de talento. Necesitas un plan PLUS o PREMIUM para acceder a esta función."
}
```

### ⚠️ Respuesta de Error por Límite Alcanzado
```json
{
  "message": "Has alcanzado el límite de 1 ofertas de trabajo de tu plan STARTER. Actualiza a un plan superior para publicar más ofertas.",
  "currentPlan": "starter",
  "currentJobOffers": 1,
  "limit": 1,
  "upgradeMessage": "Actualiza a PRO para publicar más ofertas."
}
```

### 🔄 Respuesta de Error por Pago Expirado
```json
{
  "message": "Tu suscripción ha expirado. Por favor, renueva tu pago para continuar usando esta función."
}
```

## 🔧 Configuración y Uso

### 📝 Agregar Nueva Restricción de Plan

1. **Importar el middleware**:
```javascript
import { requirePlan } from '../middleware/checkPlan.js';
```

2. **Aplicar a la ruta**:
```javascript
router.get('/nueva-ruta', requirePlan(['plus', 'premium']), async (req, res) => {
  // Lógica de la ruta
});
```

### 📊 Agregar Nuevo Límite de Plan

1. **Modificar el middleware correspondiente** en `checkPlan.js`
2. **Actualizar los límites** en el objeto de configuración
3. **Aplicar el middleware** a las rutas correspondientes

### 🎨 Personalizar Mensajes

Los mensajes se personalizan automáticamente según:
- El plan actual del usuario
- La funcionalidad que se está intentando acceder
- El plan requerido para la funcionalidad

## 🧪 Testing

### 📋 Casos de Prueba Recomendados

1. **Usuario STARTER**:
   - Intentar crear más de 1 ubicación ❌
   - Intentar crear más de 1 job offer ❌
   - Intentar acceder al chat ❌
   - Intentar acceder al explorador de talento ❌

2. **Usuario PRO**:
   - Crear hasta 5 ubicaciones ✅
   - Crear hasta 5 job offers ✅
   - Acceder al chat ✅
   - Intentar acceder al explorador de talento ❌

3. **Usuario PLUS**:
   - Crear hasta 10 ubicaciones ✅
   - Crear hasta 10 job offers ✅
   - Acceder al chat ✅
   - Acceder al explorador de talento ✅

4. **Usuario PREMIUM**:
   - Crear ubicaciones ilimitadas ✅
   - Crear job offers ilimitados ✅
   - Acceder a todas las funcionalidades ✅

### 🔄 Testing de Vigencia

1. **Pago reciente** (< 30 días): Acceso normal ✅
2. **Pago expirado** (> 30 días): Acceso bloqueado ❌

## 🚀 Despliegue

### 📋 Checklist de Despliegue

- [ ] Ejecutar migración de base de datos
- [ ] Verificar que todos los middlewares estén importados
- [ ] Probar rutas protegidas con diferentes planes
- [ ] Verificar mensajes de error personalizados
- [ ] Probar límites de ubicaciones y job offers
- [ ] Verificar vigencia de pagos

### 🔧 Variables de Entorno

```env
# Configuración de JWT
JWT_SECRET=your_jwt_secret
JWT_ISSUER=your_jwt_issuer

# Base de datos
DATABASE_URL=postgresql://user:password@host:port/database

# Configuración del servidor
PORT=3000
NODE_ENV=production
```

## 📈 Monitoreo y Métricas

### 📊 Métricas Recomendadas

1. **Uso de Planes**:
   - Cantidad de usuarios por plan
   - Conversiones entre planes
   - Usuarios con pagos expirados

2. **Límites Alcanzados**:
   - Usuarios que alcanzan límites de ubicaciones
   - Usuarios que alcanzan límites de job offers
   - Intentos de acceso a funcionalidades restringidas

3. **Errores**:
   - Errores 403 por plan insuficiente
   - Errores por pago expirado
   - Errores por límites alcanzados

## 🔮 Futuras Mejoras

### 🎯 Funcionalidades Propuestas

1. **Sistema de Upgrades**:
   - API para actualizar planes
   - Integración con pasarelas de pago
   - Notificaciones de expiración

2. **Analytics Avanzados**:
   - Dashboard de uso por plan
   - Métricas de conversión
   - Reportes de ingresos

3. **Flexibilidad de Planes**:
   - Planes personalizados
   - Límites configurables
   - Períodos de prueba

4. **Notificaciones**:
   - Alertas de límites próximos
   - Recordatorios de renovación
   - Sugerencias de upgrade

---

**Última actualización**: 25 de Julio, 2025
**Versión**: 1.0.0
**Autor**: Sistema de Planes Gourmet Jobs 