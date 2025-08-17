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
import { GoogleNewsResolver } from './google-news-resolver.js';
import { ProxyManager } from './proxy-manager.js';
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
        // Initialize unified content extractor (replaces all previous extractors)
        this.contentExtractor = new ContentExtractor();

        // Initialize unified proxy manager with cost optimization
        this.proxyManager = new ProxyManager(proxyConfiguration);

        // Initialize production-grade Google News resolver with unified proxy support
        // Increase minRequestInterval to reduce 429 rate limiting from Google News
        this.googleNewsResolver = new GoogleNewsResolver(this.proxyManager, {
            enablePersistence: true,
            cacheFile: 'storage/google-news-cache.json',
            maxCacheSize: 50000,
            cacheExpiryHours: 24,
            minRequestInterval: 2000 // 2 seconds between requests
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

        // Current maxItems limit for the crawling session
        this.currentMaxItemsLimit = null;
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
        try {
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

            // Only add proxy configuration if it exists and is valid
            if (this.proxyConfiguration && typeof this.proxyConfiguration === 'object') {
                crawlerOptions.proxyConfiguration = this.proxyConfiguration;
            } else if (this.proxyConfiguration) {
                log.warning('Invalid proxy configuration provided, skipping proxy setup');
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
        } catch (error) {
            log.error('Failed to create crawler:', error.message);
            // Return a basic CheerioCrawler as fallback
            return new CheerioCrawler({
                maxConcurrency: 1,
                requestHandler: this.handleRequest.bind(this),
                failedRequestHandler: this.handleFailedRequest.bind(this),
            });
        }
    }

	    // Browser consent auto-accept helper (class method)
	    async acceptConsentIfPresent(page, urlForDomain) {
	        if (!page) return false;
	        try {
	            const domain = new URL(urlForDomain || page.url()).hostname;
	            const selectors = [
	                ...(CONFIG.CONSENT_HANDLING.DOMAIN_SELECTORS[domain] || []),
	                ...CONFIG.CONSENT_HANDLING.GENERIC_SELECTORS,
	            ];
	            for (const sel of selectors) {
	                try {
	                    const locator = page.locator(sel);
	                    const count = await locator.count();
	                    if (count > 0) {
	                        await locator.first().click({ timeout: 2000 }).catch(() => {});
	                        await page.waitForTimeout(CONFIG.CONSENT_HANDLING.WAIT_AFTER_CLICK_MS);
	                        log.info(`Clicked consent using selector: ${sel}`);
	                        return true;
	                    }
	                } catch {}
	            }
	        } catch {}
	        return false;
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
                        // Use HTTP request with unified proxy strategy
                        const proxyConfig = await this.proxyManager.getProxyConfig(finalUrl);

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
            const extractionType = CONFIG.COST_OPTIMIZATION?.SINGLE_EXTRACTION_STRATEGY ? 'optimized' : 'full';
            costMonitor.trackContentExtraction(extractionType);

            const extractedContent = this.contentExtractor.extractContent(htmlContent, finalUrl);


	            // DEFER BROWSER FALLBACK: Mark for later batch processing instead of inline
	            if ((!extractedContent.success || hasConsentPage) && !this.useBrowser) {
	                // Add to failed URLs for later browser fallback processing
	                this.failedUrls.push({
	                    url: finalUrl,
	                    error: hasConsentPage ? 'Browser mode required - consent page detected' : 'Browser mode required - static extraction failed',
	                    timestamp: new Date().toISOString(),
	                    userData: userData
	                });

	                log.info(`Static extraction ${extractedContent.success ? 'succeeded but consent detected' : 'failed'} — marking for browser fallback: ${finalUrl}`);

	                // Skip this article for now - it will be processed in browser fallback
	                this.stats.skipped.consentPageDetected++;
	                return;
	            }

            // STEP 5: Apply "All or Nothing" validation
            if (!extractedContent.success) {
                log.warning(`Content extraction failed for ${finalUrl}`);
                log.info(`SKIPPING ARTICLE - Content extraction failed`);
                this.stats.skipped.extractionFailed++;
                costMonitor.trackArticleProcessing(false); // Track skipped article
                return; // Skip this article entirely
            }

            // STEP 5.1: Apply content length validation - 300+ characters required
            if (!extractedContent.text || extractedContent.text.length < 300) {
                log.warning(`Article text too short: ${extractedContent.text ? extractedContent.text.length : 0} characters`);
                log.info(`SKIPPING ARTICLE - Text content insufficient (minimum 300 characters required)`);
                this.stats.skipped.textTooShort++;
                return; // Skip this article entirely
            }

            // STEP 5.2: Check for meaningful content (strict - skip error pages and low quality)
            if (this.isLowQualityContent(extractedContent.text)) {
                log.warning(`Low quality content detected for ${finalUrl}`);
                log.info(`SKIPPING ARTICLE - Content appears to be error page or low quality`);
                this.stats.skipped.lowQualityContent++;
                return; // Skip this article entirely
            }

            // STEP 5.3: Images requirement - STRICT 'all or nothing' (must have images)
            if (!extractedContent.images || extractedContent.images.length === 0) {
                log.warning(`No images found for ${finalUrl}`);
                log.info(`SKIPPING ARTICLE - No images found (all-or-nothing policy)`);
                this.stats.skipped.noImages++;
                return; // Skip this article entirely
            }

            // STEP 6: Validate images - must have at least 1 working image
            let workingImages = await this.validateImages(extractedContent.images);

            if (!workingImages || workingImages.length === 0) {
                log.warning(`No images passed validation for ${finalUrl}`);
                log.info(`SKIPPING ARTICLE - Image validation failed (all-or-nothing policy)`);
                this.stats.skipped.imageValidationFailed++;
                return; // Skip this article entirely
            }

            log.info(`✅ Article passed quality checks: ${extractedContent.text.length} chars, ${workingImages.length} images`);

            // STEP 7: Final quality validation (RELAXED - lower threshold)
            const contentValidation = validateContentQuality(extractedContent, userData, workingImages);

            log.info(`Content quality: ${contentValidation.qualityLevel} (score: ${contentValidation.qualityScore})`);

            // RELAXED quality check - lower threshold for better success rate
            if (!contentValidation.isValid || contentValidation.qualityScore < 25) {
                log.warning(`Article quality too low: ${contentValidation.qualityScore}`);
                if (contentValidation.issues.length > 0) {
                    log.warning(`Quality issues: ${contentValidation.issues.join(', ')}`);
                }
                log.info(`SKIPPING ARTICLE - Quality score too low (minimum 25 required)`);
                this.stats.skipped.qualityTooLow++;
                return; // Skip this article entirely
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

            // STEP 9: Check maxItems limit before saving (atomic check and increment)
            if (this.currentMaxItemsLimit && this.stats.saved >= this.currentMaxItemsLimit) {
                log.info(`✋ LIMIT REACHED: Already saved ${this.stats.saved} articles (limit: ${this.currentMaxItemsLimit})`);
                log.info(`   Skipping article: ${record.title}`);
                this.stats.skipped.maxItemsReached = (this.stats.skipped.maxItemsReached || 0) + 1;
                return;
            }

            // STEP 10: Save the high-quality article
            try {
                await Dataset.pushData(record);
                log.debug(`Dataset.pushData completed successfully for: ${record.title}`);
            } catch (error) {
                log.error(`Dataset.pushData failed: ${error.message}`);
                throw error;
            }
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

            // Check if we've reached the limit and should stop the crawler
            if (this.currentMaxItemsLimit && this.stats.saved >= this.currentMaxItemsLimit) {
                log.info(`🎯 TARGET REACHED: Saved ${this.stats.saved}/${this.currentMaxItemsLimit} articles - stopping crawler`);
                // Signal the crawler to stop by throwing a special error
                throw new Error('MAX_ITEMS_REACHED');
            }

        } catch (error) {
            // Handle the special MAX_ITEMS_REACHED signal
            if (error.message === 'MAX_ITEMS_REACHED') {
                throw error; // Re-throw to stop the crawler
            }

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

        // Check for very short sentences (likely navigation or error text) - RELAXED
        const avgSentenceLength = text.length / sentences.length;
        if (avgSentenceLength < 15) {
            return true; // Sentences too short (relaxed from 20 to 15)
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

        const errorMessage = error.message || error.toString() || 'Unknown error';
        log.error(`Article crawling failed for ${request.url}: ${errorMessage}`);

        this.failedUrls.push({
            url: request.url,
            error: errorMessage,
            retryCount: request.retryCount,
            timestamp: new Date().toISOString(),
            userData: request.userData || {}, // Preserve userData for better matching
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
        log.debug('Browser fallback request URLs:', requests.map(r => r.url));

        // Temporarily switch to browser mode
        const originalUseBrowser = this.useBrowser;
        this.useBrowser = true;

        try {
            const browserCrawler = this.createCrawler();
            log.debug(`Created browser crawler: ${browserCrawler.constructor.name}`);

            // Add detailed request debugging
            log.debug(`About to run browser crawler with ${requests.length} requests`);
            log.debug('Request details:', requests.map(r => ({ url: r.url, userData: r.userData })));

            // Validate request format
            const validRequests = requests.filter(req => req && req.url);
            log.debug(`Valid requests: ${validRequests.length}/${requests.length}`);

            if (validRequests.length === 0) {
                log.warning('No valid requests found for browser fallback');
                return;
            }

            // Run the crawler with requests directly
            await browserCrawler.run(validRequests);

            // Ensure all async operations complete
            await sleep(500);

            log.debug(`Browser fallback completed for ${requests.length} requests`);
        } catch (error) {
            log.error(`Browser fallback error: ${error.message}`);
            log.error(`Browser fallback error stack: ${error.stack}`);
            throw error;
        } finally {
            // Restore original setting
            this.useBrowser = originalUseBrowser;
        }
    }

    /**
     * Crawl articles with quality-based target - continue until we get enough complete articles
     * @param {object} params - Parameters including rssFetcher, query, maxItems, etc.
     * @returns {Promise<object>} Statistics object with saved, totalProcessed, target, and success
     */
    async crawlWithQualityTarget(params) {
        const { rssFetcher, query, region, language, maxItems, dateFrom, dateTo } = params;

        if (maxItems <= 0) {
            log.info('maxItems is 0 or negative, processing all available articles');
            // Fallback to original behavior for unlimited processing
            const articles = await rssFetcher.fetchRssItems({
                query, region, language, maxItems: 0, dateFrom, dateTo,
            });

            if (articles.size === 0) {
                log.warning('No articles found in RSS feeds');
                return {
                    saved: 0,
                    totalProcessed: 0,
                    target: 0,
                    success: true
                };
            }

            const statsBefore = { ...this.stats };
            await this.crawlArticles(Array.from(articles.values()), query);
            const saved = this.stats.saved - statsBefore.saved;

            return {
                saved: saved,
                totalProcessed: articles.size,
                target: 0,
                success: true
            };
        }

        log.info(`Starting quality-targeted crawling for ${maxItems} complete articles`);

        // Reset RSS fetcher for new session - but keep returnedArticles to avoid duplicates across batches
        rssFetcher.resetArticles(true);

        let qualityArticlesSaved = 0;
        let totalArticlesProcessed = 0;
        let batchNumber = 1;
        const maxBatches = 10; // Prevent infinite loops

        // More conservative batch size calculation to avoid over-fetching
        // For very small maxItems, use minimal batches to avoid unnecessary requests
        let batchSize;
        if (maxItems === 1) {
            batchSize = 3; // For single item requests, start with just 3 articles
        } else if (maxItems <= 3) {
            batchSize = maxItems * 2; // 2x multiplier for very small requests
        } else if (maxItems <= 10) {
            batchSize = Math.max(maxItems * 1.5, 8); // 1.5x multiplier, min 8
        } else if (maxItems <= 20) {
            batchSize = Math.max(maxItems * 1.3, 15); // 1.3x multiplier, min 15
        } else {
            batchSize = Math.max(maxItems * 1.2, 25); // 1.2x multiplier for larger requests, min 25
        }

        log.info(`Calculated initial batch size: ${batchSize} for maxItems: ${maxItems}`);

        while (qualityArticlesSaved < maxItems && batchNumber <= maxBatches) {
            // Calculate how many more articles we actually need
            const articlesStillNeeded = maxItems - qualityArticlesSaved;

            // Adjust batch size based on remaining need and previous success rate
            let currentBatchSize = batchSize;
            if (batchNumber > 1) {
                // After first batch, be more conservative based on success rate
                const overallSuccessRate = qualityArticlesSaved / totalArticlesProcessed;
                if (overallSuccessRate > 0.3) {
                    // Good success rate - use smaller batches
                    currentBatchSize = Math.min(articlesStillNeeded * 2, batchSize);
                } else if (overallSuccessRate > 0.1) {
                    // Moderate success rate - use medium batches
                    currentBatchSize = Math.min(articlesStillNeeded * 4, batchSize);
                } else {
                    // Low success rate - keep larger batches but cap at original size
                    currentBatchSize = Math.min(batchSize, 100);
                }
                log.info(`Adjusted batch size from ${batchSize} to ${currentBatchSize} (success rate: ${(overallSuccessRate * 100).toFixed(1)}%)`);
            }

            log.info(`=== Batch ${batchNumber}: Fetching ${currentBatchSize} articles (need ${articlesStillNeeded} more) ===`);

            // Fetch a batch of articles
            const articles = await rssFetcher.fetchRssItems({
                query, region, language, maxItems: currentBatchSize, dateFrom, dateTo,
            });

            if (articles.size === 0) {
                log.warning('No more articles available from RSS feeds');
                break;
            }

            const articlesArray = Array.from(articles.values());
            log.info(`Batch ${batchNumber}: Processing ${articlesArray.length} articles`);

            // Check if we got any new articles compared to previous batch
            if (batchNumber > 1 && articlesArray.length === 0) {
                log.warning('No new articles found in this batch, stopping to avoid reprocessing');
                break;
            }

            // Calculate how many more articles we need
            const articlesNeeded = maxItems - qualityArticlesSaved;

            // Process this batch with maxItems limit and get exact number of saved articles (includes browser fallback)
            log.info(`🔄 Starting batch ${batchNumber} processing (including any browser fallback)...`);
            const qualityArticlesFromBatch = await this.crawlArticles(articlesArray, query, articlesNeeded);

            // Update counters using the definitive per-call result
            qualityArticlesSaved += qualityArticlesFromBatch;
            totalArticlesProcessed += articlesArray.length;

            // Log batch results AFTER all processing (including browser fallback) is complete
            log.info(`✅ Batch ${batchNumber} completed: ${qualityArticlesFromBatch} quality articles saved (${qualityArticlesSaved}/${maxItems} total)`);

            // If we have enough quality articles, we're done
            if (qualityArticlesSaved >= maxItems) {
                log.info(`✅ Target reached! Successfully extracted ${qualityArticlesSaved} complete articles`);
                break;
            }

            // Analyze batch performance for logging
            const qualityRate = articlesArray.length > 0 ? qualityArticlesFromBatch / articlesArray.length : 0;
            log.info(`Batch ${batchNumber} quality rate: ${(qualityRate * 100).toFixed(1)}% (${qualityArticlesFromBatch}/${articlesArray.length})`);

            // Check for rate limiting issues (429 errors)
            const rateLimitErrors = this.failedUrls.filter(f => f.error && f.error.includes('429')).length;
            if (rateLimitErrors > articlesArray.length * 0.5) {
                log.warning(`High rate of 429 errors (${rateLimitErrors}/${articlesArray.length}). Google News is rate limiting our requests.`);
                log.info('💡 RATE LIMITING DETECTED - This is a temporary issue. Solutions:');
                log.info('   1. Wait 10-30 minutes before running again');
                log.info('   2. Try a different query or region');
                log.info('   3. Use testUrls with direct article URLs instead of Google News');
                log.info('   4. This is normal during development/testing - not a code issue');
                break;
            }

            // Early termination if we're getting very poor results and have processed many articles
            if (batchNumber >= 2 && qualityRate < 0.05 && totalArticlesProcessed > maxItems * 5) {
                log.warning(`Very low quality rate (${(qualityRate * 100).toFixed(1)}%) after processing ${totalArticlesProcessed} articles. Stopping to avoid excessive costs.`);
                break;
            }

            batchNumber++;

            // Small delay between batches to be respectful
            await sleep(2000);
        }

        if (qualityArticlesSaved < maxItems) {
            const rateLimitErrors = this.failedUrls.filter(f => f.error && f.error.includes('429')).length;
            if (rateLimitErrors > 0) {
                log.warning(`Could not reach target due to rate limiting. Got ${qualityArticlesSaved} quality articles from ${totalArticlesProcessed} total articles processed.`);
                log.info('🔄 RATE LIMITING SOLUTION: Try again in 10-30 minutes or use direct article URLs in testUrls');
            } else {
                log.warning(`Could not reach target of ${maxItems} articles. Got ${qualityArticlesSaved} quality articles from ${totalArticlesProcessed} total articles processed.`);
            }
        }

        log.info(`Quality-targeted crawling completed: ${qualityArticlesSaved}/${maxItems} target articles saved`);

        return {
            saved: qualityArticlesSaved,
            totalProcessed: totalArticlesProcessed,
            target: maxItems,
            success: qualityArticlesSaved >= maxItems
        };
    }

    /**
     * Crawl articles from RSS items
     * @param {Array} rssItems - Array of RSS items
     * @param {string} query - Original search query
     * @param {number} maxItemsLimit - Maximum number of articles to save (optional)
     * @returns {Promise<number>} Number of successfully saved high-quality articles in this call
     */
    async crawlArticles(rssItems, query, maxItemsLimit = null) {
        if (!rssItems || rssItems.length === 0) {
            log.warning('No RSS items to crawl');
            return 0;
        }

        log.info(`Starting article crawling for ${rssItems.length} articles${maxItemsLimit ? ` (limit: ${maxItemsLimit})` : ''}`);

        // Track saved count at start of this call to compute per-call savings precisely
        const savedAtStart = this.stats.saved;

        // Store the maxItemsLimit in the instance for use in handleRequest
        this.currentMaxItemsLimit = maxItemsLimit;

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

        // Check if any URLs are Google News URLs. Do NOT force global browser mode.
        // We'll resolve via HTTP first and use targeted browser fallback only if needed.
        const hasGoogleNewsUrls = requests.some(req => req.url.includes('news.google.com/articles/'));
        if (hasGoogleNewsUrls) {
            log.debug('Google News URLs detected - resolving via HTTP first; browser fallback will be per-URL if required');
        }

        // Create and run main crawler
        const crawler = this.createCrawler();
        log.info(`🚀 Starting main crawler for ${requests.length} articles...`);

        try {
            await crawler.run(requests);
            log.info(`📊 Main crawler completed: ${this.stats.saved - savedAtStart} articles saved from initial processing`);
        } catch (error) {
            // Handle the special MAX_ITEMS_REACHED signal
            if (error.message === 'MAX_ITEMS_REACHED') {
                log.info('🎯 Crawler stopped: Maximum items limit reached');
                // Continue with normal flow - don't treat this as an error
            } else {
                // Re-throw other errors
                throw error;
            }
        }

        // Check if any URLs need browser mode fallback
        const browserFallbackRequests = this.failedUrls
            .filter(failedUrl =>
                failedUrl.error &&
                (failedUrl.error.includes('Browser mode required') ||
                 failedUrl.error.includes('retrying with PlaywrightCrawler') ||
                 failedUrl.error.includes('429') ||  // Rate limiting - try browser mode
                 failedUrl.error.includes('Request blocked') ||  // Blocked requests
                 failedUrl.error.includes('Access denied') ||  // Access issues
                 failedUrl.error.includes('Cloudflare'))  // Cloudflare protection
            )
            .map(failedUrl => {
                // Find the original request by URL (exact match first, then try to find by any URL field)
                let originalRequest = requests.find(req => req.url === failedUrl.url);

                // If not found, it might be because failedUrl contains a resolved URL
                // Try to find by userData if available
                if (!originalRequest && failedUrl.userData) {
                    originalRequest = requests.find(req =>
                        req.userData &&
                        (req.userData.originalGoogleUrl === failedUrl.userData.originalGoogleUrl ||
                         req.userData.link === failedUrl.userData.link)
                    );
                }

                return {
                    url: failedUrl.url,
                    userData: originalRequest?.userData || failedUrl.userData || {},
                };
            });

        if (browserFallbackRequests.length > 0) {
            log.info(`🔄 Running browser mode fallback for ${browserFallbackRequests.length} failed requests`);
            log.debug('Browser fallback requests:', browserFallbackRequests.map(req => req.url));

            // Add delay before browser fallback to help with rate limiting
            const rateLimitErrors = this.failedUrls.filter(f => f.error && f.error.includes('429')).length;
            if (rateLimitErrors > 0) {
                log.info(`Detected ${rateLimitErrors} rate limit errors. Adding 5-second delay before browser fallback...`);
                await sleep(5000);
            }

            // Track saves before browser fallback
            const savedBeforeFallback = this.stats.saved;

            try {
                await this.runBrowserFallback(browserFallbackRequests);

                // Ensure browser fallback has fully completed by adding a small delay
                await sleep(1000);

                // Log browser fallback results
                const savedFromFallback = this.stats.saved - savedBeforeFallback;
                if (savedFromFallback > 0) {
                    log.info(`✅ Browser fallback completed: ${savedFromFallback} additional articles saved`);
                } else {
                    log.info(`⚠️ Browser fallback completed: no additional articles saved`);
                }
            } catch (error) {
                log.error(`Browser fallback failed: ${error.message}`);
                // Continue with the process even if browser fallback fails
            }
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

        // Return number of saved items during this call (includes any browser fallback saves)
        const savedThisCall = this.stats.saved - savedAtStart;
        return savedThisCall;
    }

    /**
     * Print final statistics for the "all or nothing" strategy
     */
    printFinalStatistics() {
        const totalSkipped = Object.values(this.stats.skipped).reduce((sum, count) => sum + count, 0);
        const totalAttempted = this.stats.processed + (this.stats.failed || 0) + totalSkipped;
        const successRate = this.stats.processed > 0 ? (this.stats.saved / this.stats.processed * 100).toFixed(1) : 0;
        const overallRate = totalAttempted > 0 ? (this.stats.saved / totalAttempted * 100).toFixed(1) : 0;

        log.info('\n' + '='.repeat(60));
        log.info('📊 FINAL EXTRACTION STATISTICS');
        log.info('='.repeat(60));
        log.info(`🔍 Total articles attempted: ${totalAttempted}`);
        log.info(`📊 Articles processed: ${this.stats.processed}`);
        log.info(`✅ Successfully saved: ${this.stats.saved} (${successRate}% of processed)`);
        log.info(`❌ Failed to process: ${this.stats.failed || 0}`);
        log.info(`⏭️ Skipped (quality issues): ${totalSkipped}`);
        log.info(`🎯 Overall success rate: ${overallRate}% (saved/attempted)`);
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
        log.info(`  • Max items limit reached: ${this.stats.skipped.maxItemsReached || 0}`);
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

            // Cleanup unified proxy manager
            if (this.proxyManager) {
                this.proxyManager.cleanup();
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
