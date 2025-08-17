/**
 * RSS Feed fetcher for Google News
 * Stage A: Collect RSS items from Google News feeds
 */

import { Actor } from 'apify';
import { gotScraping } from 'got-scraping';
import { XMLParser } from 'fast-xml-parser';
import { log } from 'crawlee';
import { CONFIG } from './config.js';
import { buildFeedUrl, getDateRanges, sleep } from './utils.js';
import { SessionManager } from './session-manager.js';
import { RetryManager } from './retry-manager.js';
import { errorHandling } from './error-handling.js';
import { circuitBreakerManager } from './circuit-breaker.js';
import { monitoring } from './monitoring.js';
import { gracefulDegradation } from './graceful-degradation.js';
// Error recovery is now part of the unified error handling system

/**
 * RSS Fetcher class for Google News
 */
export class RssFetcher {
    constructor(proxyConfiguration = null) {
        this.proxyConfiguration = proxyConfiguration;
        this.articles = new Map(); // guid -> rssItem for deduplication
        this.returnedArticles = new Set(); // Track which articles have been returned before
        this.sessionManager = new SessionManager();

        // Error handling components
        this.retryManager = new RetryManager();
        // Use the global error handling instance
        this.errorHandler = errorHandling;

        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            parseAttributeValue: false,
            trimValues: true,
        });
    }

    /**
     * Reset the articles collection for a new crawling session
     * @param {boolean} keepReturnedArticles - If true, don't clear returnedArticles to avoid duplicates across batches
     */
    resetArticles(keepReturnedArticles = false) {
        this.articles.clear();
        if (!keepReturnedArticles) {
            this.returnedArticles.clear();
        }
        log.info(`RSS articles collection reset for new session${keepReturnedArticles ? ' (keeping returned articles tracking)' : ''}`);
    }

    /**
     * Fetch and parse RSS feed
     * @param {string} feedUrl - RSS feed URL
     * @returns {Promise<Array>} Array of RSS items
     */
    async fetchFeed(feedUrl) {
        try {
            log.info(`Fetching RSS feed: ${feedUrl}`);

            const requestOptions = {
                url: feedUrl,
                method: 'GET',
                timeout: { request: CONFIG.RSS.REQUEST_TIMEOUT },
                retry: { limit: 2 },
                headers: this.sessionManager.getEnhancedHeaders(),
            };

            // Temporarily disable proxy to test direct connection
            // if (this.proxyConfiguration) {
            //     const proxyUrl = await this.proxyConfiguration.newUrl();
            //     requestOptions.proxyUrl = proxyUrl;
            // }

            const response = await gotScraping(requestOptions);
            const xmlData = this.xmlParser.parse(response.body);

            // Extract items from RSS structure
            const items = xmlData?.rss?.channel?.item || [];
            const itemsArray = Array.isArray(items) ? items : (items ? [items] : []);

            log.info(`Found ${itemsArray.length} items in RSS feed`);
            return itemsArray;

        } catch (error) {
            log.error(`Failed to fetch RSS feed ${feedUrl}:`, {
                message: error.message,
                statusCode: error.response?.statusCode,
                statusMessage: error.response?.statusMessage,
                body: error.response?.body?.substring(0, 200),
                url: feedUrl
            });
            return [];
        }
    }

    /**
     * Process RSS items and add to collection
     * @param {Array} items - RSS items
     * @param {number} maxItems - Maximum items to collect (0 = unlimited)
     * @returns {number} Number of new items added
     */
    processRssItems(items, maxItems = 0) {
        let newItemsCount = 0;

        for (const item of items) {
            // Stop if we've reached the maximum items for this call
            if (maxItems > 0 && newItemsCount >= maxItems) {
                break;
            }

            // Skip null, undefined, or non-object items
            if (!item || typeof item !== 'object') {
                log.warning('RSS item is null, undefined, or not an object, skipping');
                continue;
            }

            // Use guid or link as unique identifier
            const guid = item.guid || item.link;
            if (!guid) {
                log.warning('RSS item missing guid and link, skipping');
                continue;
            }

            // Skip if we already have this item
            if (this.articles.has(guid)) {
                continue;
            }

            // Add item to collection
            this.articles.set(guid, {
                title: item.title || 'No title',
                link: item.link || '',
                pubDate: item.pubDate || new Date().toISOString(),
                source: item.source?.['#text'] || item.source?.['@_url'] || item.source || 'Unknown',
                description: item.description || '',
                guid,
            });

            newItemsCount++;
        }

        return newItemsCount;
    }

    /**
     * Fetch RSS items with enhanced strategies for large queries
     * @param {object} input - Input parameters
     * @returns {Promise<Map>} Map of collected articles
     */
    async fetchRssItems(input) {
        const { query, region, language, maxItems, dateFrom, dateTo } = input;

        log.info(`Starting RSS collection for query: "${query}" (target: ${maxItems || 'unlimited'})`);

        // Track the size before this call to know how many new articles we get
        const initialSize = this.articles.size;

        // Initial fetch without date slicing
        const initialFeedUrl = buildFeedUrl(query, language, region);
        const initialItems = await this.fetchFeed(initialFeedUrl);
        const newItemsCount = this.processRssItems(initialItems, maxItems);

        log.info(`Initial fetch: ${newItemsCount} new items, total: ${this.articles.size}`);

        // If we need more articles, try alternative strategies
        // Also try alternatives if we have returnedArticles (meaning this is a subsequent batch)
        const needsMoreArticles = maxItems > 0 && this.articles.size < maxItems;
        const isSubsequentBatch = this.returnedArticles.size > 0;

        if (needsMoreArticles || isSubsequentBatch) {
            const articlesNeeded = maxItems > 0 ? maxItems - this.articles.size : maxItems;
            log.info(`Need ${articlesNeeded} more articles (${this.articles.size}/${maxItems || 'unlimited'}), trying alternative strategies...`);

            // For subsequent batches or small targets, be more aggressive with alternative strategies
            const shouldTryAlternatives = maxItems > 5 || this.articles.size === 0 || isSubsequentBatch;

            if (shouldTryAlternatives) {
                // Strategy 1: Try multiple RSS endpoints and variations
                await this.fetchWithMultipleEndpoints(query, language, region, maxItems);

                // Strategy 2: Try different regional variations of the same query
                if (this.articles.size < maxItems) {
                    await this.fetchWithRegionalVariations(query, language, region, maxItems);
                }

                // Strategy 3: Try broader time ranges if still not enough
                if (this.articles.size < maxItems) {
                    await this.fetchWithTimeVariations(query, language, region, maxItems);
                }
            } else {
                log.info(`Small target (${maxItems}), skipping alternative strategies to avoid over-fetching`);
            }
        }

        // Store progress
        await Actor.setValue(CONFIG.STORAGE.RSS_ITEMS_KEY, Array.from(this.articles.values()));

        // Return only articles that haven't been returned before
        const newArticlesMap = new Map();
        let returnedCount = 0;

        for (const [guid, article] of this.articles) {
            if (!this.returnedArticles.has(guid)) {
                newArticlesMap.set(guid, article);
                this.returnedArticles.add(guid);
                returnedCount++;

                // If maxItems is specified and we've reached it, stop adding more
                if (maxItems > 0 && returnedCount >= maxItems) {
                    break;
                }
            }
        }

        log.info(`RSS collection completed. New articles: ${newArticlesMap.size}, Total items: ${this.articles.size}`);
        return newArticlesMap;
    }

    /**
     * Fetch articles using regional variations to get more diverse results
     * @param {string} query - Search query
     * @param {string} language - Language code
     * @param {string} region - Primary region code
     * @param {number} maxItems - Maximum items to collect
     */
    async fetchWithRegionalVariations(query, language, region, maxItems) {
        log.info('Trying regional variations to get more articles...');

        // Define regional variations based on language
        const regionalVariations = this.getRegionalVariations(region, language);

        for (const altRegion of regionalVariations) {
            if (this.articles.size >= maxItems) break;

            log.info(`Trying region variation: ${altRegion}`);
            const feedUrl = buildFeedUrl(query, language, altRegion);

            try {
                const items = await this.fetchFeed(feedUrl);
                const newItemsCount = this.processRssItems(items, maxItems);
                log.info(`Region ${altRegion}: ${newItemsCount} new items, total: ${this.articles.size}`);

                // Early termination for small targets if we have enough
                if (maxItems <= 10 && this.articles.size >= maxItems) {
                    log.info(`Small target reached (${this.articles.size}/${maxItems}), stopping regional variations`);
                    break;
                }

                // Rate limiting between regional requests
                await sleep(CONFIG.RSS.RATE_LIMIT_DELAY);
            } catch (error) {
                log.debug(`Failed to fetch from region ${altRegion}: ${error.message}`);
            }
        }
    }



    /**
     * Fetch articles using time-based variations
     * @param {string} query - Search query
     * @param {string} language - Language code
     * @param {string} region - Region code
     * @param {number} maxItems - Maximum items to collect
     */
    async fetchWithTimeVariations(query, language, region, maxItems) {
        log.info('Trying time-based variations to get more articles...');

        // Try different time-based URL parameters that might work with Google News
        const timeVariations = [
            '&when:1d',  // Last day
            '&when:7d',  // Last week
            '&when:1m',  // Last month
            '&sort:date', // Sort by date
            '&sort:relevance' // Sort by relevance
        ];

        for (const timeParam of timeVariations) {
            if (this.articles.size >= maxItems) break;

            log.info(`Trying time variation: ${timeParam}`);
            const baseFeedUrl = buildFeedUrl(query, language, region);
            const feedUrl = baseFeedUrl + timeParam;

            try {
                const items = await this.fetchFeed(feedUrl);
                const newItemsCount = this.processRssItems(items, maxItems);
                log.info(`Time variation ${timeParam}: ${newItemsCount} new items, total: ${this.articles.size}`);

                // Early termination for small targets if we have enough
                if (maxItems <= 10 && this.articles.size >= maxItems) {
                    log.info(`Small target reached (${this.articles.size}/${maxItems}), stopping time variations`);
                    break;
                }

                // Rate limiting between time variation requests
                await sleep(CONFIG.RSS.RATE_LIMIT_DELAY);
            } catch (error) {
                log.debug(`Failed to fetch with time variation ${timeParam}: ${error.message}`);
            }
        }
    }

    /**
     * Get regional variations for expanding search
     * @param {string} primaryRegion - Primary region code
     * @param {string} language - Language code
     * @returns {Array} Array of alternative region codes
     */
    getRegionalVariations(primaryRegion, language) {
        const variations = [];

        // Language-based regional variations
        const regionMap = {
            'en': ['US', 'GB', 'CA', 'AU', 'IN', 'ZA'],
            'es': ['ES', 'MX', 'AR', 'CO', 'CL', 'PE'],
            'fr': ['FR', 'CA', 'BE', 'CH', 'SN'],
            'de': ['DE', 'AT', 'CH'],
            'it': ['IT', 'CH'],
            'pt': ['BR', 'PT'],
            'ru': ['RU', 'BY', 'KZ'],
            'ja': ['JP'],
            'ko': ['KR'],
            'zh': ['CN', 'TW', 'HK', 'SG']
        };

        const languageRegions = regionMap[language] || ['US', 'GB'];

        // Add variations that are different from the primary region
        for (const region of languageRegions) {
            if (region !== primaryRegion && !variations.includes(region)) {
                variations.push(region);
            }
        }

        // Limit to 3 variations to avoid too many requests
        return variations.slice(0, 3);
    }



    /**
     * Try multiple RSS endpoints and search variations to maximize article collection
     * @param {string} query - Search query
     * @param {string} language - Language code
     * @param {string} region - Region code
     * @param {number} maxItems - Maximum items to collect
     */
    async fetchWithMultipleEndpoints(query, language, region, maxItems) {
        log.info('Trying multiple RSS endpoints to get more articles...');

        // Different Google News RSS endpoint variations
        const endpointVariations = [
            // Standard RSS feed
            `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${language}&gl=${region}&ceid=${region}:${language}`,

            // Try with different ceid formats
            `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${language}&gl=${region}&ceid=${language}`,

            // Try without ceid
            `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${language}&gl=${region}`,

            // Try with topic-based approach (if query matches common topics)
            ...this.getTopicBasedUrls(query, language, region),
        ];

        for (const feedUrl of endpointVariations) {
            if (this.articles.size >= maxItems) break;

            log.info(`Trying endpoint variation: ${feedUrl}`);

            try {
                const items = await this.fetchFeed(feedUrl);
                const newItemsCount = this.processRssItems(items, maxItems);
                log.info(`Endpoint variation: ${newItemsCount} new items, total: ${this.articles.size}`);

                // Early termination for small targets if we have enough
                if (maxItems <= 10 && this.articles.size >= maxItems) {
                    log.info(`Small target reached (${this.articles.size}/${maxItems}), stopping endpoint variations`);
                    break;
                }

                // Rate limiting between endpoint requests
                await sleep(CONFIG.RSS.RATE_LIMIT_DELAY);
            } catch (error) {
                log.debug(`Failed to fetch from endpoint variation: ${error.message}`);
            }
        }
    }

    /**
     * Get topic-based RSS URLs if the query matches common news topics
     * @param {string} query - Search query
     * @param {string} language - Language code
     * @param {string} region - Region code
     * @returns {Array} Array of topic-based RSS URLs
     */
    getTopicBasedUrls(query, language, region) {
        const urls = [];
        const lowerQuery = query.toLowerCase();

        // Map common query terms to Google News topics
        const topicMap = {
            'business': 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZ4ZERBU0FtVnVHZ0pWVXlnQVAB',
            'technology': 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB',
            'sports': 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB',
            'health': 'CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ',
            'science': 'CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB',
            'entertainment': 'CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB',
            'politics': 'CAAqIQgKIhtDQkFTRGdvSUwyMHZNRE41ZGpBU0FtVnVLQUFQAQ'
        };

        // Check if query contains topic keywords
        for (const [topic, topicId] of Object.entries(topicMap)) {
            if (lowerQuery.includes(topic)) {
                urls.push(`https://news.google.com/rss/topics/${topicId}?hl=${language}&gl=${region}`);
                break; // Only add one topic URL to avoid too many requests
            }
        }

        return urls;
    }

    /**
     * Fetch RSS items with date slicing
     * @param {string} query - Search query
     * @param {string} language - Language code
     * @param {string} region - Region code
     * @param {number} maxItems - Maximum items to collect
     * @param {string} dateFrom - Start date
     * @param {string} dateTo - End date
     */
    async fetchWithDateSlicing(query, language, region, maxItems, dateFrom, dateTo) {
        log.info('Starting date slicing to collect more items');

        const dateRanges = getDateRanges(dateFrom, dateTo);
        let processedRanges = 0;

        for (const range of dateRanges) {
            // Stop if we've reached the maximum items
            if (this.articles.size >= maxItems) {
                break;
            }

            const feedUrl = buildFeedUrl(query, language, region, range.from, range.to);
            const items = await this.fetchFeed(feedUrl);
            const newItemsCount = this.processRssItems(items, maxItems);

            processedRanges++;
            log.info(`Date range ${range.from} to ${range.to}: ${newItemsCount} new items, total: ${this.articles.size}`);

            // Store progress periodically
            if (processedRanges % 5 === 0) {
                await Actor.setValue(CONFIG.STORAGE.LAST_DATE_KEY, range.from);
                await Actor.setValue(CONFIG.STORAGE.RSS_ITEMS_KEY, Array.from(this.articles.values()));
            }

            // Rate limiting
            await sleep(CONFIG.RSS.RATE_LIMIT_DELAY);
        }

        log.info(`Date slicing completed. Processed ${processedRanges} date ranges`);
    }

    /**
     * Get collected articles
     * @returns {Map} Map of collected articles
     */
    getArticles() {
        return this.articles;
    }

    /**
     * Get articles as array
     * @returns {Array} Array of collected articles
     */
    getArticlesArray() {
        return Array.from(this.articles.values());
    }

    /**
     * Clear collected articles
     */
    clear() {
        this.articles.clear();
    }
}

export default RssFetcher;
