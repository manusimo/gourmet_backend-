import { performance } from 'perf_hooks';

// Performance tracking
const performanceMetrics = {
  requests: [],
  slowQueries: [],
  memoryUsage: [],
  errorRates: new Map(),
  endpoints: new Map(),
};

/**
 * Performance monitoring middleware
 */
export const performanceMonitoring = (req, res, next) => {
  const startTime = performance.now();
  const startMemory = process.memoryUsage();
  
  // Track original methods
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Override response methods to capture metrics
  res.send = function(data) {
    captureMetrics(req, res, startTime, startMemory);
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    captureMetrics(req, res, startTime, startMemory);
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Capture performance metrics
 */
const captureMetrics = (req, res, startTime, startMemory) => {
  const endTime = performance.now();
  const responseTime = endTime - startTime;
  const endMemory = process.memoryUsage();
  
  const metrics = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime: Math.round(responseTime),
    memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  };
  
  // Store metrics
  performanceMetrics.requests.push(metrics);
  
  // Track endpoint performance
  const endpoint = `${req.method} ${req.route?.path || req.originalUrl}`;
  if (!performanceMetrics.endpoints.has(endpoint)) {
    performanceMetrics.endpoints.set(endpoint, {
      count: 0,
      totalTime: 0,
      avgTime: 0,
      slowest: 0,
      fastest: Infinity,
      errors: 0
    });
  }
  
  const endpointStats = performanceMetrics.endpoints.get(endpoint);
  endpointStats.count++;
  endpointStats.totalTime += responseTime;
  endpointStats.avgTime = endpointStats.totalTime / endpointStats.count;
  endpointStats.slowest = Math.max(endpointStats.slowest, responseTime);
  endpointStats.fastest = Math.min(endpointStats.fastest, responseTime);
  
  if (res.statusCode >= 400) {
    endpointStats.errors++;
  }
  
  // Track slow requests
  if (responseTime > 1000) { // Slower than 1 second
    performanceMetrics.slowQueries.push({
      ...metrics,
      type: 'slow_request'
    });
    
    console.warn(`🐌 Slow request detected: ${endpoint} took ${Math.round(responseTime)}ms`);
  }
  
  // Track memory spikes
  if (metrics.memoryUsed > 50 * 1024 * 1024) { // More than 50MB
    console.warn(`🧠 High memory usage: ${endpoint} used ${Math.round(metrics.memoryUsed / 1024 / 1024)}MB`);
  }
  
  // Clean old data (keep last 1000 requests)
  if (performanceMetrics.requests.length > 1000) {
    performanceMetrics.requests = performanceMetrics.requests.slice(-1000);
  }
  
  if (performanceMetrics.slowQueries.length > 100) {
    performanceMetrics.slowQueries = performanceMetrics.slowQueries.slice(-100);
  }
};

/**
 * Get performance statistics
 */
export const getPerformanceStats = () => {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;
  
  const recentRequests = performanceMetrics.requests.filter(
    req => new Date(req.timestamp).getTime() > fiveMinutesAgo
  );
  
  const hourlyRequests = performanceMetrics.requests.filter(
    req => new Date(req.timestamp).getTime() > oneHourAgo
  );
  
  // Calculate statistics
  const avgResponseTime = recentRequests.length > 0 
    ? recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / recentRequests.length
    : 0;
  
  const errorRate = recentRequests.length > 0
    ? (recentRequests.filter(req => req.statusCode >= 400).length / recentRequests.length) * 100
    : 0;
  
  // Top slowest endpoints
  const sortedEndpoints = Array.from(performanceMetrics.endpoints.entries())
    .map(([endpoint, stats]) => ({ endpoint, ...stats }))
    .sort((a, b) => b.avgTime - a.avgTime)
    .slice(0, 5);
  
  return {
    overview: {
      requestsLast5Min: recentRequests.length,
      requestsLastHour: hourlyRequests.length,
      avgResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
      slowRequestsCount: performanceMetrics.slowQueries.length,
      currentMemory: process.memoryUsage(),
      uptime: process.uptime()
    },
    slowestEndpoints: sortedEndpoints,
    recentSlowQueries: performanceMetrics.slowQueries.slice(-10),
    memoryTrend: getMemoryTrend(),
    responseTimes: getResponseTimeTrend(recentRequests)
  };
};

/**
 * Get memory usage trend
 */
const getMemoryTrend = () => {
  const memory = process.memoryUsage();
  performanceMetrics.memoryUsage.push({
    timestamp: new Date().toISOString(),
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external,
    rss: memory.rss
  });
  
  // Keep last 60 data points (for trending)
  if (performanceMetrics.memoryUsage.length > 60) {
    performanceMetrics.memoryUsage = performanceMetrics.memoryUsage.slice(-60);
  }
  
  return performanceMetrics.memoryUsage;
};

/**
 * Get response time distribution
 */
const getResponseTimeTrend = (requests) => {
  const buckets = {
    fast: 0,    // < 100ms
    medium: 0,  // 100-500ms
    slow: 0,    // 500-1000ms
    verySlow: 0 // > 1000ms
  };
  
  requests.forEach(req => {
    if (req.responseTime < 100) buckets.fast++;
    else if (req.responseTime < 500) buckets.medium++;
    else if (req.responseTime < 1000) buckets.slow++;
    else buckets.verySlow++;
  });
  
  return buckets;
};

/**
 * Health check for performance monitoring
 */
export const getHealthStatus = () => {
  const stats = getPerformanceStats();
  const memory = process.memoryUsage();
  
  // Determine health status
  let status = 'healthy';
  let issues = [];
  
  if (stats.overview.avgResponseTime > 1000) {
    status = 'warning';
    issues.push('Average response time is high');
  }
  
  if (stats.overview.errorRate > 5) {
    status = 'warning';
    issues.push('Error rate is elevated');
  }
  
  if (memory.heapUsed / memory.heapTotal > 0.9) {
    status = 'critical';
    issues.push('Memory usage is critical');
  }
  
  if (stats.overview.slowRequestsCount > 10) {
    status = status === 'critical' ? 'critical' : 'warning';
    issues.push('Multiple slow requests detected');
  }
  
  return {
    status,
    issues,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(memory.heapUsed / 1024 / 1024),
      total: Math.round(memory.heapTotal / 1024 / 1024),
      percentage: Math.round((memory.heapUsed / memory.heapTotal) * 100)
    }
  };
};

export default performanceMonitoring; 