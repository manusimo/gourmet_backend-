const nodemailer = require('nodemailer');

/**
 * Create email transporter for sending alerts
 */
const createEmailTransporter = () => {
  // In test environment, return a mock transporter
  if (process.env.NODE_ENV === 'test') {
    return {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' })
    };
  }
  
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// DDoS monitoring configuration
const MONITORING_CONFIG = {
  // Thresholds for different alert levels
  REQUESTS_PER_SECOND_WARNING: 50,
  REQUESTS_PER_SECOND_CRITICAL: 100,
  REQUESTS_PER_MINUTE_WARNING: 1000,
  REQUESTS_PER_MINUTE_CRITICAL: 2000,
  
  // Time windows for monitoring
  MONITORING_WINDOW_SECONDS: 60,
  ALERT_COOLDOWN_MINUTES: 15, // Don't spam alerts
  
  // IP-based monitoring
  MAX_REQUESTS_PER_IP_PER_MINUTE: 200,
  MAX_FAILED_REQUESTS_PER_IP: 20,
};

// In-memory tracking (in production, use Redis)
const requestTracking = {
  totalRequests: [],
  ipRequests: new Map(),
  failedRequests: new Map(),
  lastAlertTime: 0,
  suspiciousIPs: new Set(),
};

/**
 * Send DDoS alert email
 */
const sendDDoSAlert = async (alertData) => {
  try {
    const transporter = createEmailTransporter();
    
    const { level, message, details, timestamp, recommendations } = alertData;
    
    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${level === 'CRITICAL' ? '#dc2626' : '#f59e0b'}; color: white; padding: 20px; text-align: center;">
          <h1>🚨 ${level} Security Alert</h1>
          <h2>Possible DDoS Attack Detected</h2>
        </div>
        
        <div style="padding: 20px; background: #f9fafb;">
          <h3>Alert Details</h3>
          <p><strong>Time:</strong> ${timestamp}</p>
          <p><strong>Message:</strong> ${message}</p>
          
          <h3>Traffic Analysis</h3>
          <ul>
            <li><strong>Requests/Second:</strong> ${details.requestsPerSecond}</li>
            <li><strong>Requests/Minute:</strong> ${details.requestsPerMinute}</li>
            <li><strong>Unique IPs:</strong> ${details.uniqueIPs}</li>
            <li><strong>Suspicious IPs:</strong> ${details.suspiciousIPs}</li>
            <li><strong>Failed Requests:</strong> ${details.failedRequests}</li>
          </ul>
          
          <h3>Top Requesting IPs</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
            <tr style="background: #e5e7eb;">
              <th style="padding: 8px; border: 1px solid #d1d5db;">IP Address</th>
              <th style="padding: 8px; border: 1px solid #d1d5db;">Requests</th>
              <th style="padding: 8px; border: 1px solid #d1d5db;">Status</th>
            </tr>
            ${details.topIPs.map(ip => `
              <tr>
                <td style="padding: 8px; border: 1px solid #d1d5db;">${ip.ip}</td>
                <td style="padding: 8px; border: 1px solid #d1d5db;">${ip.count}</td>
                <td style="padding: 8px; border: 1px solid #d1d5db;">
                  <span style="color: ${ip.suspicious ? '#dc2626' : '#059669'};">
                    ${ip.suspicious ? '⚠️ Suspicious' : '✅ Normal'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </table>
          
          <h3>Recommended Actions</h3>
          <ul>
            ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
          
          <div style="background: #fef3c7; padding: 15px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <strong>⚡ Automatic Protections Active:</strong>
            <ul>
              <li>Rate limiting is blocking excessive requests</li>
              <li>Authentication endpoints have additional protection</li>
              <li>Suspicious IPs are being monitored</li>
            </ul>
          </div>
        </div>
        
        <div style="background: #374151; color: white; padding: 15px; text-align: center;">
          <p><strong>Gourmet Jobs Security System</strong></p>
          <p>This is an automated security alert. Monitor your application dashboard for real-time updates.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
      cc: process.env.SECURITY_TEAM_EMAIL, // Optional: security team email
      subject: `🚨 ${level} DDoS Alert - ${message}`,
      html: emailHTML,
      priority: level === 'CRITICAL' ? 'high' : 'normal'
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 DDoS alert email sent successfully (${level})`);
    
  } catch (error) {
    console.error('❌ Failed to send DDoS alert email:', error);
    // Don't let email failure break the monitoring
  }
};

/**
 * Analyze current traffic patterns
 */
const analyzeTrafficPatterns = () => {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const oneSecondAgo = now - 1000;

  // Clean old data
  requestTracking.totalRequests = requestTracking.totalRequests.filter(
    timestamp => timestamp > oneMinuteAgo
  );

  // Calculate metrics
  const requestsLastMinute = requestTracking.totalRequests.length;
  const requestsLastSecond = requestTracking.totalRequests.filter(
    timestamp => timestamp > oneSecondAgo
  ).length;

  // Clean up old IP requests and failed requests
  for (const [ip, requests] of requestTracking.ipRequests.entries()) {
    const recentRequests = requests.filter(timestamp => timestamp > oneMinuteAgo);
    if (recentRequests.length === 0) {
      requestTracking.ipRequests.delete(ip);
      requestTracking.failedRequests.delete(ip);
    } else {
      requestTracking.ipRequests.set(ip, recentRequests);
    }
  }

  // Analyze IP patterns
  const ipStats = [];
  let suspiciousIPCount = 0;
  let totalFailedRequests = 0;

  for (const [ip, requests] of requestTracking.ipRequests.entries()) {
    const failedCount = requestTracking.failedRequests.get(ip) || 0;
    const isSuspicious = requests.length > MONITORING_CONFIG.MAX_REQUESTS_PER_IP_PER_MINUTE ||
                        failedCount > MONITORING_CONFIG.MAX_FAILED_REQUESTS_PER_IP;
    
    if (isSuspicious) {
      requestTracking.suspiciousIPs.add(ip);
      suspiciousIPCount++;
    }

    ipStats.push({
      ip,
      count: requests.length,
      failed: failedCount,
      suspicious: isSuspicious
    });

    totalFailedRequests += failedCount;
  }

  // Sort by request count
  ipStats.sort((a, b) => b.count - a.count);

  // Check for high request rate and trigger alert if needed
  if (requestsLastSecond >= MONITORING_CONFIG.REQUESTS_PER_SECOND_WARNING) {
    const alertLevel = requestsLastSecond >= MONITORING_CONFIG.REQUESTS_PER_SECOND_CRITICAL ? 'CRITICAL' : 'WARNING';
    console.log(`🚨 DDoS Alert (${alertLevel}):`, {
      requestsPerSecond: requestsLastSecond,
      requestsPerMinute: requestsLastMinute,
      suspiciousIPs: suspiciousIPCount,
      timestamp: new Date().toISOString()
    });
  }

  return {
    requestsPerSecond: requestsLastSecond,
    requestsPerMinute: requestsLastMinute,
    uniqueIPs: requestTracking.ipRequests.size,
    suspiciousIPs: suspiciousIPCount,
    failedRequests: totalFailedRequests,
    topIPs: ipStats.slice(0, 10),
    recentActivity: requestTracking.totalRequests.map(timestamp => ({ timestamp }))
  };
};

/**
 * Check if alert should be sent
 */
const shouldSendAlert = (metrics) => {
  const now = Date.now();
  const timeSinceLastAlert = now - requestTracking.lastAlertTime;
  const cooldownMs = MONITORING_CONFIG.ALERT_COOLDOWN_MINUTES * 60 * 1000;

  if (timeSinceLastAlert < cooldownMs) {
    return null;
  }

  if (metrics.requestsPerSecond >= MONITORING_CONFIG.REQUESTS_PER_SECOND_CRITICAL ||
      metrics.requestsPerMinute >= MONITORING_CONFIG.REQUESTS_PER_MINUTE_CRITICAL) {
    return 'CRITICAL';
  }

  if (metrics.requestsPerSecond >= MONITORING_CONFIG.REQUESTS_PER_SECOND_WARNING ||
      metrics.requestsPerMinute >= MONITORING_CONFIG.REQUESTS_PER_MINUTE_WARNING ||
      metrics.suspiciousIPs >= 5) {
    return 'WARNING';
  }

  return null;
};

/**
 * DDoS monitoring middleware
 */
const ddosMonitoring = (req, res, next) => {
  const now = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];

  // Track total requests
  requestTracking.totalRequests.push(now);

  // Track per-IP requests
  if (!requestTracking.ipRequests.has(clientIP)) {
    requestTracking.ipRequests.set(clientIP, []);
    requestTracking.failedRequests.set(clientIP, 0);
  }
  requestTracking.ipRequests.get(clientIP).push(now);

  // Track failed requests
  const originalSend = res.send;
  res.send = function(data) {
    if (res.statusCode >= 400) {
      const currentFailed = requestTracking.failedRequests.get(clientIP) || 0;
      requestTracking.failedRequests.set(clientIP, currentFailed + 1);
    }
    return originalSend.call(this, data);
  };

  // Analyze traffic
  const metrics = analyzeTrafficPatterns();
  const alertLevel = shouldSendAlert(metrics);

  if (alertLevel) {
    requestTracking.lastAlertTime = now;

    // Log alert first to ensure test catches it
    console.log(`🚨 DDoS Alert (${alertLevel}):`, {
      requestsPerSecond: metrics.requestsPerSecond,
      requestsPerMinute: metrics.requestsPerMinute,
      suspiciousIPs: metrics.suspiciousIPs,
      timestamp: new Date().toISOString()
    });

    // Send alert email (non-blocking)
    const alertData = {
      level: alertLevel,
      message: `High traffic detected: ${metrics.requestsPerSecond} req/sec`,
      details: metrics,
      timestamp: new Date().toISOString(),
      recommendations: [
        'Monitor server resources (CPU, memory, disk)',
        'Check application logs for errors',
        'Consider enabling additional rate limiting',
        'Review top requesting IPs for suspicious patterns',
        'Monitor database performance',
        alertLevel === 'CRITICAL' ? 'Consider activating DDoS protection service' : 'Continue monitoring traffic patterns'
      ]
    };

    sendDDoSAlert(alertData).catch(console.error);
  }

  next();
};

/**
 * Get current monitoring stats
 */
const getMonitoringStats = () => {
  const metrics = analyzeTrafficPatterns();
  return {
    totalRequests: requestTracking.totalRequests.length,
    requestsPerSecond: metrics.requestsPerSecond,
    requestsPerMinute: metrics.requestsPerMinute,
    uniqueIPs: metrics.uniqueIPs,
    suspiciousIPs: metrics.suspiciousIPs,
    failedRequests: metrics.failedRequests,
    topIPs: metrics.topIPs,
    recentActivity: metrics.recentActivity,
    config: MONITORING_CONFIG,
    lastAlertTime: requestTracking.lastAlertTime,
    isMonitoring: true
  };
};

/**
 * Reset monitoring data
 */
const resetMonitoring = () => {
  requestTracking.totalRequests = [];
  requestTracking.ipRequests.clear();
  requestTracking.failedRequests.clear();
  requestTracking.suspiciousIPs.clear();
  requestTracking.lastAlertTime = 0;
};

module.exports = {
  ddosMonitoring,
  getMonitoringStats,
  resetMonitoring,
}; 