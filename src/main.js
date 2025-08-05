/**
 * Google News Scraper - Main Entry Point
 * 
 * A comprehensive Google News scraper that extracts articles with full text,
 * images, and metadata using RSS feeds and article crawling.
 */

import { Actor } from 'apify';
import { log } from 'crawlee';
import { CONFIG } from './config.js';
import { RssFetcher } from './rss-fetcher.js';
import { ArticleCrawler } from './article-crawler.js';
import { errorHandling } from './error-handling-integration.js';
import { monitoring } from './monitoring.js';

// Initialize Actor
await Actor.init();

// Set logging level
log.setLevel(log.LEVELS[CONFIG.LOGGING.LEVEL]);

/**
 * Main execution function
 */
async function main() {
    try {
        // Initialize error handling system
        await errorHandling.initialize();
        log.info('Error handling system initialized');

        // Get input from Actor or fallback to INPUT.json for local testing
        let input = await Actor.getInput();

        if (!input || !input.query) {
            // Fallback to reading INPUT.json directly for local testing
            try {
                const fs = await import('fs');
                const inputJson = fs.readFileSync('./INPUT.json', 'utf8');
                input = JSON.parse(inputJson);
                log.info('Using INPUT.json for local testing');
            } catch (error) {
                log.error('Failed to read INPUT.json:', error.message);
                const errorMsg = 'Input must contain a "query" field. Please provide input via Actor input or create INPUT.json file.';
                log.error(errorMsg);
                throw new Error(errorMsg);
            }
        }

        // Validate input
        if (!input || !input.query) {
            const errorMsg = 'Input must contain a "query" field';
            log.error(errorMsg);
            throw new Error(errorMsg);
        }

        // Set defaults
        const {
            query,
            region = CONFIG.RSS.DEFAULT_REGION,
            language = CONFIG.RSS.DEFAULT_LANGUAGE,
            maxItems = 0,
            dateFrom = null,
            dateTo = null,
            useBrowser = false,
        } = input;

        log.info('Google News Scraper starting', {
            query,
            region,
            language,
            maxItems,
            dateFrom,
            dateTo,
            useBrowser,
        });

        // Configure proxies
        const googleProxy = await createProxyConfiguration(['GOOGLE_SERP'], region);
        const articleProxy = await createProxyConfiguration(['RESIDENTIAL'], region);

        // Stage A: RSS Feed Processing
        log.info('=== Stage A: RSS Feed Processing ===');
        const rssFetcher = new RssFetcher(googleProxy);
        const articles = await rssFetcher.fetchRssItems({
            query,
            region,
            language,
            maxItems,
            dateFrom,
            dateTo,
        });

        if (articles.size === 0) {
            log.warning('No articles found in RSS feeds');
            await Actor.exit();
            return;
        }

        // Stage B: Article Crawling
        log.info('=== Stage B: Article Crawling ===');
        const articleCrawler = new ArticleCrawler(articleProxy, useBrowser);
        await articleCrawler.crawlArticles(Array.from(articles.values()), query);

        // Final statistics
        const failedUrls = articleCrawler.getFailedUrls();
        log.info('Scraping completed', {
            totalArticlesFound: articles.size,
            failedArticles: failedUrls.length,
            successRate: `${(((articles.size - failedUrls.length) / articles.size) * 100).toFixed(1)}%`,
        });

    } catch (error) {
        const errorMessage = error.message || String(error);
        log.error('Main execution failed:', errorMessage);
        throw error;
    }
}

/**
 * Create proxy configuration
 * @param {Array<string>} groups - Proxy groups
 * @param {string} countryCode - Country code
 * @returns {Promise<object|null>} Proxy configuration
 */
async function createProxyConfiguration(groups, countryCode) {
    try {
        const proxyConfiguration = await Actor.createProxyConfiguration({
            groups,
            countryCode,
        });

        if (proxyConfiguration) {
            const proxyUrl = await proxyConfiguration.newUrl();
            log.info(`Proxy configured: ${groups.join(', ')} for ${countryCode}`);
            log.debug(`Sample proxy URL: ${proxyUrl}`);
        }

        return proxyConfiguration;
    } catch (error) {
        log.warning(`Proxy configuration failed for ${groups.join(', ')}:`, error.message);
        return null;
    }
}

// Run main function
try {
    await main();

    // Generate final health report
    const healthStatus = errorHandling.getHealthStatus();
    log.info('Final health status:', healthStatus.overall);

    // Generate monitoring report
    await monitoring.generateReport();

    log.info('🎉 Google News Scraper completed successfully');
} catch (error) {
    const errorMessage = error.message || String(error);
    log.error('💥 Google News Scraper failed:', errorMessage);

    // Generate error report
    try {
        const errorReport = await errorHandling.generateErrorReport();
        log.error('Error report:', errorReport.summary);
        await Actor.setValue('ERROR_REPORT', errorReport);
    } catch (reportError) {
        log.debug('Failed to generate error report:', reportError.message);
    }

    process.exit(1);
} finally {
    // Shutdown error handling system
    await errorHandling.shutdown();
    await Actor.exit();
}
