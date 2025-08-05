/**
 * Error Handling Integration
 * Provides a unified interface for all error handling components
 */

import { log } from 'crawlee';
import { RetryManager } from './retry-manager.js';
import { ErrorHandler } from './error-handler.js';
import { circuitBreakerManager } from './circuit-breaker.js';
import { monitoring } from './monitoring.js';
import { gracefulDegradation } from './graceful-degradation.js';
import { errorRecovery } from './error-recovery.js';

export class ErrorHandlingIntegration {
    constructor() {
        this.retryManager = new RetryManager();
        this.errorHandler = new ErrorHandler();
        this.isInitialized = false;
    }

    /**
     * Initialize error handling system
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Load persistent state
            await errorRecovery.loadPersistentState();
            
            // Initialize graceful degradation strategies
            gracefulDegradation.initializeDefaultStrategies();
            
            log.info('Error handling system initialized successfully');
            this.isInitialized = true;
            
        } catch (error) {
            log.error('Failed to initialize error handling system:', error.message);
            throw error;
        }
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
            circuitBreakerOptions = {},
            fallbackOptions = {},
            enableRecovery = true,
            enableDegradation = true,
        } = options;

        const startTime = Date.now();
        let lastError;

        // Create checkpoint before operation
        if (context.state) {
            await errorRecovery.createCheckpoint(operationName, context.state);
        }

        try {
            // Execute with circuit breaker
            return await circuitBreakerManager.execute(
                operationName,
                async () => {
                    // Execute with retry logic
                    return await this.retryManager.executeWithRetry(
                        async (attempt) => {
                            try {
                                const result = await operation({ ...context, attempt });
                                
                                // Record success
                                this.recordSuccess(operationName, startTime, context);
                                this.errorHandler.resetConsecutiveErrors();
                                
                                return result;
                                
                            } catch (error) {
                                lastError = error;
                                
                                // Handle and classify error
                                const errorInfo = await this.errorHandler.handleError(error, {
                                    operation: operationName,
                                    attempt: attempt + 1,
                                    ...context,
                                });

                                // Record failure
                                this.recordFailure(operationName, startTime, error, context);

                                // Try recovery on final attempt
                                if (attempt >= (retryOptions.maxRetries || this.retryManager.maxRetries) - 1 && enableRecovery) {
                                    try {
                                        const recoveryResult = await errorRecovery.attemptRecovery(error, {
                                            operation: operationName,
                                            retryOperation: operation,
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
                        {
                            context: operationName,
                            ...retryOptions,
                        }
                    );
                },
                {
                    breakerOptions: circuitBreakerOptions,
                    fallback: {
                        operation: async () => {
                            if (enableDegradation) {
                                return await gracefulDegradation.executeWithDegradation(
                                    operationName,
                                    () => { throw lastError || new Error('Circuit breaker open'); },
                                    context
                                );
                            }
                            
                            if (fallbackOptions.operation) {
                                return await fallbackOptions.operation();
                            }
                            
                            if (fallbackOptions.value !== undefined) {
                                return fallbackOptions.value;
                            }
                            
                            throw lastError || new Error(`${operationName} failed and no fallback available`);
                        },
                    },
                }
            );

        } catch (error) {
            // Final error handling
            log.error(`Operation ${operationName} failed completely:`, error.message);
            
            // Store failure for analysis
            await this.storeFinalFailure(operationName, error, context);
            
            throw error;
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
     * Store final failure for analysis
     * @param {string} operationName - Operation name
     * @param {Error} error - Final error
     * @param {object} context - Operation context
     */
    async storeFinalFailure(operationName, error, context) {
        try {
            await errorRecovery.storePersistentState(`final_failure_${operationName}`, {
                error: error.message,
                stack: error.stack,
                context,
                timestamp: new Date().toISOString(),
            });
        } catch (storageError) {
            log.debug('Failed to store final failure:', storageError.message);
        }
    }

    /**
     * Get comprehensive health status
     * @returns {object} Health status
     */
    getHealthStatus() {
        return {
            timestamp: new Date().toISOString(),
            overall: this.calculateOverallHealth(),
            components: {
                retry: this.retryManager.getStats(),
                errors: this.errorHandler.getStats(),
                circuitBreakers: circuitBreakerManager.getHealthStatus(),
                monitoring: monitoring.getHealthSummary(),
                degradation: gracefulDegradation.getDegradationStatus(),
                recovery: errorRecovery.getRecoveryStats(),
            },
        };
    }

    /**
     * Calculate overall health score
     * @returns {object} Overall health
     */
    calculateOverallHealth() {
        const monitoringHealth = monitoring.getHealthSummary();
        const circuitBreakerHealth = circuitBreakerManager.getHealthStatus();
        const degradationStatus = gracefulDegradation.getDegradationStatus();
        
        let healthScore = 100;
        const issues = [];
        
        // Check monitoring health
        if (monitoringHealth.status === 'UNHEALTHY') {
            healthScore -= 30;
            issues.push('Monitoring indicates unhealthy state');
        }
        
        // Check circuit breakers
        if (circuitBreakerHealth.unhealthy > 0) {
            healthScore -= (circuitBreakerHealth.unhealthy / circuitBreakerHealth.total) * 40;
            issues.push(`${circuitBreakerHealth.unhealthy} circuit breakers are unhealthy`);
        }
        
        // Check degradation levels
        if (degradationStatus.overall > 0) {
            healthScore -= degradationStatus.overall * 10;
            issues.push(`System degradation level: ${degradationStatus.overall}`);
        }
        
        // Check error rates
        const errorStats = this.errorHandler.getStats();
        if (errorStats.consecutive > 5) {
            healthScore -= 20;
            issues.push(`High consecutive error count: ${errorStats.consecutive}`);
        }
        
        let status = 'HEALTHY';
        if (healthScore < 50) {
            status = 'CRITICAL';
        } else if (healthScore < 70) {
            status = 'UNHEALTHY';
        } else if (healthScore < 90) {
            status = 'DEGRADED';
        }
        
        return {
            status,
            score: Math.max(0, Math.round(healthScore)),
            issues,
        };
    }

    /**
     * Generate comprehensive error report
     * @returns {object} Error report
     */
    async generateErrorReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalErrors: this.errorHandler.getStats().total,
                retryStats: this.retryManager.getStats(),
                healthStatus: this.getHealthStatus(),
            },
            details: {
                errorBreakdown: this.errorHandler.getStats(),
                circuitBreakerStatus: circuitBreakerManager.getAllStats(),
                monitoringMetrics: monitoring.getMetricsSummary(),
                degradationStatus: gracefulDegradation.getDegradationStatus(),
                recoveryStats: errorRecovery.getRecoveryStats(),
            },
            recommendations: this.generateRecommendations(),
        };
        
        return report;
    }

    /**
     * Generate recommendations based on current state
     * @returns {Array} Recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        const healthStatus = this.getHealthStatus();
        
        if (healthStatus.overall.status === 'CRITICAL') {
            recommendations.push({
                priority: 'HIGH',
                category: 'SYSTEM',
                message: 'System is in critical state - consider stopping operations',
                action: 'Review error logs and implement emergency fallbacks',
            });
        }
        
        const errorStats = this.errorHandler.getStats();
        if (errorStats.consecutive > 10) {
            recommendations.push({
                priority: 'HIGH',
                category: 'ERRORS',
                message: 'High consecutive error count detected',
                action: 'Check network connectivity and target service availability',
            });
        }
        
        const circuitBreakerHealth = circuitBreakerManager.getHealthStatus();
        if (circuitBreakerHealth.unhealthy > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'CIRCUIT_BREAKERS',
                message: `${circuitBreakerHealth.unhealthy} circuit breakers are open`,
                action: 'Review failing services and consider alternative approaches',
            });
        }
        
        return recommendations;
    }

    /**
     * Reset all error handling components
     */
    async reset() {
        this.retryManager.resetStats();
        this.errorHandler.reset();
        circuitBreakerManager.resetAll();
        monitoring.reset();
        gracefulDegradation.reset();
        errorRecovery.reset();
        
        log.info('Error handling system reset completed');
    }

    /**
     * Shutdown error handling system gracefully
     */
    async shutdown() {
        try {
            // Generate final report
            const finalReport = await this.generateErrorReport();
            log.info('Final error handling report:', finalReport.summary);
            
            // Backup state
            await errorRecovery.backupState();
            
            log.info('Error handling system shutdown completed');
            
        } catch (error) {
            log.error('Error during shutdown:', error.message);
        }
    }
}

// Global error handling integration instance
export const errorHandling = new ErrorHandlingIntegration();
