/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures and provides fallback mechanisms
 */

import { log } from 'crawlee';
import { CONFIG } from './config.js';

export class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.options = {
            failureThreshold: options.failureThreshold || CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD,
            successThreshold: options.successThreshold || CONFIG.CIRCUIT_BREAKER.SUCCESS_THRESHOLD,
            timeout: options.timeout || CONFIG.CIRCUIT_BREAKER.TIMEOUT,
            monitorWindow: options.monitorWindow || CONFIG.CIRCUIT_BREAKER.MONITOR_WINDOW,
            ...options,
        };

        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = 0;
        this.stats = {
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            stateChanges: [],
            lastFailure: null,
            lastSuccess: null,
        };

        // Sliding window for monitoring
        this.requestHistory = [];
    }

    /**
     * Execute operation through circuit breaker
     * @param {Function} operation - Async operation to execute
     * @param {object} fallback - Fallback options
     * @returns {Promise<any>} Operation result
     */
    async execute(operation, fallback = {}) {
        this.stats.totalRequests++;
        this.cleanupHistory();

        // Check circuit breaker state
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                log.warning(`Circuit breaker ${this.name} is OPEN, using fallback`);
                return this.executeFallback(fallback);
            } else {
                // Try to transition to HALF_OPEN
                this.transitionTo('HALF_OPEN');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            
            // If circuit is now open, use fallback
            if (this.state === 'OPEN') {
                return this.executeFallback(fallback);
            }
            
            throw error;
        }
    }

    /**
     * Handle successful operation
     */
    onSuccess() {
        this.stats.totalSuccesses++;
        this.stats.lastSuccess = new Date().toISOString();
        this.recordRequest(true);

        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.options.successThreshold) {
                this.transitionTo('CLOSED');
            }
        } else if (this.state === 'CLOSED') {
            this.failureCount = 0;
        }
    }

    /**
     * Handle failed operation
     * @param {Error} error - Error that occurred
     */
    onFailure(error) {
        this.stats.totalFailures++;
        this.stats.lastFailure = {
            timestamp: new Date().toISOString(),
            error: error.message,
        };
        this.recordRequest(false);

        if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') {
            this.failureCount++;
            
            if (this.failureCount >= this.options.failureThreshold) {
                this.transitionTo('OPEN');
            }
        }
    }

    /**
     * Transition circuit breaker to new state
     * @param {string} newState - New state (CLOSED, OPEN, HALF_OPEN)
     */
    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        
        const stateChange = {
            from: oldState,
            to: newState,
            timestamp: new Date().toISOString(),
            failureCount: this.failureCount,
            successCount: this.successCount,
        };
        
        this.stats.stateChanges.push(stateChange);
        
        log.info(`Circuit breaker ${this.name} transitioned from ${oldState} to ${newState}`, stateChange);

        switch (newState) {
            case 'OPEN':
                this.nextAttempt = Date.now() + this.options.timeout;
                this.successCount = 0;
                break;
            case 'HALF_OPEN':
                this.successCount = 0;
                this.failureCount = 0;
                break;
            case 'CLOSED':
                this.failureCount = 0;
                this.successCount = 0;
                break;
        }
    }

    /**
     * Record request in sliding window
     * @param {boolean} success - Whether request was successful
     */
    recordRequest(success) {
        const now = Date.now();
        this.requestHistory.push({
            timestamp: now,
            success,
        });
    }

    /**
     * Clean up old entries from request history
     */
    cleanupHistory() {
        const cutoff = Date.now() - this.options.monitorWindow;
        this.requestHistory = this.requestHistory.filter(
            entry => entry.timestamp > cutoff
        );
    }

    /**
     * Execute fallback strategy
     * @param {object} fallback - Fallback options
     * @returns {any} Fallback result
     */
    async executeFallback(fallback) {
        if (fallback.operation) {
            try {
                return await fallback.operation();
            } catch (error) {
                log.warning(`Fallback operation failed for ${this.name}:`, error.message);
            }
        }

        if (fallback.value !== undefined) {
            return fallback.value;
        }

        if (fallback.throwError !== false) {
            throw new Error(`Circuit breaker ${this.name} is OPEN and no fallback provided`);
        }

        return null;
    }

    /**
     * Get current failure rate
     * @returns {number} Failure rate (0-1)
     */
    getFailureRate() {
        if (this.requestHistory.length === 0) return 0;
        
        const failures = this.requestHistory.filter(entry => !entry.success).length;
        return failures / this.requestHistory.length;
    }

    /**
     * Get circuit breaker statistics
     * @returns {object} Statistics
     */
    getStats() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            nextAttempt: this.nextAttempt,
            failureRate: this.getFailureRate(),
            recentRequests: this.requestHistory.length,
            ...this.stats,
            stateChanges: [...this.stats.stateChanges], // Copy array
        };
    }

    /**
     * Force circuit breaker to specific state
     * @param {string} state - State to force (CLOSED, OPEN, HALF_OPEN)
     */
    forceState(state) {
        log.info(`Forcing circuit breaker ${this.name} to state ${state}`);
        this.transitionTo(state);
    }

    /**
     * Reset circuit breaker to initial state
     */
    reset() {
        log.info(`Resetting circuit breaker ${this.name}`);
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = 0;
        this.requestHistory = [];
        this.stats = {
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            stateChanges: [],
            lastFailure: null,
            lastSuccess: null,
        };
    }

    /**
     * Check if circuit breaker is healthy
     * @returns {boolean} Whether circuit breaker is healthy
     */
    isHealthy() {
        return this.state === 'CLOSED' && this.getFailureRate() < 0.5;
    }
}

/**
 * Circuit Breaker Manager - Manages multiple circuit breakers
 */
export class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
    }

    /**
     * Get or create circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {object} options - Circuit breaker options
     * @returns {CircuitBreaker} Circuit breaker instance
     */
    getBreaker(name, options = {}) {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker(name, options));
        }
        return this.breakers.get(name);
    }

    /**
     * Execute operation through named circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {Function} operation - Operation to execute
     * @param {object} options - Options including fallback
     * @returns {Promise<any>} Operation result
     */
    async execute(name, operation, options = {}) {
        const breaker = this.getBreaker(name, options.breakerOptions);
        return breaker.execute(operation, options.fallback);
    }

    /**
     * Get all circuit breaker statistics
     * @returns {object} All statistics
     */
    getAllStats() {
        const stats = {};
        for (const [name, breaker] of this.breakers) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }

    /**
     * Get health status of all circuit breakers
     * @returns {object} Health status
     */
    getHealthStatus() {
        const health = {
            healthy: 0,
            unhealthy: 0,
            total: this.breakers.size,
            details: {},
        };

        for (const [name, breaker] of this.breakers) {
            const isHealthy = breaker.isHealthy();
            health.details[name] = {
                healthy: isHealthy,
                state: breaker.state,
                failureRate: breaker.getFailureRate(),
            };

            if (isHealthy) {
                health.healthy++;
            } else {
                health.unhealthy++;
            }
        }

        return health;
    }

    /**
     * Reset all circuit breakers
     */
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }

    /**
     * Remove circuit breaker
     * @param {string} name - Circuit breaker name
     */
    removeBreaker(name) {
        this.breakers.delete(name);
    }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();
