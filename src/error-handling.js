/**
 * Unified Error Handling System
 * Combines error classification, recovery, and integration in a streamlined system
 */

import { log } from 'crawlee';
import { Actor } from 'apify';
import { CONFIG } from './config.js';
import { RetryManager } from './retry-manager.js';
import { circuitBreakerManager } from './circuit-breaker.js';
import { monitoring } from './monitoring.js';

/**
 * Unified Error Handler class with classification, recovery, and integration
 */
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
        this.retryManager = new RetryManager();
        
        // Recovery strategies
        this.recoveryStrategies = new Map();
        this.recoveryAttempts = new Map();
        this.recoveryInProgress = false;
        
        this.initializeRecoveryStrategies();
    }

    /**
     * Initialize recovery strategies
     */
    initializeRecoveryStrategies() {
        // Network error recovery
        this.recoveryStrategies.set('NETWORK', {
            name: 'network-recovery',
            canRecover: (error) => this.isNetworkError(error),
            recover: async (error, context) => {
                log.info('Attempting network recovery');
                
                // Wait for network to stabilize
                await this.sleep(1000 * Math.pow(2, context.attempt || 0));
                
                // Try with different proxy or session
                if (context.session) {
                    context.session.markBad();
                }
                
                return await context.retryOperation(context);
            },
        });

        // Rate limit recovery
        this.recoveryStrategies.set('RATE_LIMIT', {
            name: 'rate-limit-recovery',
            canRecover: (error) => error.statusCode === 429,
            recover: async (error, context) => {
                log.info('Attempting rate limit recovery');
                
                // Extract retry-after header if available
                const retryAfter = error.response?.headers['retry-after'];
                const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default 1 minute
                
                log.info(`Waiting ${delay}ms for rate limit recovery`);
                await this.sleep(delay);
                
                return await context.retryOperation(context);
            },
        });

        // Content extraction recovery
        this.recoveryStrategies.set('CONTENT_EXTRACTION', {
            name: 'content-extraction-recovery',
            canRecover: (error) => error.message?.includes('extraction') || error.message?.includes('content'),
            recover: async (error, context) => {
                log.info('Attempting content extraction recovery');
                
                // Try with browser mode if not already using it
                if (!context.useBrowser) {
                    log.info('Switching to browser mode for recovery');
                    context.useBrowser = true;
                    return await context.retryOperation(context);
                }
                
                // Use RSS content as fallback
                if (context.userData) {
                    return this.createFallbackContent(context.userData);
                }
                
                throw new Error('Content extraction recovery failed');
            },
        });
    }

    /**
     * Handle and classify errors with integrated recovery
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

        return errorInfo;
    }

    /**
     * Execute operation with comprehensive error handling
     * @param {string} operationName - Name of the operation
     * @param {Function} operation - Operation to execute
     * @param {object} options - Configuration options
     * @returns {Promise<any>} Operation result
     */
    async executeWithErrorHandling(operationName, operation, options = {}) {
        const {
            context = {},
            retryOptions = {},
            enableRecovery = true,
        } = options;

        const startTime = Date.now();
        let lastError;

        try {
            // Execute with retry logic
            return await this.retryManager.executeWithRetry(
                async (attempt) => {
                    try {
                        const result = await operation();
                        
                        // Reset consecutive errors on success
                        this.resetConsecutiveErrors();
                        
                        // Record success
                        this.recordSuccess(operationName, startTime, context);
                        
                        return result;
                        
                    } catch (error) {
                        lastError = error;
                        
                        // Handle and classify error
                        const errorInfo = await this.handleError(error, {
                            operation: operationName,
                            attempt: attempt + 1,
                            ...context,
                        });

                        // Record failure
                        this.recordFailure(operationName, startTime, error, context);

                        // Try recovery on final attempt
                        if (attempt >= (retryOptions.maxRetries || this.retryManager.maxRetries) - 1 && enableRecovery) {
                            try {
                                const recoveryResult = await this.attemptRecovery(error, {
                                    operation: operationName,
                                    retryOperation: operation,
                                    attempt,
                                    ...context,
                                });
                                
                                log.info(`Recovery successful for ${operationName}`);
                                return recoveryResult;
                                
                            } catch (recoveryError) {
                                log.warning(`Recovery failed for ${operationName}:`, recoveryError.message);
                            }
                        }

                        throw error;
                    }
                },
                retryOptions
            );

        } catch (error) {
            // Check if circuit breaker should be triggered
            if (this.shouldTriggerCircuitBreaker()) {
                log.error(`Circuit breaker triggered for ${operationName}`);
                circuitBreakerManager.openCircuit(operationName);
            }

            throw lastError || error;
        }
    }

    /**
     * Attempt recovery for an error
     * @param {Error} error - Error to recover from
     * @param {object} context - Recovery context
     * @returns {Promise<any>} Recovery result
     */
    async attemptRecovery(error, context) {
        const recoveryKey = `${context.operation}-${error.message}`;
        const attempts = this.recoveryAttempts.get(recoveryKey) || 0;

        if (attempts >= 3) { // Max recovery attempts
            throw new Error('Maximum recovery attempts exceeded');
        }

        this.recoveryInProgress = true;
        this.recoveryAttempts.set(recoveryKey, attempts + 1);

        try {
            // Find applicable recovery strategy
            const strategy = this.findRecoveryStrategy(error, context);
            
            if (!strategy) {
                log.warning('No recovery strategy found for error:', error.message);
                throw error;
            }

            log.info(`Attempting recovery with strategy: ${strategy.name}`);
            
            // Wait before recovery attempt
            if (attempts > 0) {
                const delay = 1000 * Math.pow(2, attempts);
                await this.sleep(delay);
            }

            const result = await strategy.recover(error, context);
            
            // Recovery successful
            log.info(`Recovery successful with strategy: ${strategy.name}`);
            this.recoveryAttempts.delete(recoveryKey);
            
            return result;

        } catch (recoveryError) {
            log.error(`Recovery failed with strategy: ${recoveryError.message}`);
            throw recoveryError;
        } finally {
            this.recoveryInProgress = false;
        }
    }

    /**
     * Find applicable recovery strategy for an error
     * @param {Error} error - Error to find strategy for
     * @param {object} context - Error context
     * @returns {object|null} Recovery strategy or null
     */
    findRecoveryStrategy(error, context) {
        for (const [type, strategy] of this.recoveryStrategies) {
            if (strategy.canRecover(error, context)) {
                return strategy;
            }
        }
        return null;
    }

    /**
     * Classify error type and severity
     * @param {Error} error - Error to classify
     * @returns {object} Error classification
     */
    classifyError(error) {
        const message = error.message?.toLowerCase() || '';
        const statusCode = error.statusCode || error.response?.statusCode;

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

        // Content extraction errors
        if (message.includes('extraction') || message.includes('content')) {
            return {
                type: 'CONTENT_EXTRACTION',
                severity: 'MEDIUM',
                retryable: true,
                category: 'DATA',
                description: 'Content extraction failed',
            };
        }

        // Default classification
        return {
            type: 'UNKNOWN',
            severity: 'MEDIUM',
            retryable: true,
            category: 'GENERAL',
            description: 'Unknown error type',
        };
    }

    /**
     * Classify HTTP errors by status code
     * @param {number} statusCode - HTTP status code
     * @returns {object} Error classification
     */
    classifyHttpError(statusCode) {
        if (statusCode >= 400 && statusCode < 500) {
            // Client errors
            if (statusCode === 429) {
                return {
                    type: 'RATE_LIMIT',
                    severity: 'HIGH',
                    retryable: true,
                    category: 'RATE_LIMITING',
                    description: 'Rate limit exceeded',
                };
            } else if (statusCode === 403) {
                return {
                    type: 'FORBIDDEN',
                    severity: 'HIGH',
                    retryable: false,
                    category: 'ACCESS',
                    description: 'Access forbidden',
                };
            } else {
                return {
                    type: 'CLIENT_ERROR',
                    severity: 'MEDIUM',
                    retryable: false,
                    category: 'CLIENT',
                    description: `Client error: ${statusCode}`,
                };
            }
        } else if (statusCode >= 500) {
            // Server errors
            return {
                type: 'SERVER_ERROR',
                severity: 'HIGH',
                retryable: true,
                category: 'SERVER',
                description: `Server error: ${statusCode}`,
            };
        }

        return {
            type: 'HTTP_ERROR',
            severity: 'MEDIUM',
            retryable: true,
            category: 'HTTP',
            description: `HTTP error: ${statusCode}`,
        };
    }

    /**
     * Check if error is a network error
     * @param {Error} error - Error to check
     * @returns {boolean} True if network error
     */
    isNetworkError(error) {
        const networkCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
        return networkCodes.includes(error.code) ||
               error.message?.includes('network') ||
               error.message?.includes('timeout') ||
               error.message?.includes('connection');
    }

    /**
     * Check if error is a parsing error
     * @param {Error} error - Error to check
     * @returns {boolean} True if parsing error
     */
    isParsingError(error) {
        return error.message?.includes('parse') ||
               error.message?.includes('JSON') ||
               error.message?.includes('XML') ||
               error.message?.includes('HTML');
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
     * Log error based on severity
     * @param {object} errorInfo - Error information
     */
    async logError(errorInfo) {
        const logMessage = `${errorInfo.type}: ${errorInfo.message}`;

        switch (errorInfo.severity) {
            case 'CRITICAL':
                log.error(logMessage, errorInfo);
                break;
            case 'HIGH':
                log.error(logMessage);
                break;
            case 'MEDIUM':
                log.warning(logMessage);
                break;
            case 'LOW':
                log.info(logMessage);
                break;
            default:
                log.debug(logMessage);
        }
    }

    /**
     * Save failed request information
     * @param {object} errorInfo - Error information
     */
    async saveFailedRequest(errorInfo) {
        this.failedRequests.push(errorInfo);

        // Keep only recent failed requests to prevent memory issues
        const maxFailedRequests = 1000;
        if (this.failedRequests.length > maxFailedRequests) {
            this.failedRequests = this.failedRequests.slice(-maxFailedRequests);
        }

        // Save to Actor storage if available
        try {
            await Actor.setValue('FAILED_REQUESTS', this.failedRequests.slice(-100)); // Keep last 100
        } catch (error) {
            log.debug('Failed to save failed requests:', error.message);
        }
    }

    /**
     * Record successful operation
     * @param {string} operationName - Operation name
     * @param {number} startTime - Start time
     * @param {object} context - Operation context
     */
    recordSuccess(operationName, startTime, context) {
        const responseTime = Date.now() - startTime;

        monitoring.recordRequest({
            success: true,
            responseTime,
            url: context.url,
            operation: operationName,
        });
    }

    /**
     * Record failed operation
     * @param {string} operationName - Operation name
     * @param {number} startTime - Start time
     * @param {Error} error - Error that occurred
     * @param {object} context - Operation context
     */
    recordFailure(operationName, startTime, error, context) {
        const responseTime = Date.now() - startTime;

        monitoring.recordRequest({
            success: false,
            responseTime,
            url: context.url,
            error,
            statusCode: error.statusCode,
            operation: operationName,
        });
    }

    /**
     * Create fallback content from RSS data
     * @param {object} userData - RSS user data
     * @returns {object} Fallback content
     */
    createFallbackContent(userData) {
        return {
            title: userData.title || '',
            text: userData.description || '',
            author: '',
            date: userData.pubDate || '',
            description: userData.description || '',
            images: [],
            tags: [],
            lang: 'unknown',
            success: !!(userData.title || userData.description),
            extractionMethod: 'rss-fallback'
        };
    }

    /**
     * Sleep utility function
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Sleep promise
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get error statistics
     * @returns {object} Error statistics
     */
    getStats() {
        return {
            ...this.errorStats,
            failedRequestsCount: this.failedRequests.length,
            recoveryAttempts: this.recoveryAttempts.size,
            recoveryInProgress: this.recoveryInProgress,
        };
    }

    /**
     * Get health status
     * @returns {object} Health status
     */
    getHealthStatus() {
        const stats = this.getStats();
        let status = 'HEALTHY';

        if (stats.consecutive > 10) {
            status = 'CRITICAL';
        } else if (stats.consecutive > 5) {
            status = 'DEGRADED';
        } else if (stats.total > 100) {
            status = 'WARNING';
        }

        return {
            overall: { status },
            errorRate: stats.total,
            consecutiveErrors: stats.consecutive,
            lastError: stats.lastError?.timestamp || null,
        };
    }

    /**
     * Reset error handler state
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
        this.recoveryAttempts.clear();
        this.recoveryInProgress = false;
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.reset();
    }
}

// Create singleton instance for global use
export const errorHandling = new ErrorHandler();
