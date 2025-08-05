/**
 * Graceful Degradation System
 * Handles partial failures and provides fallback strategies
 */

import { log } from 'crawlee';
import { CONFIG } from './config.js';

export class GracefulDegradationManager {
    constructor() {
        this.fallbackStrategies = new Map();
        this.degradationLevels = new Map();
        this.currentDegradationLevel = 0;
        this.partialResults = new Map();
        this.failureThresholds = {
            rss: 0.3, // 30% RSS failure rate triggers degradation
            content: 0.5, // 50% content extraction failure rate
            images: 0.7, // 70% image validation failure rate
        };
    }

    /**
     * Register fallback strategy
     * @param {string} operation - Operation name
     * @param {Array} strategies - Array of fallback strategies
     */
    registerFallbackStrategy(operation, strategies) {
        this.fallbackStrategies.set(operation, strategies);
    }

    /**
     * Execute operation with graceful degradation
     * @param {string} operation - Operation name
     * @param {Function} primaryOperation - Primary operation function
     * @param {object} context - Operation context
     * @returns {Promise<any>} Operation result
     */
    async executeWithDegradation(operation, primaryOperation, context = {}) {
        const strategies = this.fallbackStrategies.get(operation) || [];
        let lastError;

        // Try primary operation first
        try {
            const result = await primaryOperation(context);
            this.recordSuccess(operation);
            return result;
        } catch (error) {
            lastError = error;
            this.recordFailure(operation, error);
            log.warning(`Primary operation ${operation} failed:`, error.message);
        }

        // Try fallback strategies
        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i];
            
            try {
                log.info(`Trying fallback strategy ${i + 1}/${strategies.length} for ${operation}`);
                const result = await strategy.execute(context, lastError);
                
                this.recordPartialSuccess(operation, strategy.name);
                return result;
                
            } catch (error) {
                lastError = error;
                log.warning(`Fallback strategy ${strategy.name} failed:`, error.message);
            }
        }

        // All strategies failed, return partial result if available
        const partialResult = this.getPartialResult(operation, context);
        if (partialResult) {
            log.info(`Returning partial result for ${operation}`);
            return partialResult;
        }

        // Complete failure
        throw lastError;
    }

    /**
     * Record successful operation
     * @param {string} operation - Operation name
     */
    recordSuccess(operation) {
        const stats = this.getOperationStats(operation);
        stats.successes++;
        stats.lastSuccess = Date.now();
        this.updateDegradationLevel(operation);
    }

    /**
     * Record failed operation
     * @param {string} operation - Operation name
     * @param {Error} error - Error that occurred
     */
    recordFailure(operation, error) {
        const stats = this.getOperationStats(operation);
        stats.failures++;
        stats.lastFailure = Date.now();
        stats.lastError = error.message;
        this.updateDegradationLevel(operation);
    }

    /**
     * Record partial success
     * @param {string} operation - Operation name
     * @param {string} strategy - Strategy that succeeded
     */
    recordPartialSuccess(operation, strategy) {
        const stats = this.getOperationStats(operation);
        stats.partialSuccesses++;
        stats.lastPartialSuccess = Date.now();
        stats.lastSuccessfulStrategy = strategy;
    }

    /**
     * Get operation statistics
     * @param {string} operation - Operation name
     * @returns {object} Operation statistics
     */
    getOperationStats(operation) {
        if (!this.degradationLevels.has(operation)) {
            this.degradationLevels.set(operation, {
                successes: 0,
                failures: 0,
                partialSuccesses: 0,
                lastSuccess: null,
                lastFailure: null,
                lastPartialSuccess: null,
                lastError: null,
                lastSuccessfulStrategy: null,
                degradationLevel: 0,
            });
        }
        return this.degradationLevels.get(operation);
    }

    /**
     * Update degradation level based on failure rate
     * @param {string} operation - Operation name
     */
    updateDegradationLevel(operation) {
        const stats = this.getOperationStats(operation);
        const total = stats.successes + stats.failures;
        
        if (total < 10) return; // Need minimum sample size
        
        const failureRate = stats.failures / total;
        const threshold = this.failureThresholds[operation] || 0.5;
        
        let newLevel = 0;
        if (failureRate > threshold * 2) {
            newLevel = 3; // Severe degradation
        } else if (failureRate > threshold * 1.5) {
            newLevel = 2; // Moderate degradation
        } else if (failureRate > threshold) {
            newLevel = 1; // Light degradation
        }
        
        if (newLevel !== stats.degradationLevel) {
            log.info(`Degradation level for ${operation} changed from ${stats.degradationLevel} to ${newLevel} (failure rate: ${(failureRate * 100).toFixed(1)}%)`);
            stats.degradationLevel = newLevel;
        }
    }

    /**
     * Store partial result for later use
     * @param {string} operation - Operation name
     * @param {string} key - Result key
     * @param {any} result - Partial result
     */
    storePartialResult(operation, key, result) {
        if (!this.partialResults.has(operation)) {
            this.partialResults.set(operation, new Map());
        }
        
        this.partialResults.get(operation).set(key, {
            result,
            timestamp: Date.now(),
        });
    }

    /**
     * Get partial result
     * @param {string} operation - Operation name
     * @param {object} context - Operation context
     * @returns {any} Partial result or null
     */
    getPartialResult(operation, context) {
        const operationResults = this.partialResults.get(operation);
        if (!operationResults) return null;
        
        // Try to find relevant partial result
        const key = this.generatePartialResultKey(context);
        const partialData = operationResults.get(key);
        
        if (partialData) {
            // Check if result is still fresh (within 1 hour)
            const age = Date.now() - partialData.timestamp;
            if (age < 60 * 60 * 1000) {
                return partialData.result;
            }
        }
        
        return null;
    }

    /**
     * Generate key for partial result storage
     * @param {object} context - Operation context
     * @returns {string} Partial result key
     */
    generatePartialResultKey(context) {
        // Create a simple key based on context
        const keyParts = [];
        
        if (context.query) keyParts.push(`q:${context.query}`);
        if (context.region) keyParts.push(`r:${context.region}`);
        if (context.url) {
            try {
                const domain = new URL(context.url).hostname;
                keyParts.push(`d:${domain}`);
            } catch {
                // Ignore invalid URLs
            }
        }
        
        return keyParts.join('|') || 'default';
    }

    /**
     * Create RSS fallback strategies
     * @returns {Array} RSS fallback strategies
     */
    createRssFallbackStrategies() {
        return [
            {
                name: 'reduced_items',
                execute: async (context, error) => {
                    // Try with fewer items
                    const reducedContext = { ...context, maxItems: Math.min(context.maxItems || 100, 20) };
                    log.info('Trying RSS fetch with reduced item count');
                    return await this.executeReducedRssFetch(reducedContext);
                },
            },
            {
                name: 'alternative_endpoint',
                execute: async (context, error) => {
                    // Try alternative RSS endpoint or format
                    log.info('Trying alternative RSS endpoint');
                    return await this.executeAlternativeRssFetch(context);
                },
            },
            {
                name: 'cached_results',
                execute: async (context, error) => {
                    // Return cached results if available
                    log.info('Returning cached RSS results');
                    return await this.getCachedRssResults(context);
                },
            },
        ];
    }

    /**
     * Create content extraction fallback strategies
     * @returns {Array} Content extraction fallback strategies
     */
    createContentFallbackStrategies() {
        return [
            {
                name: 'simplified_extraction',
                execute: async (context, error) => {
                    // Use simplified extraction with basic selectors
                    log.info('Trying simplified content extraction');
                    return await this.executeSimplifiedExtraction(context);
                },
            },
            {
                name: 'metadata_only',
                execute: async (context, error) => {
                    // Extract only metadata (title, description, etc.)
                    log.info('Extracting metadata only');
                    return await this.extractMetadataOnly(context);
                },
            },
            {
                name: 'rss_content',
                execute: async (context, error) => {
                    // Use content from RSS feed
                    log.info('Using RSS content as fallback');
                    return await this.useRssContent(context);
                },
            },
        ];
    }

    /**
     * Create image validation fallback strategies
     * @returns {Array} Image validation fallback strategies
     */
    createImageFallbackStrategies() {
        return [
            {
                name: 'skip_validation',
                execute: async (context, error) => {
                    // Skip validation and return all images
                    log.info('Skipping image validation');
                    return context.images || [];
                },
            },
            {
                name: 'basic_validation',
                execute: async (context, error) => {
                    // Basic URL format validation only
                    log.info('Using basic image validation');
                    return await this.basicImageValidation(context.images || []);
                },
            },
        ];
    }

    /**
     * Execute reduced RSS fetch
     * @param {object} context - Reduced context
     * @returns {Promise<Array>} RSS items
     */
    async executeReducedRssFetch(context) {
        // Implementation would depend on RSS fetcher
        // This is a placeholder for the actual implementation
        return [];
    }

    /**
     * Execute alternative RSS fetch
     * @param {object} context - Context
     * @returns {Promise<Array>} RSS items
     */
    async executeAlternativeRssFetch(context) {
        // Try different RSS parameters or endpoints
        return [];
    }

    /**
     * Get cached RSS results
     * @param {object} context - Context
     * @returns {Promise<Array>} Cached RSS items
     */
    async getCachedRssResults(context) {
        const key = this.generatePartialResultKey(context);
        const cached = this.getPartialResult('rss', context);
        return cached || [];
    }

    /**
     * Execute simplified content extraction
     * @param {object} context - Context
     * @returns {Promise<object>} Simplified content
     */
    async executeSimplifiedExtraction(context) {
        // Basic content extraction with minimal processing
        return {
            title: context.title || 'No title',
            text: context.description || 'No content',
            success: false,
            fallback: true,
        };
    }

    /**
     * Extract metadata only
     * @param {object} context - Context
     * @returns {Promise<object>} Metadata
     */
    async extractMetadataOnly(context) {
        return {
            title: context.title || 'No title',
            description: context.description || 'No description',
            url: context.url,
            success: false,
            metadataOnly: true,
        };
    }

    /**
     * Use RSS content as fallback
     * @param {object} context - Context
     * @returns {Promise<object>} RSS content
     */
    async useRssContent(context) {
        return {
            title: context.rssTitle || 'No title',
            text: context.rssDescription || 'No content',
            source: context.rssSource || 'Unknown',
            success: false,
            fromRss: true,
        };
    }

    /**
     * Basic image validation
     * @param {Array} images - Images to validate
     * @returns {Promise<Array>} Valid images
     */
    async basicImageValidation(images) {
        return images.filter(img => {
            try {
                new URL(img);
                return img.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            } catch {
                return false;
            }
        });
    }

    /**
     * Initialize default fallback strategies
     */
    initializeDefaultStrategies() {
        this.registerFallbackStrategy('rss', this.createRssFallbackStrategies());
        this.registerFallbackStrategy('content', this.createContentFallbackStrategies());
        this.registerFallbackStrategy('images', this.createImageFallbackStrategies());
    }

    /**
     * Get degradation status
     * @returns {object} Degradation status
     */
    getDegradationStatus() {
        const status = {
            overall: this.currentDegradationLevel,
            operations: {},
            recommendations: [],
        };

        for (const [operation, stats] of this.degradationLevels) {
            status.operations[operation] = {
                level: stats.degradationLevel,
                failureRate: stats.failures / (stats.successes + stats.failures),
                lastError: stats.lastError,
                lastSuccessfulStrategy: stats.lastSuccessfulStrategy,
            };

            // Add recommendations based on degradation level
            if (stats.degradationLevel > 0) {
                status.recommendations.push({
                    operation,
                    level: stats.degradationLevel,
                    recommendation: this.getRecommendation(operation, stats.degradationLevel),
                });
            }
        }

        return status;
    }

    /**
     * Get recommendation for degraded operation
     * @param {string} operation - Operation name
     * @param {number} level - Degradation level
     * @returns {string} Recommendation
     */
    getRecommendation(operation, level) {
        const recommendations = {
            rss: {
                1: 'Consider reducing RSS feed request frequency',
                2: 'Switch to alternative RSS endpoints or reduce item counts',
                3: 'Use cached RSS data and implement manual fallbacks',
            },
            content: {
                1: 'Increase content extraction timeouts',
                2: 'Use simplified extraction methods',
                3: 'Rely on RSS content and metadata only',
            },
            images: {
                1: 'Reduce image validation concurrency',
                2: 'Skip image validation for non-critical images',
                3: 'Disable image validation entirely',
            },
        };

        return recommendations[operation]?.[level] || 'Monitor and adjust strategy as needed';
    }

    /**
     * Reset degradation state
     */
    reset() {
        this.degradationLevels.clear();
        this.partialResults.clear();
        this.currentDegradationLevel = 0;
    }
}

// Global graceful degradation manager
export const gracefulDegradation = new GracefulDegradationManager();

// Initialize default strategies
gracefulDegradation.initializeDefaultStrategies();
