# 🎯 Plan System - Gourmet Jobs Backend

## 📋 Executive Summary

The plan system implemented in Gourmet Jobs Backend allows restricting access to specific functionalities based on the user's payment plan. Only restaurant users (companies) have payment plans, while employees have no restrictions.

## 🏗️ System Architecture

### 📁 Main Files
- **`src/middleware/checkPlan.js`** - Plan verification middlewares
- **`src/routes/company.route.js`** - Company routes with location limits
- **`src/routes/job.route.js`** - Job routes with offer limits
- **`src/routes/chat.route.js`** - Chat routes with plan restrictions
- **`src/routes/pool.route.js`** - Talent pool routes with restrictions
- **`src/routes/employee.route.js`** - Employee routes with restricted search

### 🗄️ Database
- **User Model**: Added `payment_status` and `last_payment` fields
- **Migration**: `20250725040944_add_payment_status_to_user`

## 💰 Available Plans

### 📊 Plan Comparison

| Feature | STARTER | PRO | PLUS | PREMIUM |
|---------|---------|-----|------|---------|
| **Locations** | 1 | 5 | 10 | ∞ |
| **Job Offers** | 1 | 5 | 10 | ∞ |
| **Chat/Messaging** | ❌ | ✅ | ✅ | ✅ |
| **Talent Explorer** | ❌ | ❌ | ✅ | ✅ |
| **Employee Search** | ❌ | ❌ | ✅ | ✅ |
| **Price** | Free | $49.900 +VAT | $69.900 +VAT | $99.900 +VAT |

### 🔄 Payment Validity
- **STARTER**: No time limit
- **PRO/PLUS/PREMIUM**: 30 days from last payment
- **Expiration**: Access blocked after 30 days without renewal

## 🔒 Implemented Middlewares

### 1. `requirePlan(plans = [])`
**Purpose**: Restricts route access based on user's plan

**Parameters**:
- `plans`: Array of allowed plans (e.g., `['pro', 'plus', 'premium']`)

**Validations**:
- Verifies user has one of the specified plans
- Validates payment validity (30 days for paid plans)
- Customized messages based on functionality

**Usage**:
```javascript
router.post('/send-message', requirePlan(['pro', 'plus', 'premium']), async (req, res) => {
  // Only users with PRO+ plan can access
});
```

### 2. `checkJobOfferLimit()`
**Purpose**: Verifies job offer limits based on plan

**Plan Limits**:
- **STARTER**: 1 offer
- **PRO**: 5 offers
- **PLUS**: 10 offers
- **PREMIUM**: No limit

**Validations**:
- Counts active offers from restaurant
- Blocks creation if limit exceeded
- Informs about plan upgrade

**Usage**:
```javascript
router.post('/job', checkJobOfferLimit(), async (req, res) => {
  // Verifies limits before creating offer
});
```

### 3. `checkLocationLimit()`
**Purpose**: Verifies location limits when creating/updating restaurants

**Plan Limits**:
- **STARTER**: 1 location
- **PRO**: 5 locations
- **PLUS**: 10 locations
- **PREMIUM**: No limit

**Validations**:
- Verifies location count in request
- Blocks if plan limit exceeded
- Applies to restaurant creation and updates

**Usage**:
```javascript
router.post('/company', checkLocationLimit(), async (req, res) => {
  // Verifies location limits
});
```

## 🛣️ Protected Routes

### 💬 Chat and Messaging (PRO+ Plan)
```javascript
// Routes protected with requirePlan(['pro', 'plus', 'premium'])
POST /api/send-message
POST /api/create-conversation
```

### 👥 Talent Explorer (PLUS+ Plan)
```javascript
// Routes protected with requirePlan(['plus', 'premium'])
GET /api/talent-pool
POST /api/talent-pool
GET /api/talent-pool/check
GET /api/employees/search
GET /api/company/talents-application
```

### 📝 Job Offers (Plan Limits)
```javascript
// Route protected with checkJobOfferLimit()
POST /api/job
```

### 🏢 Company Creation/Update (Location Limits)
```javascript
// Routes protected with checkLocationLimit()
POST /api/company
PATCH /api/company
```

### 📊 Plan Information
```javascript
// Route to query plan information
GET /api/my-plan-info
```

## 📨 System Responses

### ✅ Successful Response with Plan Info
```json
{
  "message": "Job offer created successfully",
  "jobOffer": { ... },
  "planInfo": {
    "currentPlan": "PRO",
    "remainingJobOffers": 4,
    "totalLimit": 5,
    "upgradeMessage": "You have 4 job offers remaining in your PRO plan."
  }
}
```

### ❌ Error Response for Insufficient Plan
```json
{
  "message": "Your current plan does not allow access to the talent explorer. You need a PLUS or PREMIUM plan to access this feature."
}
```

### ⚠️ Error Response for Limit Reached
```json
{
  "message": "You have reached the limit of 1 job offers in your STARTER plan. Upgrade to a higher plan to post more offers.",
  "currentPlan": "starter",
  "currentJobOffers": 1,
  "limit": 1,
  "upgradeMessage": "Upgrade to PRO to post more offers."
}
```

### 🔄 Error Response for Expired Payment
```json
{
  "message": "Your subscription has expired. Please renew your payment to continue using this feature."
}
```

## 🔧 Configuration and Usage

### 📝 Adding New Plan Restriction

1. **Import the middleware**:
```javascript
import { requirePlan } from '../middleware/checkPlan.js';
```

2. **Apply to route**:
```javascript
router.get('/new-route', requirePlan(['plus', 'premium']), async (req, res) => {
  // Route logic
});
```

### 📊 Adding New Plan Limit

1. **Modify the corresponding middleware** in `checkPlan.js`
2. **Update limits** in the configuration object
3. **Apply the middleware** to corresponding routes

### 🎨 Customizing Messages

Messages are automatically customized based on:
- User's current plan
- Functionality being accessed
- Plan required for the functionality

## 🧪 Testing

### 📋 Recommended Test Cases

1. **STARTER User**:
   - Try to create more than 1 location ❌
   - Try to create more than 1 job offer ❌
   - Try to access chat ❌
   - Try to access talent explorer ❌

2. **PRO User**:
   - Create up to 5 locations ✅
   - Create up to 5 job offers ✅
   - Access chat ✅
   - Try to access talent explorer ❌

3. **PLUS User**:
   - Create up to 10 locations ✅
   - Create up to 10 job offers ✅
   - Access chat ✅
   - Access talent explorer ✅

4. **PREMIUM User**:
   - Create unlimited locations ✅
   - Create unlimited job offers ✅
   - Access all features ✅

### 🔄 Payment Validity Testing

1. **Recent payment** (< 30 days): Normal access ✅
2. **Expired payment** (> 30 days): Blocked access ❌

## 🚀 Deployment

### 📋 Deployment Checklist

- [ ] Run database migration
- [ ] Verify all middlewares are imported
- [ ] Test protected routes with different plans
- [ ] Verify customized error messages
- [ ] Test location and job offer limits
- [ ] Verify payment validity

### 🔧 Environment Variables

```env
# JWT Configuration
JWT_SECRET=your_jwt_secret
JWT_ISSUER=your_jwt_issuer

# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Server Configuration
PORT=3000
NODE_ENV=production
```

## 📈 Monitoring and Metrics

### 📊 Recommended Metrics

1. **Plan Usage**:
   - Number of users per plan
   - Plan conversions
   - Users with expired payments

2. **Reached Limits**:
   - Users reaching location limits
   - Users reaching job offer limits
   - Attempts to access restricted features

3. **Errors**:
   - 403 errors for insufficient plans
   - Errors for expired payments
   - Errors for reached limits

## 🔮 Future Improvements

### 🎯 Proposed Features

1. **Upgrade System**:
   - API to update plans
   - Payment gateway integration
   - Expiration notifications

2. **Advanced Analytics**:
   - Plan usage dashboard
   - Conversion metrics
   - Revenue reports

3. **Plan Flexibility**:
   - Custom plans
   - Configurable limits
   - Trial periods

4. **Notifications**:
   - Limit proximity alerts
   - Renewal reminders
   - Upgrade suggestions

---

**Last updated**: July 25, 2025
**Version**: 1.0.0
**Author**: Gourmet Jobs Plan System 