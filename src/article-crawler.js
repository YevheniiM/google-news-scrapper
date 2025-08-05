/**
 * Article crawler for extracting full content from news articles
 * Stage B: Crawl every article URL and extract content
 */

import { Actor, Dataset } from 'apify';
import { CheerioCrawler, PlaywrightCrawler, log } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { CONFIG } from './config.js';
import { extractRealUrl, extractImages, validateImageUrl, cleanText, sleep, decodeGoogleNewsUrl } from './utils.js';
import { SessionManager } from './session-manager.js';
import { ContentExtractor } from './content-extractor.js';

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
        this.browserFallbackDomains = new Set(); // Domains that require browser mode
        this.browserFallbackIndicators = [
            'javascript is required',
            'enable javascript',
            'js is disabled',
            'noscript',
            'cloudflare',
            'please wait',
            'checking your browser',
        ];
    }

    /**
     * Check if browser mode is needed for a URL or content
     * @param {string} url - URL to check
     * @param {string} html - HTML content to analyze
     * @returns {boolean} True if browser mode is recommended
     */
    needsBrowserMode(url, html = '') {
        try {
            const domain = new URL(url).hostname;

            // Google News articles always require browser mode
            if (url.includes('news.google.com/articles/')) {
                return true;
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
            log.info(`Processing article: ${request.url}`);

            // Handle Google News URLs by decoding them first
            let finalUrl = request.url;
            if (request.url.includes('news.google.com/articles/')) {
                const decodedUrl = decodeGoogleNewsUrl(request.url);
                if (decodedUrl !== request.url) {
                    log.info(`Decoded Google News URL: ${request.url} -> ${decodedUrl}`);
                    finalUrl = decodedUrl;

                    // If we have a decoded URL, navigate to it directly
                    if (this.useBrowser) {
                        await page.goto(decodedUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    }
                } else {
                    // If decoding failed, try the browser redirect approach
                    if (this.useBrowser) {
                        try {
                            // Wait for page to load
                            await page.waitForLoadState('domcontentloaded', { timeout: 3000 });

                            // Try to find and click the article link
                            const articleLink = await page.locator('article a, .article a, [data-n-tid] a').first();
                            if (await articleLink.count() > 0) {
                                await articleLink.click();
                                await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
                                finalUrl = page.url();
                                log.info(`Clicked through Google News redirect: ${request.url} -> ${finalUrl}`);
                            } else {
                                finalUrl = page.url();
                                log.info(`No redirect link found, using current URL: ${finalUrl}`);
                            }
                        } catch (error) {
                            // If any error, just use current URL
                            finalUrl = page.url();
                            log.warning(`Error handling Google News redirect: ${error.message}, using current URL: ${finalUrl}`);
                        }
                    }
                }
            }

            // Check for consent pages or blocks
            const htmlContent = this.useBrowser ? await page.content() : body;

            if (this.sessionManager.isConsentPage(htmlContent, request.url)) {
                log.warning(`Consent page detected for ${request.url}`);

                // Try to handle the blocked response
                const shouldRetry = await this.sessionManager.handleBlockedResponse(context);
                if (shouldRetry) {
                    throw new Error('Consent page detected - retrying with different session');
                } else {
                    throw new Error('Consent page detected - unable to bypass');
                }
            }

            // Check if browser mode is needed (only for Cheerio crawler)
            if (!this.useBrowser && this.needsBrowserMode(request.url, htmlContent)) {
                log.warning(`Browser mode needed for ${request.url} - content requires JavaScript`);
                throw new Error('Browser mode required - retrying with PlaywrightCrawler');
            }

            // Extract content using enhanced extractor
            const extractedContent = this.contentExtractor.extractContent(htmlContent, $);

            // Extract images (only pass $ if it exists - for Cheerio mode)
            const images = extractImages(extractedContent, $ || null);

            // Validate images
            const workingImages = await this.validateImages(images);

            // Prepare final record
            const record = {
                query: userData.query,
                title: cleanText(extractedContent.title || userData.title || 'No title'),
                url: finalUrl,
                source: userData.source || 'Unknown',
                publishedAt: userData.pubDate || extractedContent.date || new Date().toISOString(),
                author: cleanText(extractedContent.author || ''),
                text: cleanText(extractedContent.text || ''),
                description: cleanText(extractedContent.description || userData.description || ''),
                images: workingImages,
                tags: extractedContent.tags || [],
                language: extractedContent.lang || 'unknown',
                scrapedAt: new Date().toISOString(),
                extractionSuccess: extractedContent.success,
            };

            // Push to dataset
            await Dataset.pushData(record);
            log.info(`Successfully processed: ${record.title}`);

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
     * @param {Array<string>} imageUrls - Array of image URLs
     * @returns {Promise<Array<string>>} Array of working image URLs
     */
    async validateImages(imageUrls) {
        if (!imageUrls || imageUrls.length === 0) {
            return [];
        }

        const workingImages = [];
        const validationPromises = [];

        // Process images in batches to avoid overwhelming the server
        for (let i = 0; i < imageUrls.length; i += CONFIG.IMAGE.MAX_CONCURRENT_VALIDATIONS) {
            const batch = imageUrls.slice(i, i + CONFIG.IMAGE.MAX_CONCURRENT_VALIDATIONS);
            
            const batchPromises = batch.map(async (imageUrl) => {
                const isValid = await validateImageUrl(imageUrl, gotScraping);
                if (isValid) {
                    workingImages.push(imageUrl);
                }
            });

            validationPromises.push(...batchPromises);
            
            // Wait for batch to complete before processing next batch
            await Promise.allSettled(batchPromises);
            
            // Small delay between batches
            if (i + CONFIG.IMAGE.MAX_CONCURRENT_VALIDATIONS < imageUrls.length) {
                await sleep(100);
            }
        }

        log.debug(`Image validation: ${workingImages.length}/${imageUrls.length} images are accessible`);
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
