/**
 * Enhanced Error Handler - Comprehensive error handling and classification
 */

import { log } from 'crawlee';
import { Actor } from 'apify';
import { CONFIG } from './config.js';

export class ErrorHandler {
    constructor() {
        this.errorStats = {
            total: 0,
            byType: new Map(),
            byStatusCode: new Map(),
            consecutive: 0,
            lastError: null,
            startTime: Date.now(),
        };
        
        this.failedRequests = [];
        this.errorThresholds = CONFIG.ERROR_HANDLING;
    }

    /**
     * Handle and classify errors
     * @param {Error} error - Error to handle
     * @param {object} context - Error context
     * @returns {object} Error classification and handling result
     */
    async handleError(error, context = {}) {
        const classification = this.classifyError(error);
        const errorInfo = {
            ...classification,
            timestamp: new Date().toISOString(),
            context,
            message: error.message || String(error),
            stack: error.stack,
        };

        // Update statistics
        this.updateErrorStats(errorInfo);

        // Log error based on severity
        await this.logError(errorInfo);

        // Save failed request if configured
        if (this.errorThresholds.SAVE_FAILED_REQUESTS) {
            await this.saveFailedRequest(errorInfo);
        }

        // Check if we need to trigger circuit breaker
        const shouldBreak = this.shouldTriggerCircuitBreaker();

        return {
            ...errorInfo,
            shouldRetry: classification.retryable && !shouldBreak,
            shouldBreak,
            recommendation: this.getErrorRecommendation(classification),
        };
    }

    /**
     * Classify error type and severity
     * @param {Error} error - Error to classify
     * @returns {object} Error classification
     */
    classifyError(error) {
        const message = error.message?.toLowerCase() || '';
        const statusCode = error.statusCode || error.response?.statusCode;
        const code = error.code;

        // Network errors
        if (this.isNetworkError(error)) {
            return {
                type: 'NETWORK',
                severity: 'HIGH',
                retryable: true,
                category: 'INFRASTRUCTURE',
                description: 'Network connectivity issue',
            };
        }

        // HTTP errors
        if (statusCode) {
            return this.classifyHttpError(statusCode);
        }

        // Parsing errors
        if (this.isParsingError(error)) {
            return {
                type: 'PARSING',
                severity: 'MEDIUM',
                retryable: false,
                category: 'DATA',
                description: 'Content parsing failed',
            };
        }

        // Timeout errors
        if (this.isTimeoutError(error)) {
            return {
                type: 'TIMEOUT',
                severity: 'MEDIUM',
                retryable: true,
                category: 'INFRASTRUCTURE',
                description: 'Request timeout',
            };
        }

        // Rate limiting
        if (this.isRateLimitError(error)) {
            return {
                type: 'RATE_LIMIT',
                severity: 'HIGH',
                retryable: true,
                category: 'INFRASTRUCTURE',
                description: 'Rate limit exceeded',
            };
        }

        // Authentication/Authorization
        if (this.isAuthError(error)) {
            return {
                type: 'AUTH',
                severity: 'CRITICAL',
                retryable: false,
                category: 'SECURITY',
                description: 'Authentication/authorization failed',
            };
        }

        // Content errors
        if (this.isContentError(error)) {
            return {
                type: 'CONTENT',
                severity: 'LOW',
                retryable: false,
                category: 'DATA',
                description: 'Content extraction failed',
            };
        }

        // Check for temporary failures
        if (message.includes('temporary') || message.includes('temp')) {
            return {
                type: 'TEMPORARY',
                severity: 'MEDIUM',
                retryable: true,
                category: 'TEMPORARY',
                description: 'Temporary failure',
            };
        }

        // Unknown error
        return {
            type: 'UNKNOWN',
            severity: 'MEDIUM',
            retryable: false,
            category: 'UNKNOWN',
            description: 'Unclassified error',
        };
    }

    /**
     * Classify HTTP errors
     * @param {number} statusCode - HTTP status code
     * @returns {object} HTTP error classification
     */
    classifyHttpError(statusCode) {
        if (statusCode >= 400 && statusCode < 500) {
            // Client errors
            const clientErrorMap = {
                400: { type: 'BAD_REQUEST', retryable: false, severity: 'MEDIUM' },
                401: { type: 'UNAUTHORIZED', retryable: false, severity: 'CRITICAL' },
                403: { type: 'FORBIDDEN', retryable: false, severity: 'HIGH' },
                404: { type: 'NOT_FOUND', retryable: false, severity: 'LOW' },
                408: { type: 'REQUEST_TIMEOUT', retryable: true, severity: 'MEDIUM' },
                429: { type: 'RATE_LIMITED', retryable: true, severity: 'HIGH' },
            };

            const errorInfo = clientErrorMap[statusCode] || {
                type: 'CLIENT_ERROR',
                retryable: false,
                severity: 'MEDIUM',
            };

            return {
                ...errorInfo,
                category: 'HTTP_CLIENT',
                description: `HTTP ${statusCode} client error`,
            };
        }

        if (statusCode >= 500) {
            // Server errors
            return {
                type: 'SERVER_ERROR',
                severity: 'HIGH',
                retryable: true,
                category: 'HTTP_SERVER',
                description: `HTTP ${statusCode} server error`,
            };
        }

        return {
            type: 'HTTP_OTHER',
            severity: 'MEDIUM',
            retryable: false,
            category: 'HTTP',
            description: `HTTP ${statusCode} response`,
        };
    }

    /**
     * Check if error is network-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is network-related
     */
    isNetworkError(error) {
        const networkCodes = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ENETUNREACH'];
        const networkMessages = ['network', 'connection', 'socket', 'dns'];
        
        return networkCodes.includes(error.code) ||
               networkMessages.some(msg => error.message?.toLowerCase().includes(msg));
    }

    /**
     * Check if error is parsing-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is parsing-related
     */
    isParsingError(error) {
        const parsingMessages = ['parse', 'json', 'xml', 'html', 'syntax'];
        return parsingMessages.some(msg => error.message?.toLowerCase().includes(msg));
    }

    /**
     * Check if error is timeout-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is timeout-related
     */
    isTimeoutError(error) {
        return error.code === 'ETIMEDOUT' ||
               error.message?.toLowerCase().includes('timeout');
    }

    /**
     * Check if error is rate limit-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is rate limit-related
     */
    isRateLimitError(error) {
        const rateLimitMessages = ['rate limit', 'too many requests', 'quota exceeded'];
        return rateLimitMessages.some(msg => error.message?.toLowerCase().includes(msg)) ||
               error.statusCode === 429;
    }

    /**
     * Check if error is authentication-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is auth-related
     */
    isAuthError(error) {
        return [401, 403].includes(error.statusCode) ||
               ['unauthorized', 'forbidden', 'access denied'].some(msg => 
                   error.message?.toLowerCase().includes(msg));
    }

    /**
     * Check if error is content-related
     * @param {Error} error - Error to check
     * @returns {boolean} Whether error is content-related
     */
    isContentError(error) {
        const contentMessages = ['content', 'extraction', 'empty', 'no data'];
        return contentMessages.some(msg => error.message?.toLowerCase().includes(msg));
    }

    /**
     * Update error statistics
     * @param {object} errorInfo - Error information
     */
    updateErrorStats(errorInfo) {
        this.errorStats.total++;
        this.errorStats.lastError = errorInfo;
        
        // Update by type
        const typeCount = this.errorStats.byType.get(errorInfo.type) || 0;
        this.errorStats.byType.set(errorInfo.type, typeCount + 1);
        
        // Update by status code if available
        if (errorInfo.context.statusCode) {
            const statusCount = this.errorStats.byStatusCode.get(errorInfo.context.statusCode) || 0;
            this.errorStats.byStatusCode.set(errorInfo.context.statusCode, statusCount + 1);
        }
        
        // Update consecutive errors
        this.errorStats.consecutive++;
    }

    /**
     * Reset consecutive error count (call on success)
     */
    resetConsecutiveErrors() {
        this.errorStats.consecutive = 0;
    }

    /**
     * Check if circuit breaker should be triggered
     * @returns {boolean} Whether to trigger circuit breaker
     */
    shouldTriggerCircuitBreaker() {
        const { MAX_CONSECUTIVE_FAILURES, FAILURE_RATE_THRESHOLD } = this.errorThresholds;
        
        // Check consecutive failures
        if (this.errorStats.consecutive >= MAX_CONSECUTIVE_FAILURES) {
            return true;
        }
        
        // Check failure rate over time window
        const timeWindow = 5 * 60 * 1000; // 5 minutes
        const recentErrors = this.failedRequests.filter(
            req => Date.now() - new Date(req.timestamp).getTime() < timeWindow
        );
        
        if (recentErrors.length > 10) {
            const failureRate = recentErrors.length / (recentErrors.length + 10); // Assume some successes
            return failureRate > FAILURE_RATE_THRESHOLD;
        }
        
        return false;
    }

    /**
     * Get error handling recommendation
     * @param {object} classification - Error classification
     * @returns {string} Recommendation
     */
    getErrorRecommendation(classification) {
        switch (classification.type) {
            case 'NETWORK':
                return 'Check network connectivity and proxy configuration';
            case 'RATE_LIMIT':
                return 'Reduce request rate and implement longer delays';
            case 'AUTH':
                return 'Check authentication credentials and permissions';
            case 'PARSING':
                return 'Verify content format and parsing logic';
            case 'TIMEOUT':
                return 'Increase timeout values or optimize requests';
            case 'SERVER_ERROR':
                return 'Wait and retry, server may be temporarily unavailable';
            default:
                return 'Review error details and adjust scraping strategy';
        }
    }

    /**
     * Log error based on severity
     * @param {object} errorInfo - Error information
     */
    async logError(errorInfo) {
        if (!this.errorThresholds.LOG_ERRORS) return;
        
        const logMessage = `${errorInfo.type} error: ${errorInfo.message}`;
        const logContext = {
            type: errorInfo.type,
            severity: errorInfo.severity,
            category: errorInfo.category,
            retryable: errorInfo.retryable,
            context: errorInfo.context,
        };
        
        switch (errorInfo.severity) {
            case 'CRITICAL':
                log.error(logMessage, logContext);
                break;
            case 'HIGH':
                log.error(logMessage, logContext);
                break;
            case 'MEDIUM':
                log.warning(logMessage, logContext);
                break;
            case 'LOW':
                log.info(logMessage, logContext);
                break;
            default:
                log.debug(logMessage, logContext);
        }
    }

    /**
     * Save failed request for analysis
     * @param {object} errorInfo - Error information
     */
    async saveFailedRequest(errorInfo) {
        const failedRequest = {
            ...errorInfo,
            id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };
        
        this.failedRequests.push(failedRequest);
        
        // Keep only recent failed requests (last 1000)
        if (this.failedRequests.length > 1000) {
            this.failedRequests = this.failedRequests.slice(-1000);
        }
        
        // Save to Apify storage
        try {
            await Actor.setValue('FAILED_REQUESTS', this.failedRequests);
        } catch (error) {
            log.debug('Failed to save failed requests to storage:', error.message);
        }
    }

    /**
     * Get error statistics
     * @returns {object} Error statistics
     */
    getStats() {
        const runtime = Date.now() - this.errorStats.startTime;
        
        return {
            total: this.errorStats.total,
            consecutive: this.errorStats.consecutive,
            byType: Object.fromEntries(this.errorStats.byType),
            byStatusCode: Object.fromEntries(this.errorStats.byStatusCode),
            lastError: this.errorStats.lastError,
            runtime: runtime,
            errorRate: runtime > 0 ? (this.errorStats.total / (runtime / 1000)).toFixed(2) + '/sec' : '0/sec',
            failedRequestsCount: this.failedRequests.length,
        };
    }

    /**
     * Get failed requests
     * @returns {Array} Failed requests
     */
    getFailedRequests() {
        return [...this.failedRequests];
    }

    /**
     * Clear error statistics and failed requests
     */
    reset() {
        this.errorStats = {
            total: 0,
            byType: new Map(),
            byStatusCode: new Map(),
            consecutive: 0,
            lastError: null,
            startTime: Date.now(),
        };
        this.failedRequests = [];
    }
}
