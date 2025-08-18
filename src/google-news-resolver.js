/**
 * Production-Grade Google News URL Resolver
 * Based on proven techniques from the community (github.com/huksley/bc3cb046157a99cd9d1517b32f91a99e)
 * Handles the complex task of resolving Google News URLs to actual article URLs
 */

import { log } from 'crawlee';
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

/**
 * Production-Grade Google News URL Resolver class
 */
export class GoogleNewsResolver {
    constructor(proxyManager = null, options = {}) {
        this.cache = new Map(); // In-memory cache for resolved URLs
        this.proxyManager = proxyManager;
        this.requestCount = 0;
        this.successCount = 0;
        this.lastRequestTime = 0;
        this.minRequestInterval = options.minRequestInterval || 1000; // Reduced for cloud environment
        this.isCloudEnvironment = this.detectCloudEnvironment();
        this.cloudTimeoutMultiplier = this.isCloudEnvironment ? 0.5 : 1; // Shorter timeouts in cloud

        // Cloud environment optimizations
        this.maxRetries = this.isCloudEnvironment ? 3 : 5; // Fewer retries in cloud
        this.baseTimeout = this.isCloudEnvironment ? 10000 : 20000; // Shorter base timeout in cloud
        this.fallbackToDirectUrl = this.isCloudEnvironment; // Enable direct URL fallback in cloud

        // Caching and persistence options
        this.enablePersistence = options.enablePersistence !== false; // Default: true
        this.cacheFile = options.cacheFile || 'storage/google-news-cache.json';
        this.maxCacheSize = options.maxCacheSize || 10000; // Maximum cache entries
        this.cacheExpiryHours = options.cacheExpiryHours || 24; // Cache expiry in hours

        // Load cache from disk if persistence is enabled
        if (this.enablePersistence) {
            this.loadCacheFromDisk();
        }

        // Periodically save cache to disk
        if (this.enablePersistence) {
            this.saveCacheInterval = setInterval(() => {
                this.saveCacheToDisk();
            }, 5 * 60 * 1000); // Save every 5 minutes
        }
    }

    /**
     * Detect if running in cloud environment (Apify, AWS Lambda, etc.)
     * @returns {boolean} True if in cloud environment
     */
    detectCloudEnvironment() {
        return !!(
            process.env.APIFY_ACTOR_ID ||
            process.env.AWS_LAMBDA_FUNCTION_NAME ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.AZURE_FUNCTIONS_WORKER_RUNTIME ||
            process.env.VERCEL ||
            process.env.NETLIFY ||
            process.env.HEROKU_APP_NAME ||
            process.env.NODE_ENV === 'production'
        );
    }

    /**
     * Resolve Google News URL to actual article URL using production-grade techniques
     * @param {string} googleNewsUrl - Google News URL
     * @param {object} page - Playwright page instance (optional)
     * @returns {Promise<string>} Resolved article URL
     */
    async resolveUrl(googleNewsUrl, page = null) {
        try {
            this.requestCount++;

            // Check cache first
            const cachedResult = this.getCachedUrl(googleNewsUrl);
            if (cachedResult) {
                log.debug(`Using cached resolution: ${cachedResult}`);
                return cachedResult;
            }

            log.info(`Resolving Google News URL (${this.requestCount}): ${googleNewsUrl}`);

            // If it's not a Google News URL, return as-is
            if (!googleNewsUrl.includes('news.google.com')) {
                return googleNewsUrl;
            }

            // Rate limiting - ensure minimum interval between requests
            await this.enforceRateLimit();

            let resolvedUrl = googleNewsUrl;

            // Cloud environment: Try direct URL fallback first if enabled
            if (this.fallbackToDirectUrl) {
                resolvedUrl = await this.tryDirectUrlFallback(googleNewsUrl);
                if (resolvedUrl !== googleNewsUrl) {
                    this.setCachedUrl(googleNewsUrl, resolvedUrl);
                    this.successCount++;
                    log.info(`✅ Resolved with direct URL fallback: ${resolvedUrl}`);
                    return resolvedUrl;
                }
            }

            // Strategy 1: Try the proven batchexecute method (most reliable for new URLs)
            resolvedUrl = await this.resolveWithBatchExecute(googleNewsUrl);
            if (resolvedUrl !== googleNewsUrl) {
                this.setCachedUrl(googleNewsUrl, resolvedUrl);
                this.successCount++;
                log.info(`✅ Resolved with batchexecute: ${resolvedUrl}`);
                return resolvedUrl;
            }

            // Strategy 1b: Try batchexecute again with fresh proxy rotation
            if (this.proxyManager) {
                log.debug('Rotating proxy and retrying batchexecute');
                await this.proxyManager.rotateProxy();
                resolvedUrl = await this.resolveWithBatchExecute(googleNewsUrl);
                if (resolvedUrl !== googleNewsUrl) {
                    this.setCachedUrl(googleNewsUrl, resolvedUrl);
                    this.successCount++;
                    log.info(`✅ Resolved with batchexecute (retry): ${resolvedUrl}`);
                    return resolvedUrl;
                }
            }

            // Strategy 2: Try legacy base64 decoding (for older URLs)
            resolvedUrl = await this.resolveWithLegacyDecoding(googleNewsUrl);
            if (resolvedUrl !== googleNewsUrl) {
                this.setCachedUrl(googleNewsUrl, resolvedUrl);
                this.successCount++;
                log.info(`✅ Resolved with legacy decoding: ${resolvedUrl}`);
                return resolvedUrl;
            }

            // Strategy 3: Try browser-based resolution (fallback)
            if (page) {
                resolvedUrl = await this.resolveWithBrowser(googleNewsUrl, page);
                if (resolvedUrl !== googleNewsUrl) {
                    this.setCachedUrl(googleNewsUrl, resolvedUrl);
                    this.successCount++;
                    log.info(`✅ Resolved with browser: ${resolvedUrl}`);
                    return resolvedUrl;
                }
            }

            log.warning(`❌ Could not resolve Google News URL: ${googleNewsUrl}`);
            return googleNewsUrl;

        } catch (error) {
            log.error(`Error resolving Google News URL: ${error.message}`);
            return googleNewsUrl;
        }
    }

    /**
     * Enforce rate limiting between requests
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            log.debug(`Rate limiting: waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Resolve URL using the proven batchexecute method
     * Based on the community solution from github.com/huksley/bc3cb046157a99cd9d1517b32f91a99e
     * @param {string} googleNewsUrl - Google News URL
     * @returns {Promise<string>} Resolved URL
     */
    async resolveWithBatchExecute(googleNewsUrl) {
        try {
            log.debug('Attempting batchexecute URL resolution');

            // Extract article ID from URL
            const url = new URL(googleNewsUrl);
            const pathParts = url.pathname.split('/');

            if (pathParts.length < 2 || pathParts[pathParts.length - 2] !== 'articles') {
                log.debug('Not a valid Google News article URL format');
                return googleNewsUrl;
            }

            const articleId = pathParts[pathParts.length - 1];

            // Step 1: Get decoding parameters from the article page
            const decodingParams = await this.getDecodingParams(articleId);
            if (!decodingParams) {
                log.debug('Failed to get decoding parameters');
                return googleNewsUrl;
            }

            // Step 2: Use batchexecute to decode the URL
            const decodedUrl = await this.callBatchExecute(decodingParams);
            if (decodedUrl && decodedUrl !== googleNewsUrl && !decodedUrl.includes('google.com')) {
                return decodedUrl;
            }

            return googleNewsUrl;

        } catch (error) {
            log.debug('Batchexecute resolution failed:', error.message);
            return googleNewsUrl;
        }
    }

    /**
     * Get decoding parameters from Google News article page with fallback strategies
     * @param {string} articleId - Article ID from URL
     * @returns {Promise<object|null>} Decoding parameters
     */
    async getDecodingParams(articleId) {
        // Try multiple strategies with different configurations
        const strategies = [
            () => this.getDecodingParamsWithConfig(articleId, 'standard'),
            () => this.getDecodingParamsWithConfig(articleId, 'mobile'),
            () => this.getDecodingParamsWithConfig(articleId, 'rss'),
            () => this.getDecodingParamsWithConfig(articleId, 'minimal')
        ];

        for (const strategy of strategies) {
            try {
                const result = await strategy();
                if (result) {
                    return result;
                }
            } catch (error) {
                log.debug(`Decoding params strategy failed: ${error.message}`);
            }
        }

        return null;
    }

    /**
     * Get decoding parameters with specific configuration
     * @param {string} articleId - Article ID from URL
     * @param {string} strategy - Strategy type
     * @returns {Promise<object|null>} Decoding parameters
     */
    async getDecodingParamsWithConfig(articleId, strategy = 'standard') {
        try {
            let articleUrl;
            let headers;

            switch (strategy) {
                case 'mobile':
                    articleUrl = `https://news.google.com/articles/${articleId}`;
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5'
                    };
                    break;

                case 'rss':
                    articleUrl = `https://news.google.com/rss/articles/${articleId}`;
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                        'Accept': 'application/rss+xml, application/xml, text/xml',
                        'Accept-Language': 'en-US,en;q=0.5'
                    };
                    break;

                case 'minimal':
                    articleUrl = `https://news.google.com/articles/${articleId}`;
                    headers = {
                        'User-Agent': 'curl/7.68.0',
                        'Accept': '*/*'
                    };
                    break;

                default: // standard
                    articleUrl = `https://news.google.com/articles/${articleId}`;
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Referer': 'https://news.google.com/'
                    };
            }

            const requestConfig = {
                url: articleUrl,
                timeout: { request: 15000 },
                headers
            };

            // Add proxy if available
            if (this.proxyManager) {
                const proxyConfig = await this.proxyManager.getProxyConfig(articleUrl);
                if (proxyConfig.proxyUrl) {
                    Object.assign(requestConfig, proxyConfig);
                    log.info(`🔄 Using residential proxy for article page: ${proxyConfig.proxyUrl.substring(0, 50)}...`);
                } else {
                    log.warning('❌ No residential proxy available for article page request');
                }
            } else {
                log.warning('❌ No proxy manager available for article page request');
            }

            log.debug(`Trying ${strategy} strategy for decoding params: ${articleUrl}`);
            const response = await gotScraping(requestConfig);
            const $ = cheerio.load(response.body);

            // Find the c-wiz div with data attributes
            const cwizDiv = $('c-wiz > div').first();

            if (cwizDiv.length === 0) {
                log.debug(`Could not find c-wiz div with ${strategy} strategy`);
                return null;
            }

            const signature = cwizDiv.attr('data-n-a-sg');
            const timestamp = cwizDiv.attr('data-n-a-ts');

            if (!signature || !timestamp) {
                log.debug(`Could not extract signature or timestamp with ${strategy} strategy`);
                return null;
            }

            log.debug(`Successfully got decoding params with ${strategy} strategy`);
            return {
                signature,
                timestamp: parseInt(timestamp),
                articleId,
                strategy
            };

        } catch (error) {
            log.debug(`Failed to get decoding parameters with ${strategy} strategy:`, error.message);

            // Report proxy error and rotate if applicable
            if (this.proxyManager && (error.response?.statusCode === 429 || error.response?.statusCode === 403 || error.response?.statusCode === 502 || error.response?.statusCode === 503)) {
                log.warning(`Proxy error ${error.response.statusCode} - rotating proxy`);
                this.proxyManager.reportProxyError(articleUrl, error, error.response.statusCode);
                // Force proxy rotation for next request
                await this.proxyManager.rotateProxy();
            }

            throw error; // Re-throw to try next strategy
        }
    }

    /**
     * Call Google's batchexecute API to decode the URL with retry logic and error handling
     * @param {object} params - Decoding parameters
     * @returns {Promise<string|null>} Decoded URL
     */
    async callBatchExecute(params) {
        const maxRetries = this.maxRetries; // Use environment-specific retry count
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                log.debug(`Batchexecute attempt ${attempt}/${maxRetries} for article: ${params.articleId}`);

                const result = await this.callBatchExecuteOnce(params, attempt);
                if (result) {
                    log.debug(`Batchexecute succeeded on attempt ${attempt}`);
                    return result;
                }

                // If no result but no error, wait before retry
                if (attempt < maxRetries) {
                    const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                    log.debug(`Batchexecute attempt ${attempt} returned no result, waiting ${waitTime}ms before retry`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

            } catch (error) {
                lastError = error;
                log.debug(`Batchexecute attempt ${attempt} failed: ${error.message}`);

                // Don't retry on certain errors
                if (error.response?.statusCode === 400 || error.response?.statusCode === 404) {
                    log.debug('Non-retryable error, aborting retries');
                    break;
                }

                // Report proxy error and rotate if applicable
                if (this.proxyManager && (error.response?.statusCode === 429 || error.response?.statusCode === 403 || error.response?.statusCode === 502 || error.response?.statusCode === 503)) {
                    log.warning(`Proxy error ${error.response.statusCode} in batchexecute - rotating proxy`);
                    this.proxyManager.reportProxyError('https://news.google.com/_/DotsSplashUi/data/batchexecute', error, error.response.statusCode);
                    // Force proxy rotation for next request
                    await this.proxyManager.rotateProxy();
                }

                // Wait before retry
                if (attempt < maxRetries) {
                    const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
                    log.debug(`Waiting ${waitTime}ms before retry attempt ${attempt + 1}`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        log.debug(`All batchexecute attempts failed. Last error: ${lastError?.message || 'Unknown'}`);
        return null;
    }

    /**
     * Single attempt at calling batchexecute API
     * @param {object} params - Decoding parameters
     * @param {number} attempt - Attempt number
     * @returns {Promise<string|null>} Decoded URL
     */
    async callBatchExecuteOnce(params, attempt = 1) {
        const { signature, timestamp, articleId, strategy = 'standard' } = params;

        // Construct the request payload exactly as shown in the working solution
        const articlesReq = [
            'Fbv4je',
            `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleId}",${timestamp},"${signature}"]`
        ];

        const payload = `f.req=${encodeURIComponent(JSON.stringify([[articlesReq]]))}`;

        // Vary headers based on attempt and strategy
        let userAgent;
        switch (attempt % 3) {
            case 1:
                userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
                break;
            case 2:
                userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
                break;
            default:
                userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        }

        const requestConfig = {
            url: 'https://news.google.com/_/DotsSplashUi/data/batchexecute',
            method: 'POST',
            timeout: { request: Math.floor(this.baseTimeout * this.cloudTimeoutMultiplier) }, // Dynamic timeout based on environment
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'User-Agent': userAgent,
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://news.google.com/',
                'Origin': 'https://news.google.com',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            body: payload,
            retry: {
                limit: 0 // We handle retries manually
            }
        };

        // Add proxy if available
        if (this.proxyManager) {
            const proxyConfig = await this.proxyManager.getProxyConfig();
            if (proxyConfig.proxyUrl) {
                Object.assign(requestConfig, proxyConfig);
                log.info(`🔄 Using residential proxy for batchexecute: ${proxyConfig.proxyUrl.substring(0, 50)}...`);
            } else {
                log.warning('❌ No residential proxy available for batchexecute request');
            }
        } else {
            log.warning('❌ No proxy manager available for batchexecute request');
        }

        const startTime = Date.now();
        const response = await gotScraping(requestConfig);
        const responseTime = Date.now() - startTime;

        log.debug(`Batchexecute response received in ${responseTime}ms (status: ${response.statusCode})`);

        // Validate response
        if (response.statusCode !== 200) {
            throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
        }

        if (!response.body || response.body.length === 0) {
            throw new Error('Empty response body');
        }

        // Parse the response according to the proven format
        const responseLines = response.body.split('\n\n');
        if (responseLines.length < 2) {
            log.debug('Invalid batchexecute response format - insufficient lines');
            return null;
        }

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(responseLines[1]);
        } catch (parseError) {
            log.debug('Failed to parse batchexecute JSON response:', parseError.message);
            return null;
        }

        if (!jsonResponse || jsonResponse.length < 1) {
            log.debug('Empty or invalid batchexecute JSON response');
            return null;
        }

        // Extract the decoded URL from the response
        const responseData = jsonResponse.slice(0, -2); // Remove last 2 elements as per the solution
        if (responseData.length > 0 && responseData[0] && responseData[0].length > 2) {
            try {
                const decodedData = JSON.parse(responseData[0][2]);
                if (decodedData && decodedData.length > 1) {
                    const decodedUrl = decodedData[1];
                    if (decodedUrl && typeof decodedUrl === 'string' && decodedUrl.startsWith('http')) {
                        // Validate the decoded URL
                        if (!decodedUrl.includes('google.com') && decodedUrl.length > 10) {
                            log.debug(`Successfully decoded URL: ${decodedUrl} (response time: ${responseTime}ms)`);
                            return decodedUrl;
                        } else {
                            log.debug(`Decoded URL appears invalid: ${decodedUrl}`);
                        }
                    } else {
                        log.debug(`Invalid decoded URL format: ${typeof decodedUrl} - ${decodedUrl}`);
                    }
                } else {
                    log.debug('Decoded data is empty or invalid');
                }
            } catch (decodeError) {
                log.debug('Failed to parse decoded data:', decodeError.message);
            }
        } else {
            log.debug('Response data structure is invalid');
        }

        return null;
    }

    /**
     * Resolve URL using legacy base64 decoding (for older URL formats)
     * @param {string} googleNewsUrl - Google News URL
     * @returns {Promise<string>} Resolved URL
     */
    async resolveWithLegacyDecoding(googleNewsUrl) {
        try {
            log.debug('Attempting legacy base64 decoding');

            const url = new URL(googleNewsUrl);
            const pathParts = url.pathname.split('/');

            if (pathParts.length < 2 || pathParts[pathParts.length - 2] !== 'articles') {
                return googleNewsUrl;
            }

            const base64String = pathParts[pathParts.length - 1];

            // Check if this is a new-style URL that requires batchexecute
            if (base64String.startsWith('AU_yqL')) {
                log.debug('New-style URL detected, requires batchexecute');
                return googleNewsUrl;
            }

            // Try to decode the base64 string
            let decodedString;
            try {
                decodedString = Buffer.from(base64String, 'base64').toString('binary');
            } catch (e) {
                log.debug('Failed to decode base64 string');
                return googleNewsUrl;
            }

            // Remove prefix and suffix as per the documented format
            const prefix = Buffer.from([0x08, 0x13, 0x22]).toString('binary');
            if (decodedString.startsWith(prefix)) {
                decodedString = decodedString.substring(prefix.length);
            }

            const suffix = Buffer.from([0xd2, 0x01, 0x00]).toString('binary');
            if (decodedString.endsWith(suffix)) {
                decodedString = decodedString.substring(0, decodedString.length - suffix.length);
            }

            // Extract URL from the decoded data
            const bytes = Uint8Array.from(decodedString, c => c.charCodeAt(0));
            const len = bytes.at(0);

            let extractedUrl;
            if (len >= 0x80) {
                extractedUrl = decodedString.substring(2, len + 2);
            } else {
                extractedUrl = decodedString.substring(1, len + 1);
            }

            // Validate the extracted URL
            if (extractedUrl && extractedUrl.startsWith('http') && !extractedUrl.includes('google.com')) {
                log.debug(`Successfully decoded legacy URL: ${extractedUrl}`);
                return extractedUrl;
            }

            return googleNewsUrl;

        } catch (error) {
            log.debug('Legacy decoding failed:', error.message);
            return googleNewsUrl;
        }
    }

    /**
     * Resolve URL using browser automation
     * @param {string} googleNewsUrl - Google News URL
     * @param {object} page - Playwright page instance
     * @returns {Promise<string>} Resolved URL
     */
    async resolveWithBrowser(googleNewsUrl, page) {
        try {
            log.debug('Attempting browser-based URL resolution');

            // Navigate to the Google News URL
            const response = await page.goto(googleNewsUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });

            if (!response) {
                log.debug('No response from Google News URL');
                return googleNewsUrl;
            }

            // Wait for potential redirects
            await page.waitForTimeout(2000);

            // Get the final URL after redirects
            const finalUrl = page.url();

            // Check if we were redirected to the actual article
            if (finalUrl !== googleNewsUrl && !finalUrl.includes('news.google.com')) {
                log.info(`Browser resolved URL: ${finalUrl}`);
                return finalUrl;
            }

            // If still on Google News, try to find the article link
            try {
                // Look for the main article link
                const articleLink = await page.$eval('article a[href*="http"]:not([href*="google.com"])', 
                    el => el.href
                ).catch(() => null);

                if (articleLink) {
                    log.info(`Found article link: ${articleLink}`);
                    return articleLink;
                }

                // Try alternative selectors
                const alternativeSelectors = [
                    'a[data-n-tid]',
                    'a[jsname]',
                    'a[href]:not([href*="google.com"])',
                    '[role="link"]'
                ];

                for (const selector of alternativeSelectors) {
                    const link = await page.$eval(selector, el => el.href || el.getAttribute('href'))
                        .catch(() => null);
                    
                    if (link && link.startsWith('http') && !link.includes('google.com')) {
                        log.info(`Found alternative link: ${link}`);
                        return link;
                    }
                }

            } catch (error) {
                log.debug('Failed to find article link on page:', error.message);
            }

            return googleNewsUrl;

        } catch (error) {
            log.debug('Browser resolution failed:', error.message);
            return googleNewsUrl;
        }
    }

    /**
     * Try direct URL fallback for cloud environments
     * @param {string} googleNewsUrl - Google News URL
     * @returns {Promise<string>} Resolved URL or original URL
     */
    async tryDirectUrlFallback(googleNewsUrl) {
        try {
            log.debug('Attempting direct URL fallback for cloud environment');

            // Extract article ID and try common URL patterns
            const url = new URL(googleNewsUrl);
            const pathParts = url.pathname.split('/');

            if (pathParts.length < 2 || pathParts[pathParts.length - 2] !== 'articles') {
                return googleNewsUrl;
            }

            const articleId = pathParts[pathParts.length - 1];

            // Try to extract URL from common patterns in the article ID
            const patterns = [
                // Pattern 1: Look for encoded URLs in the ID
                () => this.extractFromBase64Pattern(articleId),
                // Pattern 2: Try URL-safe base64 decoding
                () => this.extractFromUrlSafeBase64(articleId),
                // Pattern 3: Look for direct URL hints in parameters
                () => this.extractFromUrlParams(googleNewsUrl)
            ];

            for (const pattern of patterns) {
                try {
                    const result = pattern();
                    if (result && result !== googleNewsUrl && !result.includes('google.com')) {
                        log.debug(`Direct URL fallback succeeded: ${result}`);
                        return result;
                    }
                } catch (error) {
                    // Continue to next pattern
                }
            }

            return googleNewsUrl;

        } catch (error) {
            log.debug('Direct URL fallback failed:', error.message);
            return googleNewsUrl;
        }
    }

    /**
     * Resolve URL by following HTTP redirects
     * @param {string} googleNewsUrl - Google News URL
     * @returns {Promise<string>} Resolved URL
     */
    async resolveWithHttpRedirects(googleNewsUrl) {
        try {
            log.debug('Attempting HTTP redirect resolution');

            const response = await gotScraping({
                url: googleNewsUrl,
                followRedirect: true,
                maxRedirects: 10,
                timeout: { request: 10000 },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://news.google.com/'
                }
            });

            const finalUrl = response.url;

            if (finalUrl !== googleNewsUrl && !finalUrl.includes('news.google.com')) {
                log.info(`HTTP redirect resolved URL: ${finalUrl}`);
                return finalUrl;
            }

            // If we got HTML content, try to extract the redirect URL from it
            if (response.body && typeof response.body === 'string') {
                const redirectMatch = response.body.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/);
                if (redirectMatch && redirectMatch[1]) {
                    const redirectUrl = redirectMatch[1];
                    if (!redirectUrl.includes('google.com')) {
                        log.info(`Found redirect in HTML: ${redirectUrl}`);
                        return redirectUrl;
                    }
                }

                // Look for meta refresh
                const metaRefreshMatch = response.body.match(/<meta[^>]+http-equiv=['"]refresh['"][^>]+content=['"][^;]+;\s*url=([^'"]+)['"]/i);
                if (metaRefreshMatch && metaRefreshMatch[1]) {
                    const refreshUrl = metaRefreshMatch[1];
                    if (!refreshUrl.includes('google.com')) {
                        log.info(`Found meta refresh URL: ${refreshUrl}`);
                        return refreshUrl;
                    }
                }
            }

            return googleNewsUrl;

        } catch (error) {
            log.debug('HTTP redirect resolution failed:', error.message);
            return googleNewsUrl;
        }
    }

    /**
     * Extract URL from Google News URL parameters
     * @param {string} googleNewsUrl - Google News URL
     * @returns {string} Extracted URL or original URL
     */
    extractFromUrlParams(googleNewsUrl) {
        try {
            log.debug('Attempting URL parameter extraction');

            const url = new URL(googleNewsUrl);

            // Check for direct URL parameter
            if (url.searchParams.has('url')) {
                const extractedUrl = decodeURIComponent(url.searchParams.get('url'));
                if (extractedUrl && !extractedUrl.includes('google.com')) {
                    log.info(`Extracted URL from parameters: ${extractedUrl}`);
                    return extractedUrl;
                }
            }

            // Try to decode the article ID
            const pathMatch = url.pathname.match(/\/articles\/([^?]+)/);
            if (pathMatch) {
                const articleId = pathMatch[1];
                
                // Try different decoding methods
                const decodingMethods = [
                    () => this.decodeBase64(articleId),
                    () => this.decodeUrlSafeBase64(articleId),
                    () => this.extractFromEncodedString(articleId)
                ];

                for (const method of decodingMethods) {
                    try {
                        const decoded = method();
                        if (decoded && decoded !== googleNewsUrl && !decoded.includes('google.com')) {
                            log.info(`Decoded URL: ${decoded}`);
                            return decoded;
                        }
                    } catch (error) {
                        // Continue to next method
                    }
                }
            }

            return googleNewsUrl;

        } catch (error) {
            log.debug('URL parameter extraction failed:', error.message);
            return googleNewsUrl;
        }
    }

    /**
     * Extract URL from base64 pattern in article ID
     * @param {string} articleId - Article ID
     * @returns {string|null} Extracted URL
     */
    extractFromBase64Pattern(articleId) {
        try {
            // Try standard base64 decoding
            const decoded = Buffer.from(articleId, 'base64').toString('utf-8');
            const urlMatch = decoded.match(/https?:\/\/[^\s"'<>]+/);
            return urlMatch ? urlMatch[0] : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract URL from URL parameters
     * @param {string} googleNewsUrl - Google News URL
     * @returns {string|null} Extracted URL
     */
    extractFromUrlParams(googleNewsUrl) {
        try {
            const url = new URL(googleNewsUrl);
            // Look for common URL parameters that might contain the target URL
            const params = ['url', 'u', 'link', 'target', 'redirect'];
            for (const param of params) {
                const value = url.searchParams.get(param);
                if (value && value.startsWith('http') && !value.includes('google.com')) {
                    return decodeURIComponent(value);
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Decode base64 string
     * @param {string} encoded - Encoded string
     * @returns {string|null} Decoded URL
     */
    decodeBase64(encoded) {
        try {
            const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
            const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\x00-\x1f]+/);
            return urlMatch ? urlMatch[0] : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Decode URL-safe base64 string
     * @param {string} encoded - Encoded string
     * @returns {string|null} Decoded URL
     */
    decodeUrlSafeBase64(encoded) {
        try {
            const urlSafe = encoded.replace(/-/g, '+').replace(/_/g, '/');
            const padded = urlSafe + '='.repeat((4 - urlSafe.length % 4) % 4);
            const decoded = Buffer.from(padded, 'base64').toString('utf-8');
            const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\x00-\x1f]+/);
            return urlMatch ? urlMatch[0] : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract URL from encoded string using patterns
     * @param {string} encoded - Encoded string
     * @returns {string|null} Extracted URL
     */
    extractFromEncodedString(encoded) {
        try {
            // Look for URL patterns in the encoded string
            const patterns = [
                /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s"'<>]*/g,
                /CBM[a-zA-Z0-9+\/=]*?(https?:\/\/[^\s"'<>]+)/g,
                /AU_yqL[a-zA-Z0-9+\/=]*?(https?:\/\/[^\s"'<>]+)/g
            ];

            for (const pattern of patterns) {
                const matches = encoded.match(pattern);
                if (matches) {
                    for (const match of matches) {
                        if (match.startsWith('http') && !match.includes('google.com')) {
                            return match;
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get cached URL with expiry check
     * @param {string} googleNewsUrl - Google News URL
     * @returns {string|null} Cached URL or null if not found/expired
     */
    getCachedUrl(googleNewsUrl) {
        if (!this.cache.has(googleNewsUrl)) {
            return null;
        }

        const cacheEntry = this.cache.get(googleNewsUrl);

        // Check if cache entry has expired
        if (cacheEntry.timestamp) {
            const now = Date.now();
            const expiryTime = cacheEntry.timestamp + (this.cacheExpiryHours * 60 * 60 * 1000);

            if (now > expiryTime) {
                log.debug(`Cache entry expired for: ${googleNewsUrl}`);
                this.cache.delete(googleNewsUrl);
                return null;
            }
        }

        return cacheEntry.resolvedUrl || cacheEntry; // Handle both old and new cache formats
    }

    /**
     * Set cached URL with timestamp
     * @param {string} googleNewsUrl - Google News URL
     * @param {string} resolvedUrl - Resolved URL
     */
    setCachedUrl(googleNewsUrl, resolvedUrl) {
        // Enforce cache size limit
        if (this.cache.size >= this.maxCacheSize) {
            // Remove oldest entries (simple FIFO)
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            log.debug(`Cache size limit reached, removed oldest entry: ${oldestKey}`);
        }

        this.cache.set(googleNewsUrl, {
            resolvedUrl: resolvedUrl,
            timestamp: Date.now(),
            requestCount: this.requestCount
        });
    }

    /**
     * Load cache from disk
     */
    async loadCacheFromDisk() {
        try {
            // Ensure cache directory exists
            const cacheDir = path.dirname(this.cacheFile);
            await fs.mkdir(cacheDir, { recursive: true });

            const cacheData = await fs.readFile(this.cacheFile, 'utf8');
            const parsedCache = JSON.parse(cacheData);

            // Load cache entries
            for (const [key, value] of Object.entries(parsedCache.entries || {})) {
                this.cache.set(key, value);
            }

            // Load statistics
            if (parsedCache.stats) {
                this.requestCount = parsedCache.stats.requestCount || 0;
                this.successCount = parsedCache.stats.successCount || 0;
            }

            log.info(`Loaded ${this.cache.size} cached URL resolutions from disk`);

        } catch (error) {
            if (error.code !== 'ENOENT') {
                log.warning(`Failed to load cache from disk: ${error.message}`);
            }
        }
    }

    /**
     * Save cache to disk
     */
    async saveCacheToDisk() {
        if (!this.enablePersistence) {
            return;
        }

        try {
            // Ensure cache directory exists
            const cacheDir = path.dirname(this.cacheFile);
            await fs.mkdir(cacheDir, { recursive: true });

            const cacheData = {
                version: '1.0',
                timestamp: Date.now(),
                stats: {
                    requestCount: this.requestCount,
                    successCount: this.successCount,
                    cacheSize: this.cache.size
                },
                entries: Object.fromEntries(this.cache)
            };

            await fs.writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
            log.debug(`Saved ${this.cache.size} cached URL resolutions to disk`);

        } catch (error) {
            log.warning(`Failed to save cache to disk: ${error.message}`);
        }
    }

    /**
     * Clear the resolution cache
     */
    clearCache() {
        this.cache.clear();

        // Also remove cache file if persistence is enabled
        if (this.enablePersistence) {
            fs.unlink(this.cacheFile).catch(() => {
                // Ignore errors if file doesn't exist
            });
        }
    }

    /**
     * Get comprehensive cache statistics
     * @returns {object} Cache stats
     */
    getCacheStats() {
        const now = Date.now();
        let expiredCount = 0;
        let validCount = 0;

        for (const [key, value] of this.cache.entries()) {
            if (value.timestamp) {
                const expiryTime = value.timestamp + (this.cacheExpiryHours * 60 * 60 * 1000);
                if (now > expiryTime) {
                    expiredCount++;
                } else {
                    validCount++;
                }
            } else {
                validCount++; // Old format entries
            }
        }

        return {
            totalEntries: this.cache.size,
            validEntries: validCount,
            expiredEntries: expiredCount,
            requestCount: this.requestCount,
            successCount: this.successCount,
            successRate: this.requestCount > 0 ? (this.successCount / this.requestCount * 100).toFixed(1) + '%' : '0%',
            cacheHitRate: this.requestCount > 0 ? ((this.requestCount - this.successCount) / this.requestCount * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Cleanup resources and save cache
     */
    async cleanup() {
        // Clear the save interval
        if (this.saveCacheInterval) {
            clearInterval(this.saveCacheInterval);
        }

        // Save cache one final time
        if (this.enablePersistence) {
            await this.saveCacheToDisk();
        }

        log.info(`Google News Resolver cleanup completed. Final stats: ${JSON.stringify(this.getCacheStats())}`);
    }
}
