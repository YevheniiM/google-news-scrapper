/**
 * Google News Scraper - Optimized Main Entry Point
 *
 * A streamlined Google News scraper that extracts articles with full text,
 * images, and metadata using RSS feeds and article crawling.
 */

import { Actor } from 'apify';
import { log } from 'crawlee';
import { CONFIG } from './config.js';
import { RssFetcher } from './rss-fetcher.js';
import { ArticleCrawler } from './article-crawler.js';
import { errorHandling } from './error-handling.js';
import { monitoring } from './monitoring.js';
import { costMonitor } from './cost-monitor.js';

/**
 * Get and validate input
 * @returns {Promise<object>} Validated input
 */
async function getInput() {
    let input = await Actor.getInput();

    if (!input || !input.query) {
        // Fallback to reading INPUT.json for local testing
        try {
            const fs = await import('fs');
            const inputJson = fs.readFileSync('./INPUT.json', 'utf8');
            input = JSON.parse(inputJson);
            log.info('Using INPUT.json for local testing');
        } catch (error) {
            throw new Error('Input must contain a "query" field. Please provide input via Actor input or create INPUT.json file.');
        }
    }

    // Final validation
    if (!input || !input.query) {
        throw new Error('Input must contain a "query" field');
    }

    return input;
}

/**
 * Main execution function
 */
async function main() {
    // Get and validate input
    const input = await getInput();

    // Extract parameters with defaults
    const {
        query,
        region = CONFIG.RSS.DEFAULT_REGION,
        language = CONFIG.RSS.DEFAULT_LANGUAGE,
        maxItems = 0,
        dateFrom = null,
        dateTo = null,
        useBrowser = CONFIG.COST_OPTIMIZATION?.USE_BROWSER_BY_DEFAULT ?? false,
        lightweightMode = false,
        costOptimized = false,
    } = input;

    // Apply cost optimization settings
    if (lightweightMode || costOptimized) {
        log.info('🚀 Running in cost-optimized mode');
        if (lightweightMode) {
            CONFIG.CRAWLER.MAX_CONCURRENCY = 1;
            CONFIG.PROXY.RESIDENTIAL_ENABLED = false;
            CONFIG.IMAGE.SKIP_VALIDATION = true;
        }
    }

    log.info('Google News Scraper starting', {
        query, region, language, maxItems, dateFrom, dateTo, useBrowser,
    });

    // Configure proxies
    const googleProxy = await createProxyConfiguration(['GOOGLE_SERP'], region);
    const proxyGroups = CONFIG.PROXY.RESIDENTIAL_ENABLED ? ['RESIDENTIAL'] : ['DATACENTER'];
    const articleProxy = await createProxyConfiguration(proxyGroups, region);

    // Stage A: RSS Feed Processing with Smart Batching
    log.info('=== Stage A: RSS Feed Processing ===');
    const rssFetcher = new RssFetcher(googleProxy);

    // Stage B: Article Crawling with Quality-Based Continuation
    log.info('=== Stage B: Article Crawling with Smart maxItems Handling ===');
    const articleCrawler = new ArticleCrawler(articleProxy, useBrowser);

    // Implement smart maxItems handling - continue until we get enough quality articles
    const crawlResults = await articleCrawler.crawlWithQualityTarget({
        rssFetcher,
        query,
        region,
        language,
        maxItems,
        dateFrom,
        dateTo
    });

    // Final statistics
    const failedUrls = articleCrawler.getFailedUrls();
    const totalProcessed = crawlResults?.totalProcessed || 0;
    const articlesSaved = crawlResults?.saved || 0;
    const successRate = totalProcessed > 0 ? (((totalProcessed - failedUrls.length) / totalProcessed) * 100).toFixed(1) : '0.0';

    log.info('Scraping completed', {
        totalArticlesProcessed: totalProcessed,
        articlesSaved: articlesSaved,
        failedArticles: failedUrls.length,
        successRate: `${successRate}%`,
    });

    // Cost monitoring
    costMonitor.logCostSummary();
    await costMonitor.saveCostReport();
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

// Initialize and run
async function run() {
    await Actor.init();
    log.setLevel(log.LEVELS[CONFIG.LOGGING.LEVEL]);

    try {
        await main();

        // Generate reports
        const healthStatus = errorHandling.getHealthStatus();
        log.info('Final health status:', healthStatus.overall.status);
        await monitoring.generateReport();

        log.info('🎉 Google News Scraper completed successfully');
    } catch (error) {
        log.error('💥 Google News Scraper failed:', error.message);

        // Save error report
        try {
            const errorReport = await errorHandling.generateErrorReport();
            await Actor.setValue('ERROR_REPORT', errorReport);
        } catch (reportError) {
            log.debug('Failed to generate error report:', reportError.message);
        }

        process.exit(1);
    } finally {
        errorHandling.cleanup();
        await Actor.exit();
    }
}

// Start the scraper
run().catch(console.error);
