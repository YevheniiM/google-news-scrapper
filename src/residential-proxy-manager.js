/**
 * Residential Proxy Manager
 * Handles residential proxy configuration and rotation for bypassing anti-bot measures
 */

import { log } from 'crawlee';
import { CONFIG } from './config.js';

/**
 * Residential Proxy Manager class
 */
export class ResidentialProxyManager {
    constructor(proxyConfiguration = null) {
        this.proxyConfiguration = proxyConfiguration;
        this.currentProxy = null;
        this.proxyRotationTimer = null;
        this.proxyUsageCount = 0;
        this.proxyErrorCount = 0;
        this.lastRotation = Date.now();
        
        // Initialize proxy rotation if enabled
        if (CONFIG.PROXY.RESIDENTIAL_ENABLED && this.proxyConfiguration) {
            this.startProxyRotation();
        }
    }

    /**
     * Get a residential proxy URL
     * @param {string} targetUrl - Target URL for context
     * @returns {Promise<string|null>} Proxy URL or null if not available
     */
    async getResidentialProxy(targetUrl = '') {
        try {
            if (!this.proxyConfiguration) {
                log.debug('No proxy configuration available');
                return null;
            }

            // Check if we need to rotate proxy
            if (this.shouldRotateProxy()) {
                await this.rotateProxy();
            }

            // Get current proxy URL
            if (!this.currentProxy) {
                this.currentProxy = await this.proxyConfiguration.newUrl();
                log.debug('Obtained new residential proxy');
            }

            this.proxyUsageCount++;
            return this.currentProxy;

        } catch (error) {
            log.error('Failed to get residential proxy:', error.message);
            this.proxyErrorCount++;
            
            // Try to get a fallback proxy
            if (CONFIG.PROXY.DATACENTER_FALLBACK) {
                return await this.getFallbackProxy();
            }
            
            return null;
        }
    }

    /**
     * Get a fallback datacenter proxy
     * @returns {Promise<string|null>} Fallback proxy URL
     */
    async getFallbackProxy() {
        try {
            log.debug('Attempting to get fallback datacenter proxy');
            
            if (!this.proxyConfiguration) {
                return null;
            }

            // Get a datacenter proxy as fallback
            const fallbackProxy = await this.proxyConfiguration.newUrl();
            log.debug('Obtained fallback datacenter proxy');
            
            return fallbackProxy;

        } catch (error) {
            log.error('Failed to get fallback proxy:', error.message);
            return null;
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
     * @returns {Promise<void>}
     */
    async rotateProxy() {
        try {
            log.debug('Rotating residential proxy');
            
            this.currentProxy = null;
            this.proxyUsageCount = 0;
            this.proxyErrorCount = 0;
            this.lastRotation = Date.now();
            
            if (this.proxyConfiguration) {
                this.currentProxy = await this.proxyConfiguration.newUrl();
                log.info('Successfully rotated to new residential proxy');
            }

        } catch (error) {
            log.error('Failed to rotate proxy:', error.message);
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
                await this.rotateProxy();
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
     * Report proxy error (for rotation decision making)
     * @param {Error} error - Error that occurred
     * @param {number} statusCode - HTTP status code
     */
    reportProxyError(error, statusCode = null) {
        this.proxyErrorCount++;
        
        log.debug(`Proxy error reported: ${error.message} (status: ${statusCode})`);
        
        // Force rotation on certain errors
        const forceRotationCodes = [403, 429, 503, 407]; // Forbidden, Rate Limited, Service Unavailable, Proxy Auth Required
        
        if (statusCode && forceRotationCodes.includes(statusCode)) {
            log.warning(`Force rotating proxy due to status code: ${statusCode}`);
            this.rotateProxy();
        }
    }

    /**
     * Get proxy configuration for HTTP requests
     * @param {string} targetUrl - Target URL
     * @returns {Promise<object>} Proxy configuration object
     */
    async getProxyConfig(targetUrl = '') {
        try {
            const proxyUrl = await this.getResidentialProxy(targetUrl);

            if (!proxyUrl) {
                return {};
            }

            // Return configuration compatible with got-scraping
            return {
                proxyUrl: proxyUrl,
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
            log.error('Failed to get proxy config:', error.message);
            return {};
        }
    }

    /**
     * Get proxy configuration for Playwright browser
     * @param {string} targetUrl - Target URL
     * @returns {Promise<object>} Playwright proxy configuration
     */
    async getPlaywrightProxyConfig(targetUrl = '') {
        try {
            const proxyUrl = await this.getResidentialProxy(targetUrl);
            
            if (!proxyUrl) {
                return null;
            }

            const url = new URL(proxyUrl);
            
            return {
                server: `${url.protocol}//${url.host}`,
                username: url.username || undefined,
                password: url.password || undefined
            };

        } catch (error) {
            log.error('Failed to get Playwright proxy config:', error.message);
            return null;
        }
    }

    /**
     * Test proxy connectivity
     * @param {string} testUrl - URL to test with
     * @returns {Promise<boolean>} True if proxy is working
     */
    async testProxy(testUrl = 'https://httpbin.org/ip') {
        try {
            const proxyConfig = await this.getProxyConfig(testUrl);
            
            if (!proxyConfig.proxyUrl) {
                return false;
            }

            const { gotScraping } = await import('got-scraping');
            
            const response = await gotScraping({
                url: testUrl,
                ...proxyConfig,
                timeout: { request: 10000 },
                headers: {
                    'User-Agent': CONFIG.CRAWLER.DEFAULT_USER_AGENT
                }
            });

            log.debug('Proxy test successful');
            return response.statusCode === 200;

        } catch (error) {
            log.debug('Proxy test failed:', error.message);
            this.reportProxyError(error);
            return false;
        }
    }

    /**
     * Get proxy statistics
     * @returns {object} Proxy usage statistics
     */
    getStats() {
        return {
            currentProxy: this.currentProxy ? 'Active' : 'None',
            usageCount: this.proxyUsageCount,
            errorCount: this.proxyErrorCount,
            lastRotation: new Date(this.lastRotation).toISOString(),
            timeSinceRotation: Date.now() - this.lastRotation,
            shouldRotate: this.shouldRotateProxy()
        };
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopProxyRotation();
        this.currentProxy = null;
    }
}
