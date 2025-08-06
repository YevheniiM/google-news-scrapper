/**
 * Optimized Proxy Manager - COST EFFICIENT VERSION
 * Uses datacenter proxies by default, only escalates to residential when needed
 */

import { log } from 'crawlee';
import { CONFIG } from './config.js';

/**
 * Optimized Proxy Manager class - cost-effective proxy strategy
 */
export class OptimizedProxyManager {
    constructor(proxyConfiguration = null) {
        this.proxyConfiguration = proxyConfiguration;
        this.currentProxy = null;
        this.proxyUsageCount = 0;
        this.proxyErrorCount = 0;
        this.lastRotation = Date.now();
        
        // Track domains that require residential proxies
        this.residentialRequiredDomains = new Set();
        
        // Track successful datacenter proxy usage
        this.datacenterSuccessDomains = new Set();
        
        // Current proxy tier: 'datacenter' or 'residential'
        this.currentTier = 'datacenter';
        
        // Statistics for cost tracking
        this.stats = {
            datacenterRequests: 0,
            residentialRequests: 0,
            totalRequests: 0,
            costSavings: 0 // Estimated cost savings from using datacenter
        };
    }

    /**
     * Get optimized proxy configuration for a request
     * @param {string} targetUrl - Target URL
     * @returns {Promise<object>} Proxy configuration
     */
    async getProxyConfig(targetUrl = '') {
        try {
            this.stats.totalRequests++;
            
            // COST OPTIMIZATION: Check if we can use datacenter proxy
            const shouldUseResidential = this.shouldUseResidentialProxy(targetUrl);
            
            if (!shouldUseResidential && CONFIG.PROXY.RESIDENTIAL_ENABLED === false) {
                // Use datacenter proxy (cheaper)
                return await this.getDatacenterProxyConfig(targetUrl);
            } else if (shouldUseResidential) {
                // Use residential proxy (more expensive but sometimes necessary)
                return await this.getResidentialProxyConfig(targetUrl);
            } else {
                // Try datacenter first, fallback to residential if needed
                const datacenterConfig = await this.getDatacenterProxyConfig(targetUrl);
                if (datacenterConfig.proxyUrl) {
                    return datacenterConfig;
                }
                return await this.getResidentialProxyConfig(targetUrl);
            }
            
        } catch (error) {
            log.error('Failed to get optimized proxy config:', error.message);
            return {};
        }
    }

    /**
     * Get datacenter proxy configuration (cheaper option)
     * @param {string} targetUrl - Target URL
     * @returns {Promise<object>} Datacenter proxy config
     */
    async getDatacenterProxyConfig(targetUrl) {
        try {
            if (!this.proxyConfiguration) {
                return {};
            }

            // Check if we need to rotate proxy
            if (this.shouldRotateProxy()) {
                await this.rotateProxy('datacenter');
            }

            // Get datacenter proxy URL
            if (!this.currentProxy || this.currentTier !== 'datacenter') {
                this.currentProxy = await this.proxyConfiguration.newUrl();
                this.currentTier = 'datacenter';
                log.debug('Obtained datacenter proxy');
            }

            this.proxyUsageCount++;
            this.stats.datacenterRequests++;
            
            // Track successful datacenter usage
            if (targetUrl) {
                const domain = new URL(targetUrl).hostname;
                this.datacenterSuccessDomains.add(domain);
            }

            return {
                proxyUrl: this.currentProxy,
                timeout: {
                    request: CONFIG.PROXY.PROXY_TIMEOUT
                },
                retry: {
                    limit: CONFIG.PROXY.MAX_PROXY_RETRIES,
                    methods: ['GET', 'POST'],
                    statusCodes: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524]
                }
            };

        } catch (error) {
            log.debug('Datacenter proxy failed:', error.message);
            this.proxyErrorCount++;
            
            // Mark domain as potentially needing residential proxy
            if (targetUrl) {
                const domain = new URL(targetUrl).hostname;
                this.residentialRequiredDomains.add(domain);
            }
            
            return {};
        }
    }

    /**
     * Get residential proxy configuration (more expensive option)
     * @param {string} targetUrl - Target URL
     * @returns {Promise<object>} Residential proxy config
     */
    async getResidentialProxyConfig(targetUrl) {
        try {
            if (!this.proxyConfiguration) {
                return {};
            }

            // Check if we need to rotate proxy
            if (this.shouldRotateProxy()) {
                await this.rotateProxy('residential');
            }

            // Get residential proxy URL
            if (!this.currentProxy || this.currentTier !== 'residential') {
                this.currentProxy = await this.proxyConfiguration.newUrl();
                this.currentTier = 'residential';
                log.debug('Obtained residential proxy');
            }

            this.proxyUsageCount++;
            this.stats.residentialRequests++;

            return {
                proxyUrl: this.currentProxy,
                timeout: {
                    request: CONFIG.PROXY.PROXY_TIMEOUT
                },
                retry: {
                    limit: CONFIG.PROXY.MAX_PROXY_RETRIES,
                    methods: ['GET', 'POST'],
                    statusCodes: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524]
                }
            };

        } catch (error) {
            log.error('Residential proxy failed:', error.message);
            this.proxyErrorCount++;
            return {};
        }
    }

    /**
     * Determine if residential proxy is needed for a URL
     * @param {string} targetUrl - Target URL
     * @returns {boolean} True if residential proxy is needed
     */
    shouldUseResidentialProxy(targetUrl) {
        if (!targetUrl) return false;
        
        try {
            const domain = new URL(targetUrl).hostname;
            
            // Check if domain is known to require residential proxy
            if (this.residentialRequiredDomains.has(domain)) {
                return true;
            }
            
            // Check if domain has been successful with datacenter proxy
            if (this.datacenterSuccessDomains.has(domain)) {
                return false;
            }
            
            // Known domains that typically require residential proxies
            const residentialRequiredPatterns = [
                'cloudflare',
                'captcha',
                'bot-detection',
                'access-denied'
            ];
            
            const requiresResidential = residentialRequiredPatterns.some(pattern => 
                domain.includes(pattern)
            );
            
            return requiresResidential;
            
        } catch (error) {
            log.debug('Error checking residential proxy need:', error.message);
            return false;
        }
    }

    /**
     * Check if proxy should be rotated
     * @returns {boolean} True if proxy should be rotated
     */
    shouldRotateProxy() {
        const timeSinceRotation = Date.now() - this.lastRotation;
        
        return (
            // Rotate based on usage count
            this.proxyUsageCount >= CONFIG.PROXY.SESSION_MAX_USAGE ||
            // Rotate based on error count
            this.proxyErrorCount >= CONFIG.PROXY.SESSION_MAX_ERROR_SCORE ||
            // Rotate based on time interval
            timeSinceRotation >= CONFIG.PROXY.RESIDENTIAL_ROTATION_INTERVAL ||
            // Force rotation if no current proxy
            !this.currentProxy
        );
    }

    /**
     * Rotate to a new proxy
     * @param {string} tier - Proxy tier ('datacenter' or 'residential')
     * @returns {Promise<void>}
     */
    async rotateProxy(tier = 'datacenter') {
        try {
            log.debug(`Rotating to new ${tier} proxy`);
            
            this.currentProxy = null;
            this.proxyUsageCount = 0;
            this.proxyErrorCount = 0;
            this.lastRotation = Date.now();
            this.currentTier = tier;
            
            if (this.proxyConfiguration) {
                this.currentProxy = await this.proxyConfiguration.newUrl();
                log.info(`Successfully rotated to new ${tier} proxy`);
            }

        } catch (error) {
            log.error('Failed to rotate proxy:', error.message);
        }
    }

    /**
     * Report proxy error for domain learning
     * @param {string} targetUrl - URL that failed
     * @param {string} errorType - Type of error
     */
    reportProxyError(targetUrl, errorType = 'unknown') {
        this.proxyErrorCount++;
        
        if (targetUrl) {
            try {
                const domain = new URL(targetUrl).hostname;
                
                // If datacenter proxy failed, mark domain for residential
                if (this.currentTier === 'datacenter') {
                    this.residentialRequiredDomains.add(domain);
                    log.debug(`Domain ${domain} marked for residential proxy due to ${errorType}`);
                }
                
            } catch (error) {
                log.debug('Error reporting proxy error:', error.message);
            }
        }
    }

    /**
     * Get cost optimization statistics
     * @returns {object} Cost statistics
     */
    getCostStats() {
        const residentialCostMultiplier = 3; // Residential proxies typically cost 3x more
        const estimatedSavings = this.stats.datacenterRequests * (residentialCostMultiplier - 1);
        
        return {
            ...this.stats,
            costSavings: estimatedSavings,
            datacenterPercentage: this.stats.totalRequests > 0 
                ? (this.stats.datacenterRequests / this.stats.totalRequests * 100).toFixed(1)
                : 0,
            residentialPercentage: this.stats.totalRequests > 0 
                ? (this.stats.residentialRequests / this.stats.totalRequests * 100).toFixed(1)
                : 0
        };
    }
}
