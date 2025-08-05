/**
 * Retry Manager - Handles retry logic with exponential backoff
 */

import { log } from 'crawlee';
import { CONFIG } from './config.js';

export class RetryManager {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || CONFIG.RETRY.MAX_RETRIES;
        this.baseDelay = options.baseDelay || CONFIG.RETRY.BASE_DELAY;
        this.maxDelay = options.maxDelay || CONFIG.RETRY.MAX_DELAY;
        this.backoffMultiplier = options.backoffMultiplier || CONFIG.RETRY.BACKOFF_MULTIPLIER;
        this.jitterFactor = options.jitterFactor || CONFIG.RETRY.JITTER_FACTOR;
        
        // Track retry statistics
        this.stats = {
            totalAttempts: 0,
            totalRetries: 0,
            successAfterRetry: 0,
            permanentFailures: 0,
            retriesByError: new Map(),
        };
    }

    /**
     * Execute operation with retry logic
     * @param {Function} operation - Async operation to retry
     * @param {object} options - Retry options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const {
            context = 'operation',
            retryableErrors = this.getDefaultRetryableErrors(),
            onRetry = null,
            maxRetries = this.maxRetries,
        } = options;

        let lastError;
        let attempt = 0;

        while (attempt <= maxRetries) {
            try {
                this.stats.totalAttempts++;
                
                const result = await operation(attempt);
                
                if (attempt > 0) {
                    this.stats.successAfterRetry++;
                    log.info(`${context} succeeded after ${attempt} retries`);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                attempt++;
                
                // Check if error is retryable
                if (!this.isRetryableError(error, retryableErrors)) {
                    log.error(`${context} failed with non-retryable error:`, error.message);
                    this.stats.permanentFailures++;
                    throw error;
                }
                
                // Check if we've exhausted retries
                if (attempt > maxRetries) {
                    log.error(`${context} failed after ${maxRetries} retries:`, error.message);
                    this.stats.permanentFailures++;
                    break;
                }
                
                // Calculate delay and wait
                const delay = this.calculateDelay(attempt);
                
                this.stats.totalRetries++;
                this.updateErrorStats(error);
                
                log.warning(`${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
                
                // Call retry callback if provided
                if (onRetry) {
                    await onRetry(error, attempt, delay);
                }
                
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }

    /**
     * Calculate delay with exponential backoff and jitter
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateDelay(attempt) {
        // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
        let delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
        
        // Cap at maximum delay
        delay = Math.min(delay, this.maxDelay);
        
        // Add jitter to prevent thundering herd
        const jitter = delay * this.jitterFactor * Math.random();
        delay = delay + jitter;
        
        return Math.round(delay);
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @param {Array} retryableErrors - List of retryable error patterns
     * @returns {boolean} Whether error is retryable
     */
    isRetryableError(error, retryableErrors) {
        if (!error) return false;
        
        const errorMessage = error.message?.toLowerCase() || '';
        const errorCode = error.code;
        const statusCode = error.statusCode || error.response?.statusCode;
        
        return retryableErrors.some(pattern => {
            if (typeof pattern === 'string') {
                return errorMessage.includes(pattern.toLowerCase());
            }
            if (typeof pattern === 'number') {
                return statusCode === pattern;
            }
            if (pattern instanceof RegExp) {
                return pattern.test(errorMessage);
            }
            if (typeof pattern === 'object') {
                return (
                    (pattern.message && errorMessage.includes(pattern.message.toLowerCase())) ||
                    (pattern.code && errorCode === pattern.code) ||
                    (pattern.statusCode && statusCode === pattern.statusCode)
                );
            }
            return false;
        });
    }

    /**
     * Get default retryable error patterns
     * @returns {Array} Default retryable errors
     */
    getDefaultRetryableErrors() {
        return [
            // Network errors
            'timeout',
            'network',
            'connection',
            'socket',
            'dns',
            'econnreset',
            'econnrefused',
            'enotfound',
            'etimedout',
            
            // HTTP status codes
            408, // Request Timeout
            429, // Too Many Requests
            500, // Internal Server Error
            502, // Bad Gateway
            503, // Service Unavailable
            504, // Gateway Timeout
            520, // Unknown Error (Cloudflare)
            521, // Web Server Is Down (Cloudflare)
            522, // Connection Timed Out (Cloudflare)
            523, // Origin Is Unreachable (Cloudflare)
            524, // A Timeout Occurred (Cloudflare)
            
            // Specific error patterns
            /rate limit/i,
            /too many requests/i,
            /service unavailable/i,
            /temporarily unavailable/i,
            /temporary failure/i,
            /temporary error/i,
        ];
    }

    /**
     * Update error statistics
     * @param {Error} error - Error to track
     */
    updateErrorStats(error) {
        const errorKey = this.getErrorKey(error);
        const count = this.stats.retriesByError.get(errorKey) || 0;
        this.stats.retriesByError.set(errorKey, count + 1);
    }

    /**
     * Get error key for statistics
     * @param {Error} error - Error to get key for
     * @returns {string} Error key
     */
    getErrorKey(error) {
        const statusCode = error.statusCode || error.response?.statusCode;
        if (statusCode) {
            return `HTTP_${statusCode}`;
        }
        
        const errorCode = error.code;
        if (errorCode) {
            return `CODE_${errorCode}`;
        }
        
        const message = error.message || 'UNKNOWN';
        return `MSG_${message.substring(0, 50)}`;
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get retry statistics
     * @returns {object} Retry statistics
     */
    getStats() {
        return {
            ...this.stats,
            retriesByError: Object.fromEntries(this.stats.retriesByError),
            successRate: this.stats.totalAttempts > 0 
                ? ((this.stats.totalAttempts - this.stats.permanentFailures) / this.stats.totalAttempts * 100).toFixed(2) + '%'
                : '0%',
            retryRate: this.stats.totalAttempts > 0
                ? (this.stats.totalRetries / this.stats.totalAttempts * 100).toFixed(2) + '%'
                : '0%',
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalAttempts: 0,
            totalRetries: 0,
            successAfterRetry: 0,
            permanentFailures: 0,
            retriesByError: new Map(),
        };
    }

    /**
     * Create a retryable version of a function
     * @param {Function} fn - Function to make retryable
     * @param {object} options - Retry options
     * @returns {Function} Retryable function
     */
    createRetryableFunction(fn, options = {}) {
        return async (...args) => {
            return this.executeWithRetry(
                async (attempt) => fn(...args, { attempt }),
                options
            );
        };
    }
}
