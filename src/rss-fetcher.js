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
import { ErrorHandler } from './error-handler.js';
import { circuitBreakerManager } from './circuit-breaker.js';
import { monitoring } from './monitoring.js';
import { gracefulDegradation } from './graceful-degradation.js';
import { errorRecovery } from './error-recovery.js';

/**
 * RSS Fetcher class for Google News
 */
export class RssFetcher {
    constructor(proxyConfiguration = null) {
        this.proxyConfiguration = proxyConfiguration;
        this.articles = new Map(); // guid -> rssItem for deduplication
        this.sessionManager = new SessionManager();

        // Error handling components
        this.retryManager = new RetryManager();
        this.errorHandler = new ErrorHandler();

        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            parseAttributeValue: false,
            trimValues: true,
        });
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
            // Stop if we've reached the maximum items
            if (maxItems > 0 && this.articles.size >= maxItems) {
                break;
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
     * Fetch RSS items with date slicing for large queries
     * @param {object} input - Input parameters
     * @returns {Promise<Map>} Map of collected articles
     */
    async fetchRssItems(input) {
        const { query, region, language, maxItems, dateFrom, dateTo } = input;

        log.info(`Starting RSS collection for query: "${query}"`);

        // Initial fetch without date slicing
        const initialFeedUrl = buildFeedUrl(query, language, region);
        const initialItems = await this.fetchFeed(initialFeedUrl);
        const newItemsCount = this.processRssItems(initialItems, maxItems);

        log.info(`Initial fetch: ${newItemsCount} new items, total: ${this.articles.size}`);

        // Temporarily disable date slicing as Google News RSS doesn't support date filters
        // TODO: Implement alternative strategies to get more items if needed
        // if (maxItems > 0 && this.articles.size < maxItems) {
        //     await this.fetchWithDateSlicing(query, language, region, maxItems, dateFrom, dateTo);
        // }

        // Store progress
        await Actor.setValue(CONFIG.STORAGE.RSS_ITEMS_KEY, Array.from(this.articles.values()));

        log.info(`RSS collection completed. Total items: ${this.articles.size}`);
        return this.articles;
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
