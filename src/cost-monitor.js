/**
 * Cost Monitor - Track and alert on resource usage and costs
 */

import { Actor } from 'apify';
import { log } from 'crawlee';
import { CONFIG } from './config.js';

/**
 * Cost Monitor class for tracking resource usage and costs
 */
export class CostMonitor {
    constructor() {
        this.startTime = Date.now();
        this.stats = {
            // Request counts
            totalRequests: 0,
            browserRequests: 0,
            httpRequests: 0,
            
            // Proxy usage
            datacenterProxyRequests: 0,
            residentialProxyRequests: 0,
            
            // Content extraction
            optimizedExtractions: 0,
            fullExtractions: 0,
            
            // Image processing
            imagesValidatedByPattern: 0,
            imagesValidatedByHttp: 0,
            
            // Processing stats
            articlesProcessed: 0,
            articlesSkipped: 0,
            
            // Resource usage
            memoryUsageMB: 0,
            executionTimeMs: 0,
            
            // Cost estimates (in USD)
            estimatedCost: 0,
            potentialSavings: 0
        };
        
        // Cost multipliers (approximate Apify pricing)
        this.costMultipliers = {
            browserRequest: 0.002,      // Browser requests are expensive
            httpRequest: 0.0001,        // HTTP requests are cheap
            residentialProxy: 0.001,    // Residential proxies cost more
            datacenterProxy: 0.0002,    // Datacenter proxies are cheaper
            imageValidation: 0.0001,    // HTTP image validation
            memoryMB: 0.0001,          // Memory usage per MB
            executionSecond: 0.0001     // Execution time per second
        };
        
        this.alertThreshold = CONFIG.COST_OPTIMIZATION?.COST_ALERT_THRESHOLD || 0.50;
        this.hasAlerted = false;
    }

    /**
     * Track a browser request
     */
    trackBrowserRequest() {
        this.stats.totalRequests++;
        this.stats.browserRequests++;
        this.updateCostEstimate();
    }

    /**
     * Track an HTTP request
     */
    trackHttpRequest() {
        this.stats.totalRequests++;
        this.stats.httpRequests++;
        this.updateCostEstimate();
    }

    /**
     * Track proxy usage
     * @param {string} proxyType - 'datacenter' or 'residential'
     */
    trackProxyUsage(proxyType) {
        if (proxyType === 'residential') {
            this.stats.residentialProxyRequests++;
        } else {
            this.stats.datacenterProxyRequests++;
        }
        this.updateCostEstimate();
    }

    /**
     * Track content extraction
     * @param {string} extractionType - 'optimized' or 'full'
     */
    trackContentExtraction(extractionType) {
        if (extractionType === 'optimized') {
            this.stats.optimizedExtractions++;
        } else {
            this.stats.fullExtractions++;
        }
    }

    /**
     * Track image validation
     * @param {string} validationType - 'pattern' or 'http'
     */
    trackImageValidation(validationType) {
        if (validationType === 'pattern') {
            this.stats.imagesValidatedByPattern++;
        } else {
            this.stats.imagesValidatedByHttp++;
        }
        this.updateCostEstimate();
    }

    /**
     * Track article processing
     * @param {boolean} processed - True if processed, false if skipped
     */
    trackArticleProcessing(processed) {
        if (processed) {
            this.stats.articlesProcessed++;
        } else {
            this.stats.articlesSkipped++;
        }
    }

    /**
     * Update memory usage
     */
    updateMemoryUsage() {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const memUsage = process.memoryUsage();
            this.stats.memoryUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        }
        this.updateCostEstimate();
    }

    /**
     * Update cost estimate based on current usage
     */
    updateCostEstimate() {
        const costs = this.costMultipliers;
        
        this.stats.executionTimeMs = Date.now() - this.startTime;
        const executionSeconds = this.stats.executionTimeMs / 1000;
        
        // Calculate estimated cost
        this.stats.estimatedCost = 
            (this.stats.browserRequests * costs.browserRequest) +
            (this.stats.httpRequests * costs.httpRequest) +
            (this.stats.residentialProxyRequests * costs.residentialProxy) +
            (this.stats.datacenterProxyRequests * costs.datacenterProxy) +
            (this.stats.imagesValidatedByHttp * costs.imageValidation) +
            (this.stats.memoryUsageMB * costs.memoryMB) +
            (executionSeconds * costs.executionSecond);
        
        // Calculate potential savings from optimizations
        const potentialBrowserRequests = this.stats.httpRequests; // Could have been browser requests
        const potentialResidentialRequests = this.stats.datacenterProxyRequests; // Could have been residential
        const potentialHttpValidations = this.stats.imagesValidatedByPattern; // Could have been HTTP validations
        
        this.stats.potentialSavings = 
            (potentialBrowserRequests * (costs.browserRequest - costs.httpRequest)) +
            (potentialResidentialRequests * (costs.residentialProxy - costs.datacenterProxy)) +
            (potentialHttpValidations * costs.imageValidation);
        
        // Check if we should alert
        this.checkCostAlert();
    }

    /**
     * Check if cost alert should be triggered
     */
    checkCostAlert() {
        if (!this.hasAlerted && this.stats.estimatedCost >= this.alertThreshold) {
            this.hasAlerted = true;
            log.warning(`💰 COST ALERT: Estimated cost has reached $${this.stats.estimatedCost.toFixed(3)}`);
            log.info(`💡 Consider enabling lightweight mode to reduce costs`);
        }
    }

    /**
     * Get current cost statistics
     * @returns {object} Cost statistics
     */
    getCostStats() {
        this.updateMemoryUsage();
        this.updateCostEstimate();
        
        return {
            ...this.stats,
            executionTimeSeconds: Math.round(this.stats.executionTimeMs / 1000),
            costPerArticle: this.stats.articlesProcessed > 0 
                ? (this.stats.estimatedCost / this.stats.articlesProcessed).toFixed(4)
                : 0,
            optimizationPercentage: this.stats.totalRequests > 0
                ? ((this.stats.httpRequests / this.stats.totalRequests) * 100).toFixed(1)
                : 0,
            savingsPercentage: this.stats.estimatedCost > 0
                ? ((this.stats.potentialSavings / (this.stats.estimatedCost + this.stats.potentialSavings)) * 100).toFixed(1)
                : 0
        };
    }

    /**
     * Generate cost report
     * @returns {object} Detailed cost report
     */
    generateCostReport() {
        const stats = this.getCostStats();
        
        return {
            summary: {
                totalCost: `$${stats.estimatedCost.toFixed(3)}`,
                potentialSavings: `$${stats.potentialSavings.toFixed(3)}`,
                costPerArticle: `$${stats.costPerArticle}`,
                executionTime: `${stats.executionTimeSeconds}s`,
                memoryUsage: `${stats.memoryUsageMB}MB`
            },
            breakdown: {
                requests: {
                    total: stats.totalRequests,
                    browser: stats.browserRequests,
                    http: stats.httpRequests,
                    optimizationRate: `${stats.optimizationPercentage}%`
                },
                proxies: {
                    datacenter: stats.datacenterProxyRequests,
                    residential: stats.residentialProxyRequests
                },
                images: {
                    patternValidated: stats.imagesValidatedByPattern,
                    httpValidated: stats.imagesValidatedByHttp
                },
                articles: {
                    processed: stats.articlesProcessed,
                    skipped: stats.articlesSkipped
                }
            },
            optimizations: {
                savingsPercentage: `${stats.savingsPercentage}%`,
                recommendations: this.getOptimizationRecommendations(stats)
            }
        };
    }

    /**
     * Get optimization recommendations based on usage patterns
     * @param {object} stats - Current statistics
     * @returns {Array} Array of recommendations
     */
    getOptimizationRecommendations(stats) {
        const recommendations = [];
        
        if (stats.browserRequests > stats.httpRequests) {
            recommendations.push('Consider disabling browser mode for better cost efficiency');
        }
        
        if (stats.residentialProxyRequests > stats.datacenterProxyRequests) {
            recommendations.push('Enable datacenter proxy preference to reduce proxy costs');
        }
        
        if (stats.imagesValidatedByHttp > 0) {
            recommendations.push('Enable pattern-based image validation to skip HTTP requests');
        }
        
        if (stats.fullExtractions > stats.optimizedExtractions) {
            recommendations.push('Enable single extraction strategy for faster processing');
        }
        
        if (stats.estimatedCost > 0.10) {
            recommendations.push('Consider using lightweight mode for maximum cost savings');
        }
        
        return recommendations;
    }

    /**
     * Save cost report to Actor storage
     */
    async saveCostReport() {
        try {
            const report = this.generateCostReport();
            await Actor.setValue('COST_REPORT', report);
            log.info('💰 Cost report saved to Actor storage');
        } catch (error) {
            log.error('Failed to save cost report:', error.message);
        }
    }

    /**
     * Log cost summary
     */
    logCostSummary() {
        const stats = this.getCostStats();
        
        log.info('💰 Cost Summary:', {
            estimatedCost: `$${stats.estimatedCost.toFixed(3)}`,
            potentialSavings: `$${stats.potentialSavings.toFixed(3)}`,
            costPerArticle: `$${stats.costPerArticle}`,
            optimizationRate: `${stats.optimizationPercentage}%`,
            articlesProcessed: stats.articlesProcessed
        });
    }
}

// Export singleton instance
export const costMonitor = new CostMonitor();
