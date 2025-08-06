/**
 * Article crawler for extracting full content from news articles
 * Stage B: Crawl every article URL and extract content
 */

import { Actor, Dataset } from 'apify';
import { CheerioCrawler, PlaywrightCrawler, log } from 'crawlee';
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { CONFIG } from './config.js';
import { extractRealUrl, extractImages, validateImageUrl, cleanText, sleep, decodeGoogleNewsUrl, resolveGoogleNewsUrlWithBrowser, validateContentQuality } from './utils.js';
import { SessionManager } from './session-manager.js';
import { ContentExtractor } from './content-extractor.js';
import { AdvancedContentExtractor } from './advanced-content-extractor.js';
import { OptimizedContentExtractor } from './optimized-content-extractor.js';
import { GoogleNewsResolver } from './google-news-resolver.js';
import { ResidentialProxyManager } from './residential-proxy-manager.js';
import { OptimizedProxyManager } from './optimized-proxy-manager.js';
import { costMonitor } from './cost-monitor.js';

/**
 * Article Crawler class
 */
export class ArticleCrawler {
    constructor(proxyConfiguration = null, useBrowser = false) {
        this.proxyConfiguration = proxyConfiguration;
        this.useBrowser = useBrowser;
        this.failedUrls = [];
        this.sessionManager = new SessionManager();
        this.contentExtractor = new ContentExtractor();
        this.advancedContentExtractor = new AdvancedContentExtractor();

        // COST OPTIMIZATION: Use optimized extractor when cost optimization is enabled
        this.optimizedContentExtractor = new OptimizedContentExtractor();
        this.useOptimizedExtraction = CONFIG.COST_OPTIMIZATION?.SINGLE_EXTRACTION_STRATEGY ?? false;

        // COST OPTIMIZATION: Use optimized proxy manager when cost optimization is enabled
        this.residentialProxyManager = new ResidentialProxyManager(proxyConfiguration);
        this.optimizedProxyManager = new OptimizedProxyManager(proxyConfiguration);
        this.useOptimizedProxy = CONFIG.COST_OPTIMIZATION?.SINGLE_EXTRACTION_STRATEGY ?? false;

        // Initialize production-grade Google News resolver with proxy support
        this.googleNewsResolver = new GoogleNewsResolver(this.residentialProxyManager, {
            enablePersistence: true,
            cacheFile: 'storage/google-news-cache.json',
            maxCacheSize: 50000,
            cacheExpiryHours: 24,
            minRequestInterval: 500 // 0.5 seconds between requests with residential proxies
        });
        this.browserFallbackDomains = new Set(); // Domains that require browser mode
        this.browserFallbackIndicators = [
            'javascript is required',
            'enable javascript',
            'js is disabled',
            'noscript',
            'cloudflare',
            'please wait',
            'checking your browser',
            'bot detection',
            'access denied',
            'blocked',
        ];

        // COST OPTIMIZATION: Known domains that work well without browser
        this.httpOnlyDomains = new Set([
            'reuters.com',
            'apnews.com',
            'bbc.com',
            'cnn.com',
            'theguardian.com',
            'npr.org',
            'abcnews.go.com',
            'cbsnews.com',
            'nbcnews.com',
            'usatoday.com',
            'washingtonpost.com', // Often works with proper headers
            'nytimes.com', // Sometimes works
        ]);

        // Statistics for "all or nothing" strategy
        this.stats = {
            processed: 0,
            saved: 0,
            skipped: {
                urlResolutionFailed: 0,
                contentFetchFailed: 0,
                consentPageDetected: 0,
                extractionFailed: 0,
                textTooShort: 0,
                lowQualityContent: 0,
                noImages: 0,
                imageValidationFailed: 0,
                qualityTooLow: 0
            }
        };
    }

    /**
     * Check if browser mode is needed for a URL or content - COST OPTIMIZED
     * @param {string} url - URL to check
     * @param {string} html - HTML content to analyze
     * @returns {boolean} True if browser mode is recommended
     */
    needsBrowserMode(url, html = '') {
        try {
            const domain = new URL(url).hostname;

            // COST OPTIMIZATION: Skip browser mode if disabled globally
            if (CONFIG.COST_OPTIMIZATION?.USE_BROWSER_BY_DEFAULT === false &&
                !CONFIG.COST_OPTIMIZATION?.BROWSER_DETECTION_ENABLED) {
                return false;
            }

            // Google News articles always require browser mode
            if (url.includes('news.google.com/articles/')) {
                return true;
            }

            // COST OPTIMIZATION: Check if domain is known to work with HTTP only
            if (this.httpOnlyDomains.has(domain)) {
                log.debug(`Domain ${domain} known to work without browser mode`);
                return false;
            }

            // Check if domain is already marked for browser mode
            if (this.browserFallbackDomains.has(domain)) {
                return true;
            }

            // Check HTML content for browser mode indicators
            if (html) {
                const htmlLower = html.toLowerCase();
                const needsBrowser = this.browserFallbackIndicators.some(indicator =>
                    htmlLower.includes(indicator)
                );

                if (needsBrowser) {
                    this.browserFallbackDomains.add(domain);
                    log.info(`Domain ${domain} marked for browser mode fallback`);
                    return true;
                }

                // COST OPTIMIZATION: Check if content looks complete without JS
                const textLength = html.replace(/<[^>]*>/g, '').trim().length;
                if (textLength > 1000) {
                    log.debug(`Domain ${domain} has sufficient content without browser mode`);
                    this.httpOnlyDomains.add(domain); // Cache for future requests
                    return false;
                }
            }

            return false;
        } catch (error) {
            log.debug(`Error checking browser mode need for ${url}:`, error.message);
            return false;
        }
    }

    /**
     * Create and configure the crawler
     * @returns {CheerioCrawler|PlaywrightCrawler} Configured crawler
     */
    createCrawler() {
        const crawlerOptions = {
            maxConcurrency: CONFIG.CRAWLER.MAX_CONCURRENCY,
            maxRequestRetries: CONFIG.CRAWLER.MAX_RETRIES,
            requestHandlerTimeoutSecs: CONFIG.CRAWLER.REQUEST_TIMEOUT / 1000,
            requestHandler: this.handleRequest.bind(this),
            failedRequestHandler: this.handleFailedRequest.bind(this),
            // Session management
            useSessionPool: true,
            persistCookiesPerSession: true,
            sessionPoolOptions: this.sessionManager.getSessionPoolOptions(),
        };

        // Only add proxy configuration if it exists
        if (this.proxyConfiguration) {
            crawlerOptions.proxyConfiguration = this.proxyConfiguration;
        }

        if (this.useBrowser) {
            log.info('Using PlaywrightCrawler for JavaScript-rendered pages');
            return new PlaywrightCrawler({
                ...crawlerOptions,
                launchContext: {
                    launchOptions: {
                        headless: true,
                    },
                },
            });
        } else {
            log.info('Using CheerioCrawler for HTML parsing');
            return new CheerioCrawler(crawlerOptions);
        }
    }

    /**
     * Handle article request and extract content
     * @param {object} context - Crawler context
     */
    async handleRequest(context) {
        const { request, $, body, page, response, session } = context;
        const { userData } = request;

        try {
            this.stats.processed++;
            log.info(`Processing article ${this.stats.processed}: ${request.url}`);

            // STEP 1: Resolve Google News URLs to actual article URLs
            let finalUrl = request.url;
            let isGoogleNewsUrl = false;

            if (request.url.includes('news.google.com/articles/')) {
                log.info(`Google News URL detected: ${request.url}`);
                isGoogleNewsUrl = true;

                // Use the new Google News resolver
                finalUrl = await this.googleNewsResolver.resolveUrl(request.url, page);

                if (finalUrl === request.url) {
                    log.warning(`Failed to resolve Google News URL: ${request.url}`);
                    log.info(`SKIPPING ARTICLE - Cannot resolve Google News URL to actual article`);
                    this.stats.skipped.urlResolutionFailed++;
                    return; // Skip this article entirely
                }

                log.info(`Successfully resolved to: ${finalUrl}`);
            }

            // STEP 2: Fetch the actual article content
            let htmlContent;

            if (finalUrl === request.url && !isGoogleNewsUrl) {
                // Use existing content for non-Google News URLs
                htmlContent = this.useBrowser ? await page.content() : body;
            } else {
                // Fetch content from the resolved URL
                try {
                    log.info(`Fetching content from resolved URL: ${finalUrl}`);

                    if (this.useBrowser && page) {
                        // Use browser to fetch content (handles JavaScript)
                        costMonitor.trackBrowserRequest();
                        await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        htmlContent = await page.content();
                    } else {
                        // Use HTTP request with optimized proxy strategy
                        const proxyManager = this.useOptimizedProxy ? this.optimizedProxyManager : this.residentialProxyManager;
                        const proxyConfig = await proxyManager.getProxyConfig(finalUrl);

                        const requestConfig = {
                            url: finalUrl,
                            timeout: { request: CONFIG.CRAWLER.REQUEST_TIMEOUT },
                            retry: { limit: CONFIG.CRAWLER.RETRY_ATTEMPTS },
                            headers: {
                                'User-Agent': CONFIG.CRAWLER.DEFAULT_USER_AGENT,
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.5',
                                'Accept-Encoding': 'gzip, deflate',
                                'Connection': 'keep-alive',
                                'Upgrade-Insecure-Requests': '1',
                                'Referer': 'https://news.google.com/'
                            },
                            ...proxyConfig
                        };

                        if (proxyConfig.proxyUrl) {
                            const proxyType = this.useOptimizedProxy ? 'optimized' : 'residential';
                            log.debug(`Using ${proxyType} proxy for: ${finalUrl}`);
                        }

                        costMonitor.trackHttpRequest();
                        const response = await gotScraping(requestConfig);
                        htmlContent = response.body;
                    }

                    log.info(`Successfully fetched content from: ${finalUrl}`);
                } catch (error) {
                    log.error(`Failed to fetch content from ${finalUrl}: ${error.message}`);
                    log.info(`SKIPPING ARTICLE - Cannot fetch content`);
                    this.stats.skipped.contentFetchFailed++;
                    return; // Skip this article entirely
                }
            }

            // STEP 3: Check for consent pages or blocks (but don't skip, try to extract anyway)
            let hasConsentPage = false;
            if (this.sessionManager.isConsentPage(htmlContent, finalUrl)) {
                log.warning(`Consent page detected for ${finalUrl} - will try to extract content anyway`);
                hasConsentPage = true;
            }

            // STEP 4: Extract content using optimized or advanced extractor
            log.info(`Extracting content from: ${finalUrl}`);
            const extractionType = this.useOptimizedExtraction ? 'optimized' : 'full';
            costMonitor.trackContentExtraction(extractionType);

            const extractedContent = this.useOptimizedExtraction
                ? this.optimizedContentExtractor.extractContent(htmlContent, finalUrl)
                : this.advancedContentExtractor.extractContent(htmlContent, finalUrl);

            // STEP 5: Apply "All or Nothing" validation
            if (!extractedContent.success) {
                log.warning(`Content extraction failed for ${finalUrl}`);
                log.info(`SKIPPING ARTICLE - Content extraction failed`);
                this.stats.skipped.extractionFailed++;
                costMonitor.trackArticleProcessing(false); // Track skipped article
                return; // Skip this article entirely
            }

            // Check minimum text length requirement (RELAXED to 100 characters)
            if (!extractedContent.text || extractedContent.text.length < 100) {
                log.warning(`Article text too short: ${extractedContent.text ? extractedContent.text.length : 0} characters`);
                log.info(`SKIPPING ARTICLE - Text content insufficient (minimum 100 characters required)`);
                this.stats.skipped.textTooShort++;
                return; // Skip this article entirely
            }

            // Check for meaningful content (RELAXED - only skip obvious error pages)
            if (this.isLowQualityContent(extractedContent.text)) {
                log.warning(`Potential low quality content detected for ${finalUrl} - proceeding anyway`);
                // Don't skip - let the quality validation handle it
            }

            // Check images requirement (RELAXED - allow articles without images for now)
            if (!extractedContent.images || extractedContent.images.length === 0) {
                log.warning(`No images found for ${finalUrl} - proceeding anyway`);
                extractedContent.images = []; // Ensure it's an empty array, not null
            }

            log.info(`✅ Article passed all quality checks: ${extractedContent.text.length} chars, ${extractedContent.images.length} images`);

            // STEP 6: Validate images (RELAXED - don't require images)
            const workingImages = await this.validateImages(extractedContent.images);

            if (workingImages.length === 0) {
                log.warning(`No valid images for ${finalUrl} - proceeding without images`);
                // Don't skip - proceed without images
            }

            // STEP 7: Final quality validation
            const contentValidation = validateContentQuality(extractedContent, userData, workingImages);

            log.info(`Content quality: ${contentValidation.qualityLevel} (score: ${contentValidation.qualityScore})`);

            // RELAXED quality check - only skip if quality is extremely low
            if (!contentValidation.isValid || contentValidation.qualityScore < 20) {
                log.warning(`Article quality extremely low: ${contentValidation.qualityScore}`);
                if (contentValidation.issues.length > 0) {
                    log.warning(`Quality issues: ${contentValidation.issues.join(', ')}`);
                }
                log.info(`SKIPPING ARTICLE - Quality score extremely low (minimum 20 required)`);
                this.stats.skipped.qualityTooLow++;
                return; // Skip this article entirely
            } else if (contentValidation.qualityScore < 50) {
                log.warning(`Article quality low but acceptable: ${contentValidation.qualityScore}`);
            }

            // STEP 8: Create final record (only for high-quality articles)
            const record = {
                query: userData.query,
                title: cleanText(extractedContent.title || userData.title || 'No title'),
                url: finalUrl,
                originalGoogleUrl: isGoogleNewsUrl ? request.url : null,
                source: userData.source || 'Unknown',
                publishedAt: extractedContent.date || userData.pubDate || new Date().toISOString(),
                author: cleanText(extractedContent.author || ''),
                text: cleanText(extractedContent.text), // This is now guaranteed to be real article content
                description: cleanText(extractedContent.description || userData.description || ''),
                images: workingImages, // This is now guaranteed to have at least 1 valid image
                tags: extractedContent.tags || (userData.query ? [userData.query] : []),
                language: extractedContent.lang || 'unknown',
                scrapedAt: new Date().toISOString(),
                extractionSuccess: true, // Only successful extractions reach this point
                extractionMethod: extractedContent.extractionMethod || 'unknown',
                contentQuality: {
                    score: contentValidation.qualityScore,
                    level: contentValidation.qualityLevel,
                    isValid: contentValidation.isValid,
                    issues: contentValidation.issues,
                    warnings: contentValidation.warnings
                }
            };

            // STEP 9: Save the high-quality article
            await Dataset.pushData(record);
            this.stats.saved++;
            costMonitor.trackArticleProcessing(true); // Track successful processing

            log.info(`✅ SUCCESS: Saved high-quality article (${this.stats.saved}/${this.stats.processed})`);
            log.info(`   Title: ${record.title}`);
            log.info(`   URL: ${record.url}`);
            log.info(`   Text: ${record.text.length} characters`);
            log.info(`   Images: ${record.images.length} valid images`);
            log.info(`   Quality: ${record.contentQuality.level} (${record.contentQuality.score})`);
            log.info(`   Method: ${record.extractionMethod}`);
            log.info(`   Source: ${record.source}`);

        } catch (error) {
            const errorMessage = error.message || String(error);
            log.error(`Error processing article ${request.url}:`, errorMessage);
            this.failedUrls.push({
                url: request.url,
                error: errorMessage,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Check if content is low quality (error pages, paywalls, etc.)
     * @param {string} text - Article text content
     * @returns {boolean} True if content is low quality
     */
    isLowQualityContent(text) {
        if (!text) return true;

        const lowQualityPatterns = [
            // Error messages
            /please enable javascript/i,
            /javascript is disabled/i,
            /this site requires javascript/i,
            /cookies are disabled/i,
            /access denied/i,
            /403 forbidden/i,
            /404 not found/i,
            /page not found/i,
            /server error/i,
            /service unavailable/i,

            // Paywalls and subscriptions
            /subscription required/i,
            /subscribe to continue/i,
            /register to read/i,
            /sign up to continue/i,
            /login to continue/i,
            /paywall/i,
            /premium content/i,
            /subscriber exclusive/i,

            // GDPR and cookie notices
            /we use cookies/i,
            /cookie policy/i,
            /privacy policy/i,
            /gdpr/i,
            /data protection/i,

            // Bot detection
            /are you a robot/i,
            /captcha/i,
            /verify you are human/i,
            /unusual traffic/i,

            // Generic error content
            /something went wrong/i,
            /try again later/i,
            /temporarily unavailable/i
        ];

        // Check if text matches any low-quality patterns (RELAXED - only obvious errors)
        const criticalPatterns = [
            /404 not found/i,
            /page not found/i,
            /server error/i,
            /service unavailable/i,
            /access denied/i
        ];

        const hasCriticalPattern = criticalPatterns.some(pattern => pattern.test(text));

        if (hasCriticalPattern) {
            return true;
        }

        // Check for repetitive content (likely error pages)
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length < 3) {
            return true; // Too few sentences
        }

        // Check for very short sentences (likely navigation or error text)
        const avgSentenceLength = text.length / sentences.length;
        if (avgSentenceLength < 20) {
            return true; // Sentences too short
        }

        return false;
    }

    /**
     * Try multiple fallback strategies when primary content fetching fails
     * @param {string} targetUrl - The URL we're trying to fetch
     * @param {string} originalUrl - The original Google News URL
     * @param {object} userData - User data from the request
     * @returns {Promise<object>} Fallback result with success status and content
     */
    async tryFallbackStrategies(targetUrl, originalUrl, userData) {
        const strategies = [
            () => this.tryWithDifferentUserAgent(targetUrl),
            () => this.tryWithDelay(targetUrl),
            () => this.tryArchiveVersion(targetUrl),
            () => this.tryAlternativeSource(userData)
        ];

        for (const strategy of strategies) {
            try {
                const result = await strategy();
                if (result.success) {
                    return result;
                }
            } catch (error) {
                log.debug(`Fallback strategy failed: ${error.message}`);
            }
        }

        return { success: false };
    }

    /**
     * Try fetching with a different user agent (mobile vs desktop)
     * @param {string} url - URL to fetch
     * @returns {Promise<object>} Result with success status and content
     */
    async tryWithDifferentUserAgent(url) {
        try {
            log.debug(`Trying different user agent for: ${url}`);

            const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';

            const response = await gotScraping({
                url: url,
                timeout: { request: CONFIG.CRAWLER.REQUEST_TIMEOUT },
                retry: { limit: 1 },
                headers: {
                    'User-Agent': mobileUserAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                },
            });

            const htmlContent = response.body;
            const cheerioInstance = cheerio.load(htmlContent);

            // Check if we got meaningful content
            const textContent = cheerioInstance('body').text().trim();
            if (textContent.length > 500) {
                log.debug(`Mobile user agent strategy succeeded`);
                return {
                    success: true,
                    htmlContent,
                    cheerioInstance,
                    finalUrl: url
                };
            }
        } catch (error) {
            log.debug(`Mobile user agent strategy failed: ${error.message}`);
        }

        return { success: false };
    }

    /**
     * Try fetching with a delay (some sites block rapid requests)
     * @param {string} url - URL to fetch
     * @returns {Promise<object>} Result with success status and content
     */
    async tryWithDelay(url) {
        try {
            log.debug(`Trying with delay for: ${url}`);

            // Wait a bit before retrying
            await sleep(2000);

            const response = await gotScraping({
                url: url,
                timeout: { request: CONFIG.CRAWLER.REQUEST_TIMEOUT * 1.5 },
                retry: { limit: 1 },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://news.google.com/',
                },
            });

            const htmlContent = response.body;
            const cheerioInstance = cheerio.load(htmlContent);

            // Check if we got meaningful content
            const textContent = cheerioInstance('body').text().trim();
            if (textContent.length > 500) {
                log.debug(`Delay strategy succeeded`);
                return {
                    success: true,
                    htmlContent,
                    cheerioInstance,
                    finalUrl: url
                };
            }
        } catch (error) {
            log.debug(`Delay strategy failed: ${error.message}`);
        }

        return { success: false };
    }

    /**
     * Try to get content from archive.org or other archive services
     * @param {string} url - URL to fetch from archive
     * @returns {Promise<object>} Result with success status and content
     */
    async tryArchiveVersion(url) {
        try {
            log.debug(`Trying archive version for: ${url}`);

            // Try Wayback Machine
            const archiveUrl = `https://web.archive.org/web/${url}`;

            const response = await gotScraping({
                url: archiveUrl,
                timeout: { request: CONFIG.CRAWLER.REQUEST_TIMEOUT },
                retry: { limit: 1 },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            });

            const htmlContent = response.body;
            const cheerioInstance = cheerio.load(htmlContent);

            // Check if we got meaningful content (archive pages often have extra content)
            const textContent = cheerioInstance('body').text().trim();
            if (textContent.length > 1000) {
                log.debug(`Archive strategy succeeded`);
                return {
                    success: true,
                    htmlContent,
                    cheerioInstance,
                    finalUrl: url
                };
            }
        } catch (error) {
            log.debug(`Archive strategy failed: ${error.message}`);
        }

        return { success: false };
    }

    /**
     * Try to find alternative sources for the same story
     * @param {object} userData - User data containing story information
     * @returns {Promise<object>} Result with success status and content
     */
    async tryAlternativeSource(userData) {
        try {
            log.debug(`Trying alternative source for story: ${userData.title}`);

            // This is a placeholder for more advanced logic
            // In a real implementation, you might:
            // 1. Search for the same story on other news sites
            // 2. Use the story title to find alternative sources
            // 3. Check if the story is available on the publisher's main site

            // For now, we'll just return failure
            // This could be enhanced with actual alternative source searching

        } catch (error) {
            log.debug(`Alternative source strategy failed: ${error.message}`);
        }

        return { success: false };
    }

    /**
     * Handle failed requests
     * @param {object} context - Crawler context
     */
    async handleFailedRequest(context) {
        const { request, error } = context;

        const errorMessage = error.message || String(error);
        log.error(`Article crawling failed for ${request.url}:`, errorMessage);

        this.failedUrls.push({
            url: request.url,
            error: errorMessage,
            retryCount: request.retryCount,
            timestamp: new Date().toISOString(),
        });

        // Store failed URLs periodically
        if (this.failedUrls.length % 10 === 0) {
            await Actor.setValue(CONFIG.STORAGE.FAILED_URLS_KEY, this.failedUrls);
        }
    }

    /**
     * Validate image URLs
     * @param {Array<object|string>} images - Array of image objects or URLs
     * @returns {Promise<Array<object>>} Array of working image objects
     */
    async validateImages(images) {
        if (!images || images.length === 0) {
            return [];
        }

        const workingImages = [];
        const validationPromises = [];

        // COST OPTIMIZATION: Process images efficiently
        if (CONFIG.IMAGE?.SKIP_VALIDATION) {
            // Use pattern-based validation (no HTTP requests)
            for (const image of images) {
                const imageUrl = typeof image === 'string' ? image : image.url;
                const imageObj = typeof image === 'string' ? { url: image, type: 'unknown', alt: '', caption: '' } : image;

                if (!imageUrl) continue;

                const isValid = await validateImageUrl(imageUrl); // Uses pattern validation
                costMonitor.trackImageValidation('pattern');
                if (isValid) {
                    workingImages.push(imageObj);
                }
            }
        } else {
            // Original HTTP validation for non-optimized mode
            for (let i = 0; i < images.length; i += CONFIG.IMAGE.MAX_CONCURRENT_VALIDATIONS) {
                const batch = images.slice(i, i + CONFIG.IMAGE.MAX_CONCURRENT_VALIDATIONS);

                const batchPromises = batch.map(async (image) => {
                    // Handle both object format (new) and string format (legacy)
                    const imageUrl = typeof image === 'string' ? image : image.url;
                    const imageObj = typeof image === 'string' ? { url: image, type: 'unknown', alt: '', caption: '' } : image;

                    if (!imageUrl) return;

                    const isValid = await validateImageUrl(imageUrl, gotScraping);
                    costMonitor.trackImageValidation('http');
                    if (isValid) {
                        workingImages.push(imageObj);
                    }
                });

                validationPromises.push(...batchPromises);

                // Wait for batch to complete before processing next batch
                await Promise.allSettled(batchPromises);

                // Small delay between batches
                if (i + CONFIG.IMAGE.MAX_CONCURRENT_VALIDATIONS < images.length) {
                    await sleep(100);
                }
            }
        }

        log.debug(`Image validation: ${workingImages.length}/${images.length} images are accessible`);
        return workingImages;
    }

    /**
     * Create browser crawler for fallback
     * @param {Array} requests - Requests that need browser mode
     * @returns {Promise<void>}
     */
    async runBrowserFallback(requests) {
        if (requests.length === 0) return;

        log.info(`Running browser fallback for ${requests.length} requests`);

        // Temporarily switch to browser mode
        const originalUseBrowser = this.useBrowser;
        this.useBrowser = true;

        try {
            const browserCrawler = this.createCrawler();
            await browserCrawler.run(requests);
        } finally {
            // Restore original setting
            this.useBrowser = originalUseBrowser;
        }
    }

    /**
     * Crawl articles from RSS items
     * @param {Array} rssItems - Array of RSS items
     * @param {string} query - Original search query
     * @returns {Promise<void>}
     */
    async crawlArticles(rssItems, query) {
        if (!rssItems || rssItems.length === 0) {
            log.warning('No RSS items to crawl');
            return;
        }

        log.info(`Starting article crawling for ${rssItems.length} articles`);

        // Prepare requests
        const requests = rssItems.map((item) => {
            const realUrl = extractRealUrl(item.link);

            return {
                url: realUrl,
                userData: {
                    ...item,
                    query,
                    originalGoogleUrl: item.link,
                },
            };
        });

        // Check if any URLs are Google News URLs and force browser mode if needed
        const hasGoogleNewsUrls = requests.some(req => req.url.includes('news.google.com/articles/'));
        if (hasGoogleNewsUrls && !this.useBrowser) {
            log.info('Google News URLs detected - enabling browser mode for all requests');
            this.useBrowser = true;
        }

        // Create and run main crawler
        const crawler = this.createCrawler();
        await crawler.run(requests);

        // Check if any URLs need browser mode fallback
        const browserFallbackRequests = this.failedUrls
            .filter(failedUrl =>
                failedUrl.error &&
                (failedUrl.error.includes('Browser mode required') ||
                 failedUrl.error.includes('retrying with PlaywrightCrawler'))
            )
            .map(failedUrl => ({
                url: failedUrl.url,
                userData: requests.find(req => req.url === failedUrl.url)?.userData || {},
            }));

        if (browserFallbackRequests.length > 0) {
            log.info(`Running browser mode fallback for ${browserFallbackRequests.length} failed requests`);
            log.debug('Browser fallback requests:', browserFallbackRequests.map(req => req.url));
            await this.runBrowserFallback(browserFallbackRequests);
        }

        // Store failed URLs
        if (this.failedUrls.length > 0) {
            await Actor.setValue(CONFIG.STORAGE.FAILED_URLS_KEY, this.failedUrls);
            log.warning(`${this.failedUrls.length} articles failed to process`);
        }

        log.info('Article crawling completed');

        // Print final statistics
        this.printFinalStatistics();

        // Cleanup resources
        await this.cleanup();
    }

    /**
     * Print final statistics for the "all or nothing" strategy
     */
    printFinalStatistics() {
        const totalSkipped = Object.values(this.stats.skipped).reduce((sum, count) => sum + count, 0);
        const successRate = this.stats.processed > 0 ? (this.stats.saved / this.stats.processed * 100).toFixed(1) : 0;

        log.info('\n' + '='.repeat(60));
        log.info('📊 FINAL EXTRACTION STATISTICS');
        log.info('='.repeat(60));
        log.info(`Total articles processed: ${this.stats.processed}`);
        log.info(`Successfully saved: ${this.stats.saved} (${successRate}%)`);
        log.info(`Total skipped: ${totalSkipped} (${(100 - successRate).toFixed(1)}%)`);
        log.info('');
        log.info('📋 SKIP REASONS:');
        log.info(`  • URL resolution failed: ${this.stats.skipped.urlResolutionFailed}`);
        log.info(`  • Content fetch failed: ${this.stats.skipped.contentFetchFailed}`);
        log.info(`  • Consent page detected: ${this.stats.skipped.consentPageDetected}`);
        log.info(`  • Content extraction failed: ${this.stats.skipped.extractionFailed}`);
        log.info(`  • Text too short (<300 chars): ${this.stats.skipped.textTooShort}`);
        log.info(`  • Low quality content: ${this.stats.skipped.lowQualityContent}`);
        log.info(`  • No images found: ${this.stats.skipped.noImages}`);
        log.info(`  • Image validation failed: ${this.stats.skipped.imageValidationFailed}`);
        log.info(`  • Quality score too low: ${this.stats.skipped.qualityTooLow}`);
        log.info('='.repeat(60));

        if (this.stats.saved === 0) {
            log.error('❌ NO ARTICLES SAVED - All articles were skipped due to quality issues');
        } else if (successRate >= 50) {
            log.info(`✅ GOOD SUCCESS RATE - ${successRate}% of articles met quality standards`);
        } else {
            log.warning(`⚠️  LOW SUCCESS RATE - Only ${successRate}% of articles met quality standards`);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        try {
            // Cleanup Google News resolver
            if (this.googleNewsResolver) {
                await this.googleNewsResolver.cleanup();
            }

            // Cleanup residential proxy manager
            if (this.residentialProxyManager) {
                this.residentialProxyManager.cleanup();
            }

            log.info('Article crawler cleanup completed');
        } catch (error) {
            log.error('Error during cleanup:', error.message);
        }
    }

    /**
     * Get failed URLs
     * @returns {Array} Array of failed URLs
     */
    getFailedUrls() {
        return this.failedUrls;
    }
}

export default ArticleCrawler;
