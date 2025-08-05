/**
 * Local Testing Tools
 * Utilities for local development and testing
 */

import fs from 'fs/promises';
import path from 'path';
import { log } from 'crawlee';
import { DEV_CONFIG } from './dev-config.js';

export class LocalTestingTools {
    constructor() {
        this.mockDataDir = DEV_CONFIG.MOCK.DATA_DIR;
        this.testDataDir = DEV_CONFIG.TESTING.DATA_DIR;
        this.scenarios = new Map();
        this.mockResponses = new Map();
    }

    /**
     * Initialize testing tools
     */
    async initialize() {
        await this.ensureDirectories();
        await this.loadMockData();
        await this.loadTestScenarios();
        log.info('Local testing tools initialized');
    }

    /**
     * Ensure required directories exist
     */
    async ensureDirectories() {
        const dirs = [
            this.mockDataDir,
            this.testDataDir,
            path.join(this.mockDataDir, 'rss'),
            path.join(this.mockDataDir, 'articles'),
            path.join(this.mockDataDir, 'images'),
            path.join(this.testDataDir, 'scenarios'),
            path.join(this.testDataDir, 'expected'),
        ];

        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    log.warning(`Failed to create directory ${dir}:`, error.message);
                }
            }
        }
    }

    /**
     * Load mock data from files
     */
    async loadMockData() {
        try {
            // Load RSS mock data
            const rssDir = path.join(this.mockDataDir, 'rss');
            const rssFiles = await fs.readdir(rssDir).catch(() => []);
            
            for (const file of rssFiles) {
                if (file.endsWith('.xml')) {
                    const content = await fs.readFile(path.join(rssDir, file), 'utf8');
                    const key = file.replace('.xml', '');
                    this.mockResponses.set(`rss_${key}`, content);
                }
            }

            // Load article mock data
            const articlesDir = path.join(this.mockDataDir, 'articles');
            const articleFiles = await fs.readdir(articlesDir).catch(() => []);
            
            for (const file of articleFiles) {
                if (file.endsWith('.html')) {
                    const content = await fs.readFile(path.join(articlesDir, file), 'utf8');
                    const key = file.replace('.html', '');
                    this.mockResponses.set(`article_${key}`, content);
                }
            }

            log.info(`Loaded ${this.mockResponses.size} mock responses`);
        } catch (error) {
            log.warning('Failed to load mock data:', error.message);
        }
    }

    /**
     * Load test scenarios
     */
    async loadTestScenarios() {
        try {
            const scenariosDir = path.join(this.testDataDir, 'scenarios');
            const scenarioFiles = await fs.readdir(scenariosDir).catch(() => []);
            
            for (const file of scenarioFiles) {
                if (file.endsWith('.json')) {
                    const content = await fs.readFile(path.join(scenariosDir, file), 'utf8');
                    const scenario = JSON.parse(content);
                    const key = file.replace('.json', '');
                    this.scenarios.set(key, scenario);
                }
            }

            log.info(`Loaded ${this.scenarios.size} test scenarios`);
        } catch (error) {
            log.warning('Failed to load test scenarios:', error.message);
        }
    }

    /**
     * Create mock RSS feed
     * @param {string} name - Mock name
     * @param {Array} items - RSS items
     * @returns {string} RSS XML content
     */
    createMockRssFeed(name, items = []) {
        const defaultItems = items.length > 0 ? items : this.getDefaultRssItems();
        
        const itemsXml = defaultItems.map(item => `
            <item>
                <title><![CDATA[${item.title}]]></title>
                <link>${item.link}</link>
                <guid isPermaLink="false">${item.guid}</guid>
                <pubDate>${item.pubDate}</pubDate>
                <description><![CDATA[${item.description}]]></description>
                <source url="${item.sourceUrl}">${item.source}</source>
            </item>
        `).join('');

        const rssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
    <channel>
        <generator>NFE/5.0</generator>
        <title>"${name}" - Google News</title>
        <language>en-US</language>
        <webMaster>news-webmaster@google.com</webMaster>
        <copyright>2024 Google Inc.</copyright>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        <description>Google News</description>
        ${itemsXml}
    </channel>
</rss>`;

        this.mockResponses.set(`rss_${name}`, rssXml);
        return rssXml;
    }

    /**
     * Create mock article HTML
     * @param {string} name - Mock name
     * @param {object} data - Article data
     * @returns {string} HTML content
     */
    createMockArticle(name, data = {}) {
        const defaults = {
            title: 'Mock Article Title',
            content: 'This is mock article content for testing purposes.',
            author: 'Test Author',
            date: new Date().toISOString(),
            description: 'Mock article description',
            image: 'https://example.com/mock-image.jpg',
        };

        const articleData = { ...defaults, ...data };
        
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${articleData.title}</title>
    <meta name="description" content="${articleData.description}">
    <meta name="author" content="${articleData.author}">
    <meta property="og:title" content="${articleData.title}">
    <meta property="og:description" content="${articleData.description}">
    <meta property="og:image" content="${articleData.image}">
</head>
<body>
    <article>
        <header>
            <h1>${articleData.title}</h1>
            <div class="meta">
                <span class="author">By ${articleData.author}</span>
                <time datetime="${articleData.date}">${new Date(articleData.date).toLocaleDateString()}</time>
            </div>
        </header>
        <div class="content">
            <img src="${articleData.image}" alt="Article image" class="featured-image">
            <p>${articleData.content}</p>
            <p>Additional paragraph with more detailed content for testing extraction algorithms.</p>
            <p>This mock article contains multiple paragraphs to simulate real article structure.</p>
        </div>
    </article>
</body>
</html>`;

        this.mockResponses.set(`article_${name}`, html);
        return html;
    }

    /**
     * Get default RSS items for testing
     * @returns {Array} Default RSS items
     */
    getDefaultRssItems() {
        return [
            {
                title: 'AI Breakthrough in Healthcare',
                link: 'https://news.google.com/rss/articles/CBMiMockUrl1?oc=5',
                guid: 'CBMiMockUrl1',
                pubDate: new Date().toUTCString(),
                description: 'Revolutionary AI system improves medical diagnosis accuracy.',
                source: 'TechNews',
                sourceUrl: 'https://technews.com',
            },
            {
                title: 'Climate Change Solutions Emerge',
                link: 'https://news.google.com/rss/articles/CBMiMockUrl2?oc=5',
                guid: 'CBMiMockUrl2',
                pubDate: new Date(Date.now() - 3600000).toUTCString(),
                description: 'New technologies offer hope for environmental challenges.',
                source: 'EcoDaily',
                sourceUrl: 'https://ecodaily.com',
            },
            {
                title: 'Space Exploration Milestone Reached',
                link: 'https://news.google.com/rss/articles/CBMiMockUrl3?oc=5',
                guid: 'CBMiMockUrl3',
                pubDate: new Date(Date.now() - 7200000).toUTCString(),
                description: 'Historic achievement in space exploration opens new possibilities.',
                source: 'SpaceToday',
                sourceUrl: 'https://spacetoday.com',
            },
        ];
    }

    /**
     * Create test scenario
     * @param {string} name - Scenario name
     * @param {object} scenario - Scenario configuration
     */
    async createTestScenario(name, scenario) {
        const scenarioData = {
            name,
            description: scenario.description || `Test scenario: ${name}`,
            input: scenario.input || {},
            expected: scenario.expected || {},
            mockData: scenario.mockData || {},
            assertions: scenario.assertions || [],
            setup: scenario.setup || null,
            teardown: scenario.teardown || null,
            timeout: scenario.timeout || 30000,
            ...scenario,
        };

        this.scenarios.set(name, scenarioData);
        
        // Save to file
        const scenarioPath = path.join(this.testDataDir, 'scenarios', `${name}.json`);
        await fs.writeFile(scenarioPath, JSON.stringify(scenarioData, null, 2));
        
        log.info(`Created test scenario: ${name}`);
    }

    /**
     * Run test scenario
     * @param {string} name - Scenario name
     * @param {Function} testFunction - Test function to execute
     * @returns {object} Test result
     */
    async runTestScenario(name, testFunction) {
        const scenario = this.scenarios.get(name);
        if (!scenario) {
            throw new Error(`Test scenario not found: ${name}`);
        }

        log.info(`Running test scenario: ${name}`);
        const startTime = Date.now();
        
        try {
            // Setup
            if (scenario.setup) {
                await scenario.setup();
            }

            // Run test
            const result = await Promise.race([
                testFunction(scenario),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Test timeout')), scenario.timeout)
                ),
            ]);

            const duration = Date.now() - startTime;
            
            // Validate result against expectations
            const validation = this.validateResult(result, scenario.expected, scenario.assertions);
            
            const testResult = {
                scenario: name,
                success: validation.success,
                result,
                validation,
                duration,
                timestamp: new Date().toISOString(),
            };

            log.info(`Test scenario ${name} ${validation.success ? 'PASSED' : 'FAILED'} in ${duration}ms`);
            
            return testResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            
            const testResult = {
                scenario: name,
                success: false,
                error: error.message,
                duration,
                timestamp: new Date().toISOString(),
            };

            log.error(`Test scenario ${name} FAILED with error: ${error.message}`);
            
            return testResult;

        } finally {
            // Teardown
            if (scenario.teardown) {
                try {
                    await scenario.teardown();
                } catch (error) {
                    log.warning(`Teardown failed for scenario ${name}:`, error.message);
                }
            }
        }
    }

    /**
     * Validate test result
     * @param {any} result - Test result
     * @param {object} expected - Expected values
     * @param {Array} assertions - Custom assertions
     * @returns {object} Validation result
     */
    validateResult(result, expected, assertions) {
        const validation = {
            success: true,
            errors: [],
            warnings: [],
        };

        // Check expected values
        for (const [key, expectedValue] of Object.entries(expected)) {
            const actualValue = this.getNestedValue(result, key);
            
            if (actualValue !== expectedValue) {
                validation.success = false;
                validation.errors.push(`Expected ${key} to be ${expectedValue}, got ${actualValue}`);
            }
        }

        // Run custom assertions
        for (const assertion of assertions) {
            try {
                const assertionResult = assertion(result);
                if (!assertionResult) {
                    validation.success = false;
                    validation.errors.push(`Custom assertion failed: ${assertion.name || 'unnamed'}`);
                }
            } catch (error) {
                validation.success = false;
                validation.errors.push(`Assertion error: ${error.message}`);
            }
        }

        return validation;
    }

    /**
     * Get nested value from object
     * @param {object} obj - Object to search
     * @param {string} path - Dot-separated path
     * @returns {any} Value at path
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Get mock response
     * @param {string} key - Mock key
     * @returns {string|null} Mock response
     */
    getMockResponse(key) {
        return this.mockResponses.get(key) || null;
    }

    /**
     * Save mock data to file
     * @param {string} type - Data type (rss, article, etc.)
     * @param {string} name - File name
     * @param {string} content - Content to save
     */
    async saveMockData(type, name, content) {
        const dir = path.join(this.mockDataDir, type);
        await fs.mkdir(dir, { recursive: true });
        
        const extension = type === 'rss' ? 'xml' : 'html';
        const filePath = path.join(dir, `${name}.${extension}`);
        
        await fs.writeFile(filePath, content);
        this.mockResponses.set(`${type}_${name}`, content);
        
        log.info(`Saved mock ${type} data: ${name}`);
    }

    /**
     * Generate test report
     * @param {Array} testResults - Array of test results
     * @returns {object} Test report
     */
    generateTestReport(testResults) {
        const report = {
            timestamp: new Date().toISOString(),
            total: testResults.length,
            passed: testResults.filter(r => r.success).length,
            failed: testResults.filter(r => !r.success).length,
            duration: testResults.reduce((sum, r) => sum + r.duration, 0),
            results: testResults,
            summary: {},
        };

        report.successRate = report.total > 0 ? (report.passed / report.total * 100).toFixed(2) + '%' : '0%';
        report.averageDuration = report.total > 0 ? Math.round(report.duration / report.total) : 0;

        return report;
    }

    /**
     * Clean up test data
     */
    async cleanup() {
        try {
            // Clear mock responses
            this.mockResponses.clear();
            this.scenarios.clear();
            
            log.info('Local testing tools cleaned up');
        } catch (error) {
            log.warning('Cleanup failed:', error.message);
        }
    }
}

// Global testing tools instance
export const localTestingTools = new LocalTestingTools();
