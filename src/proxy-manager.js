/**
 * Unified Proxy Manager - Combines optimized and residential proxy management
 * Cost-efficient proxy strategy with smart fallback mechanisms
 */

import { log } from 'crawlee';
import { CONFIG } from './config.js';

/**
 * Unified Proxy Manager class with cost optimization and smart proxy selection
 */
export class ProxyManager {
    constructor(proxyConfiguration = null) {
        this.proxyConfiguration = proxyConfiguration;
        this.currentProxy = null;
        this.proxyRotationTimer = null;
        this.proxyUsageCount = 0;
        this.proxyErrorCount = 0;
        this.lastRotation = Date.now();
        
        // Track domains that require residential proxies
        this.residentialRequiredDomains = new Set([
            'google.com',
            'news.google.com',
            'consent.google.com',
            // Add more domains that typically require residential proxies
        ]);
        
        // Track successful datacenter proxy usage
        this.datacenterSuccessDomains = new Set();
        
        // Current proxy tier: 'datacenter' or 'residential'
        this.currentTier = 'datacenter';
        
        // Statistics for cost tracking
        this.stats = {
            datacenterRequests: 0,
            residentialRequests: 0,
            totalRequests: 0,
            costSavings: 0,
            errors: 0,
            rotations: 0
        };

        // Initialize proxy rotation if enabled
        if (CONFIG.PROXY.RESIDENTIAL_ENABLED && this.proxyConfiguration) {
            this.startProxyRotation();
        }
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
            log.error('Failed to get proxy config:', error.message);
            this.stats.errors++;
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
                try {
                    const domain = new URL(targetUrl).hostname;
                    this.datacenterSuccessDomains.add(domain);
                } catch (e) {
                    // Invalid URL, ignore
                }
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
            this.stats.errors++;
            
            // Mark domain as potentially needing residential proxy
            if (targetUrl) {
                try {
                    const domain = new URL(targetUrl).hostname;
                    this.residentialRequiredDomains.add(domain);
                } catch (e) {
                    // Invalid URL, ignore
                }
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
            this.stats.errors++;
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
            
            // Check if datacenter proxy has failed for this domain before
            if (this.residentialRequiredDomains.has(domain)) {
                return true;
            }
            
            // Check for specific patterns that typically require residential proxies
            const residentialPatterns = [
                'google.com',
                'consent',
                'captcha',
                'cloudflare',
                'bot-protection'
            ];
            
            return residentialPatterns.some(pattern => 
                domain.includes(pattern) || targetUrl.includes(pattern)
            );
            
        } catch (error) {
            log.debug('Error checking residential proxy requirement:', error.message);
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
            this.stats.rotations++;
            
            if (this.proxyConfiguration) {
                this.currentProxy = await this.proxyConfiguration.newUrl();
                log.info(`Successfully rotated to new ${tier} proxy`);
            }

        } catch (error) {
            log.error('Failed to rotate proxy:', error.message);
            this.stats.errors++;
        }
    }

    /**
     * Report proxy error for domain learning and rotation decisions
     * @param {string} targetUrl - URL that failed
     * @param {Error} error - Error that occurred
     * @param {number} statusCode - HTTP status code
     */
    reportProxyError(targetUrl, error, statusCode = null) {
        this.proxyErrorCount++;
        this.stats.errors++;

        log.debug(`Proxy error reported: ${error.message} (status: ${statusCode})`);

        if (targetUrl) {
            try {
                const domain = new URL(targetUrl).hostname;

                // If datacenter proxy failed, mark domain for residential
                if (this.currentTier === 'datacenter') {
                    this.residentialRequiredDomains.add(domain);
                    log.debug(`Domain ${domain} marked for residential proxy due to error`);
                }

            } catch (e) {
                log.debug('Error reporting proxy error:', e.message);
            }
        }

        // Force rotation on certain errors
        const forceRotationCodes = [403, 429, 503, 407]; // Forbidden, Rate Limited, Service Unavailable, Proxy Auth Required

        if (statusCode && forceRotationCodes.includes(statusCode)) {
            log.warning(`Force rotating proxy due to status code: ${statusCode}`);
            this.rotateProxy(this.currentTier);
        }
    }

    /**
     * Start automatic proxy rotation
     */
    startProxyRotation() {
        if (this.proxyRotationTimer) {
            clearInterval(this.proxyRotationTimer);
        }

        this.proxyRotationTimer = setInterval(async () => {
            if (this.shouldRotateProxy()) {
                await this.rotateProxy(this.currentTier);
            }
        }, CONFIG.PROXY.RESIDENTIAL_ROTATION_INTERVAL);

        log.debug('Started automatic proxy rotation');
    }

    /**
     * Stop automatic proxy rotation
     */
    stopProxyRotation() {
        if (this.proxyRotationTimer) {
            clearInterval(this.proxyRotationTimer);
            this.proxyRotationTimer = null;
            log.debug('Stopped automatic proxy rotation');
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
                : 0,
            currentTier: this.currentTier,
            currentProxy: this.currentProxy ? 'Active' : 'None',
            usageCount: this.proxyUsageCount,
            errorCount: this.proxyErrorCount,
            lastRotation: new Date(this.lastRotation).toISOString(),
            timeSinceRotation: Date.now() - this.lastRotation,
            shouldRotate: this.shouldRotateProxy()
        };
    }

    /**
     * Get proxy statistics (alias for getCostStats for compatibility)
     * @returns {object} Proxy usage statistics
     */
    getStats() {
        return this.getCostStats();
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopProxyRotation();
        this.currentProxy = null;
        this.residentialRequiredDomains.clear();
        this.datacenterSuccessDomains.clear();
    }
}
