# 🛡️ DDoS Monitoring & Email Alert Setup

## 📧 **Email Configuration**

To receive DDoS alerts, you need to configure email settings in your `.env` file:

### **Required Environment Variables**

```bash
# Email Settings (Required for DDoS alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Alert Recipients
ADMIN_EMAIL=admin@yourcompany.com
SECURITY_TEAM_EMAIL=security@yourcompany.com  # Optional
```

### **Gmail Setup (Recommended)**

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
   - Use this password as `SMTP_PASS`

```bash
# Gmail Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-16-character-app-password
```

### **Other Email Providers**

```bash
# Outlook/Hotmail
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587

# Yahoo Mail
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587

# SendGrid (Business)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

---

## 🚨 **Alert Configuration**

### **Alert Thresholds**

The system monitors these metrics and sends alerts when thresholds are exceeded:

| **Metric** | **Warning** | **Critical** |
|------------|-------------|--------------|
| **Requests/Second** | 50 | 100 |
| **Requests/Minute** | 1,000 | 2,000 |
| **Requests/IP/Minute** | 200 | - |
| **Failed Requests/IP** | 20 | - |
| **Suspicious IPs** | 5 | - |

### **Alert Features**

- ✅ **Real-time monitoring** of all incoming requests
- ✅ **IP-based tracking** to identify suspicious sources
- ✅ **Failed request monitoring** (4xx/5xx responses)
- ✅ **Email alerts** with detailed traffic analysis
- ✅ **Alert cooldown** (15 minutes) to prevent spam
- ✅ **HTML email** with traffic statistics and recommendations

---

## 📊 **Admin Dashboard Endpoints**

### **Security Monitoring**

```bash
# Get real-time DDoS statistics
GET /api/admin/security/ddos-stats

# Response example:
{
  "success": true,
  "data": {
    "requestsPerSecond": 25,
    "requestsPerMinute": 450,
    "uniqueIPs": 12,
    "suspiciousIPs": 1,
    "failedRequests": 5,
    "topIPs": [...],
    "status": "NORMAL",
    "message": "Traffic levels normal"
  }
}
```

```bash
# Reset monitoring data (for testing)
POST /api/admin/security/reset-monitoring

# Get alert configuration
GET /api/admin/security/alert-config
```

---

## 🧪 **Testing the System**

### **Manual Testing**

1. **Check if monitoring is active**:
   ```bash
   curl http://localhost:5000/api/admin/security/ddos-stats
   ```

2. **Generate test traffic** (be careful!):
   ```bash
   # Send multiple requests quickly
   for i in {1..60}; do curl http://localhost:5000/health; done
   ```

3. **Check for alerts** in your email and server logs

### **Email Test**

Create a simple test script to verify email configuration:

```javascript
// test-email.js
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransporter({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-app-password',
  },
});

const testEmail = {
  from: 'your-email@gmail.com',
  to: 'your-email@gmail.com',
  subject: 'DDoS Monitoring Test',
  text: 'If you receive this, email configuration is working!'
};

transporter.sendMail(testEmail)
  .then(() => console.log('✅ Email test successful!'))
  .catch(console.error);
```

---

## 📋 **What Happens During an Attack**

### **1. Real-time Detection**
- System monitors every incoming request
- Tracks requests per second/minute
- Analyzes IP patterns and failed requests

### **2. Alert Triggered**
When thresholds are exceeded:
```
🚨 DDoS Alert (WARNING): High traffic detected: 75 req/sec
```

### **3. Email Sent**
Beautiful HTML email with:
- **Alert level** (WARNING/CRITICAL)
- **Traffic statistics** (requests/sec, IPs, etc.)
- **Top requesting IPs** with suspicious marking
- **Recommended actions**
- **Automatic protections** status

### **4. Rate Limiting Kicks In**
- Automatic blocking of excessive requests
- Protection continues until traffic normalizes

---

## 🔧 **Advanced Configuration**

### **Custom Thresholds**

Edit `src/middleware/ddosMonitoring.js`:

```javascript
const MONITORING_CONFIG = {
  REQUESTS_PER_SECOND_WARNING: 50,    // Lower for stricter monitoring
  REQUESTS_PER_SECOND_CRITICAL: 100,  // Adjust based on your server capacity
  REQUESTS_PER_MINUTE_WARNING: 1000,
  REQUESTS_PER_MINUTE_CRITICAL: 2000,
  ALERT_COOLDOWN_MINUTES: 15,         // Reduce for more frequent alerts
};
```

### **Production Recommendations**

1. **Use Redis** for tracking (instead of in-memory):
   ```javascript
   // Replace requestTracking with Redis
   const redis = require('redis');
   const client = redis.createClient();
   ```

2. **Database logging**:
   ```javascript
   // Log alerts to database for analysis
   await prisma.securityAlert.create({
     data: { level, message, details, timestamp }
   });
   ```

3. **Multiple email recipients**:
   ```bash
   ADMIN_EMAIL=admin@company.com,security@company.com,devops@company.com
   ```

---

## 🎯 **Email Alert Example**

When a DDoS attack is detected, you'll receive an email like this:

```
Subject: 🚨 CRITICAL DDoS Alert - High traffic detected: 150 req/sec

🚨 CRITICAL Security Alert
Possible DDoS Attack Detected

Alert Details:
Time: 2024-12-10T15:30:00.000Z
Message: High traffic detected: 150 req/sec

Traffic Analysis:
• Requests/Second: 150
• Requests/Minute: 2,500
• Unique IPs: 45
• Suspicious IPs: 8
• Failed Requests: 89

Top Requesting IPs:
192.168.1.100  |  500 requests  |  ⚠️ Suspicious
10.0.0.50      |  300 requests  |  ⚠️ Suspicious
203.0.113.1    |  45 requests   |  ✅ Normal

Recommended Actions:
• Monitor server resources (CPU, memory, disk)
• Check application logs for errors
• Consider enabling additional rate limiting
• Review top requesting IPs for suspicious patterns
• Consider activating DDoS protection service

⚡ Automatic Protections Active:
• Rate limiting is blocking excessive requests
• Authentication endpoints have additional protection
• Suspicious IPs are being monitored
```

---

## ✅ **Verification Checklist**

- [ ] Email configuration added to `.env`
- [ ] SMTP credentials tested
- [ ] Admin email set
- [ ] Server restarted with new config
- [ ] Monitoring endpoints accessible
- [ ] Test alert sent successfully
- [ ] Rate limiting working properly

Your DDoS monitoring system is now active and will protect your application! 🛡️✨ 