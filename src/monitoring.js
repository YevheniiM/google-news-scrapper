/**
 * Monitoring and Metrics Collection System
 */

import { log } from 'crawlee';
import { Actor } from 'apify';
import { CONFIG } from './config.js';

export class MonitoringSystem {
    constructor() {
        this.metrics = {
            // Request metrics
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                retried: 0,
                rateLimit: 0,
                timeout: 0,
            },
            
            // Performance metrics
            performance: {
                avgResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0,
                totalResponseTime: 0,
                requestCount: 0,
            },
            
            // Content metrics
            content: {
                articlesProcessed: 0,
                articlesExtracted: 0,
                imagesValidated: 0,
                consentPagesDetected: 0,
                emptyContent: 0,
            },
            
            // Error metrics
            errors: {
                byType: new Map(),
                byStatusCode: new Map(),
                byDomain: new Map(),
                consecutive: 0,
                lastError: null,
            },
            
            // Resource metrics
            resources: {
                memoryUsage: 0,
                cpuUsage: 0,
                activeConnections: 0,
                queueSize: 0,
            },
        };
        
        this.startTime = Date.now();
        this.lastReportTime = Date.now();
        this.healthChecks = new Map();
        this.alerts = [];
        
        // Start monitoring intervals
        this.startMonitoring();
    }

    /**
     * Start monitoring intervals
     */
    startMonitoring() {
        // Performance monitoring
        setInterval(() => {
            this.collectSystemMetrics();
        }, 30000); // Every 30 seconds

        // Health checks
        setInterval(() => {
            this.runHealthChecks();
        }, 60000); // Every minute

        // Periodic reporting
        setInterval(() => {
            this.generateReport();
        }, CONFIG.LOGGING.STATISTICS_INTERVAL * 1000);
    }

    /**
     * Record request metrics
     * @param {object} requestInfo - Request information
     */
    recordRequest(requestInfo) {
        const { success, responseTime, error, statusCode, url, retried } = requestInfo;
        
        this.metrics.requests.total++;
        
        if (success) {
            this.metrics.requests.successful++;
            this.metrics.errors.consecutive = 0;
        } else {
            this.metrics.requests.failed++;
            this.metrics.errors.consecutive++;
            
            if (error) {
                this.recordError(error, { statusCode, url });
            }
        }
        
        if (retried) {
            this.metrics.requests.retried++;
        }
        
        if (statusCode === 429) {
            this.metrics.requests.rateLimit++;
        }
        
        if (error && error.message?.includes('timeout')) {
            this.metrics.requests.timeout++;
        }
        
        // Record performance metrics
        if (responseTime) {
            this.updatePerformanceMetrics(responseTime);
        }
    }

    /**
     * Update performance metrics
     * @param {number} responseTime - Response time in milliseconds
     */
    updatePerformanceMetrics(responseTime) {
        const perf = this.metrics.performance;
        
        perf.totalResponseTime += responseTime;
        perf.requestCount++;
        perf.avgResponseTime = perf.totalResponseTime / perf.requestCount;
        perf.minResponseTime = Math.min(perf.minResponseTime, responseTime);
        perf.maxResponseTime = Math.max(perf.maxResponseTime, responseTime);
    }

    /**
     * Record error metrics
     * @param {Error} error - Error to record
     * @param {object} context - Error context
     */
    recordError(error, context = {}) {
        const errorType = this.classifyError(error);
        const domain = this.extractDomain(context.url);
        
        // Update error counts
        this.incrementMapValue(this.metrics.errors.byType, errorType);
        
        if (context.statusCode) {
            this.incrementMapValue(this.metrics.errors.byStatusCode, context.statusCode);
        }
        
        if (domain) {
            this.incrementMapValue(this.metrics.errors.byDomain, domain);
        }
        
        this.metrics.errors.lastError = {
            type: errorType,
            message: error.message,
            timestamp: new Date().toISOString(),
            context,
        };
    }

    /**
     * Record content metrics
     * @param {object} contentInfo - Content information
     */
    recordContent(contentInfo) {
        const { 
            articlesProcessed = 0,
            articlesExtracted = 0,
            imagesValidated = 0,
            consentPagesDetected = 0,
            emptyContent = 0,
        } = contentInfo;
        
        this.metrics.content.articlesProcessed += articlesProcessed;
        this.metrics.content.articlesExtracted += articlesExtracted;
        this.metrics.content.imagesValidated += imagesValidated;
        this.metrics.content.consentPagesDetected += consentPagesDetected;
        this.metrics.content.emptyContent += emptyContent;
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        
        this.metrics.resources.memoryUsage = {
            rss: Math.round(memUsage.rss / 1024 / 1024), // MB
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024), // MB
        };
        
        // CPU usage would require additional libraries, keeping simple for now
        this.metrics.resources.cpuUsage = process.cpuUsage();
    }

    /**
     * Run health checks
     */
    async runHealthChecks() {
        const healthResults = {};
        
        // Memory health check
        const memUsage = this.metrics.resources.memoryUsage;
        healthResults.memory = {
            healthy: memUsage.heapUsed < 500, // Less than 500MB
            value: memUsage.heapUsed,
            threshold: 500,
        };
        
        // Error rate health check
        const errorRate = this.getErrorRate();
        healthResults.errorRate = {
            healthy: errorRate < 0.1, // Less than 10% error rate
            value: errorRate,
            threshold: 0.1,
        };
        
        // Response time health check
        const avgResponseTime = this.metrics.performance.avgResponseTime;
        healthResults.responseTime = {
            healthy: avgResponseTime < 5000, // Less than 5 seconds
            value: avgResponseTime,
            threshold: 5000,
        };
        
        // Consecutive errors health check
        const consecutiveErrors = this.metrics.errors.consecutive;
        healthResults.consecutiveErrors = {
            healthy: consecutiveErrors < 5,
            value: consecutiveErrors,
            threshold: 5,
        };
        
        // Store health check results
        this.healthChecks.set(Date.now(), healthResults);
        
        // Keep only recent health checks (last 100)
        if (this.healthChecks.size > 100) {
            const oldestKey = Math.min(...this.healthChecks.keys());
            this.healthChecks.delete(oldestKey);
        }
        
        // Generate alerts for unhealthy conditions
        this.checkForAlerts(healthResults);
    }

    /**
     * Check for alert conditions
     * @param {object} healthResults - Health check results
     */
    checkForAlerts(healthResults) {
        for (const [check, result] of Object.entries(healthResults)) {
            if (!result.healthy) {
                const alert = {
                    type: 'HEALTH_CHECK_FAILED',
                    check,
                    value: result.value,
                    threshold: result.threshold,
                    timestamp: new Date().toISOString(),
                    severity: this.getAlertSeverity(check, result),
                };
                
                this.addAlert(alert);
            }
        }
    }

    /**
     * Add alert
     * @param {object} alert - Alert to add
     */
    addAlert(alert) {
        this.alerts.push(alert);
        
        // Keep only recent alerts (last 50)
        if (this.alerts.length > 50) {
            this.alerts = this.alerts.slice(-50);
        }
        
        // Log alert based on severity
        const message = `Alert: ${alert.type} - ${alert.check} (${alert.value} > ${alert.threshold})`;
        
        switch (alert.severity) {
            case 'CRITICAL':
                log.error(message, alert);
                break;
            case 'HIGH':
                log.warning(message, alert);
                break;
            default:
                log.info(message, alert);
        }
    }

    /**
     * Get alert severity
     * @param {string} check - Health check name
     * @param {object} result - Health check result
     * @returns {string} Alert severity
     */
    getAlertSeverity(check, result) {
        switch (check) {
            case 'memory':
                return result.value > 1000 ? 'CRITICAL' : 'HIGH';
            case 'errorRate':
                return result.value > 0.5 ? 'CRITICAL' : 'HIGH';
            case 'consecutiveErrors':
                return result.value > 10 ? 'CRITICAL' : 'MEDIUM';
            default:
                return 'MEDIUM';
        }
    }

    /**
     * Generate monitoring report
     */
    async generateReport() {
        const now = Date.now();
        const runtime = now - this.startTime;
        const timeSinceLastReport = now - this.lastReportTime;
        
        const report = {
            timestamp: new Date().toISOString(),
            runtime: this.formatDuration(runtime),
            timeSinceLastReport: this.formatDuration(timeSinceLastReport),
            metrics: this.getMetricsSummary(),
            health: this.getHealthSummary(),
            alerts: this.getRecentAlerts(),
        };
        
        log.info('Monitoring Report', report);
        
        // Save report to Apify storage
        try {
            await Actor.setValue('MONITORING_REPORT', report);
        } catch (error) {
            log.debug('Failed to save monitoring report:', error.message);
        }
        
        this.lastReportTime = now;
    }

    /**
     * Get metrics summary
     * @returns {object} Metrics summary
     */
    getMetricsSummary() {
        return {
            requests: {
                ...this.metrics.requests,
                successRate: this.getSuccessRate(),
                errorRate: this.getErrorRate(),
            },
            performance: {
                ...this.metrics.performance,
                avgResponseTime: Math.round(this.metrics.performance.avgResponseTime),
            },
            content: { ...this.metrics.content },
            errors: {
                byType: Object.fromEntries(this.metrics.errors.byType),
                byStatusCode: Object.fromEntries(this.metrics.errors.byStatusCode),
                byDomain: Object.fromEntries(this.metrics.errors.byDomain),
                consecutive: this.metrics.errors.consecutive,
                lastError: this.metrics.errors.lastError,
            },
            resources: { ...this.metrics.resources },
        };
    }

    /**
     * Get health summary
     * @returns {object} Health summary
     */
    getHealthSummary() {
        if (this.healthChecks.size === 0) {
            return { status: 'UNKNOWN', checks: {} };
        }
        
        const latestHealthCheck = this.healthChecks.get(Math.max(...this.healthChecks.keys()));
        const allHealthy = Object.values(latestHealthCheck).every(check => check.healthy);
        
        return {
            status: allHealthy ? 'HEALTHY' : 'UNHEALTHY',
            checks: latestHealthCheck,
        };
    }

    /**
     * Get recent alerts
     * @returns {Array} Recent alerts
     */
    getRecentAlerts() {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        return this.alerts.filter(alert => 
            new Date(alert.timestamp).getTime() > oneHourAgo
        );
    }

    /**
     * Get success rate
     * @returns {number} Success rate (0-1)
     */
    getSuccessRate() {
        const total = this.metrics.requests.total;
        return total > 0 ? this.metrics.requests.successful / total : 0;
    }

    /**
     * Get error rate
     * @returns {number} Error rate (0-1)
     */
    getErrorRate() {
        const total = this.metrics.requests.total;
        return total > 0 ? this.metrics.requests.failed / total : 0;
    }

    /**
     * Classify error type
     * @param {Error} error - Error to classify
     * @returns {string} Error type
     */
    classifyError(error) {
        const message = error.message?.toLowerCase() || '';
        
        if (message.includes('timeout')) return 'TIMEOUT';
        if (message.includes('network') || message.includes('connection')) return 'NETWORK';
        if (message.includes('rate limit') || message.includes('too many')) return 'RATE_LIMIT';
        if (message.includes('parse') || message.includes('json')) return 'PARSING';
        if (error.statusCode >= 500) return 'SERVER_ERROR';
        if (error.statusCode >= 400) return 'CLIENT_ERROR';
        
        return 'UNKNOWN';
    }

    /**
     * Extract domain from URL
     * @param {string} url - URL to extract domain from
     * @returns {string|null} Domain or null
     */
    extractDomain(url) {
        if (!url) return null;
        
        try {
            return new URL(url).hostname;
        } catch {
            return null;
        }
    }

    /**
     * Increment map value
     * @param {Map} map - Map to increment
     * @param {any} key - Key to increment
     */
    incrementMapValue(map, key) {
        const current = map.get(key) || 0;
        map.set(key, current + 1);
    }

    /**
     * Format duration in human-readable format
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics = {
            requests: { total: 0, successful: 0, failed: 0, retried: 0, rateLimit: 0, timeout: 0 },
            performance: { avgResponseTime: 0, minResponseTime: Infinity, maxResponseTime: 0, totalResponseTime: 0, requestCount: 0 },
            content: { articlesProcessed: 0, articlesExtracted: 0, imagesValidated: 0, consentPagesDetected: 0, emptyContent: 0 },
            errors: { byType: new Map(), byStatusCode: new Map(), byDomain: new Map(), consecutive: 0, lastError: null },
            resources: { memoryUsage: 0, cpuUsage: 0, activeConnections: 0, queueSize: 0 },
        };
        
        this.startTime = Date.now();
        this.lastReportTime = Date.now();
        this.healthChecks.clear();
        this.alerts = [];
    }
}

// Global monitoring instance
export const monitoring = new MonitoringSystem();
