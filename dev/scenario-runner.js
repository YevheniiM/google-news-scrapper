#!/usr/bin/env node
/**
 * Scenario Runner
 * Runs comprehensive testing scenarios for development
 */

import { Actor } from 'apify';
import { log } from 'crawlee';
import { localTestingTools } from '../src/local-testing-tools.js';
import { debugLogger } from '../src/debug-logger.js';
import { localStorage } from '../src/local-storage.js';
import { RssFetcher } from '../src/rss-fetcher.js';
import { ArticleCrawler } from '../src/article-crawler.js';

class ScenarioRunner {
    constructor() {
        this.scenarios = new Map();
        this.results = [];
    }

    async initialize() {
        await Actor.init();
        await debugLogger.initialize();
        await localTestingTools.initialize();
        await localStorage.initialize();
        
        await this.loadScenarios();
        log.info('Scenario runner initialized');
    }

    async loadScenarios() {
        // Define comprehensive test scenarios
        const scenarios = [
            {
                name: 'basic_functionality',
                description: 'Test basic RSS fetching and article processing',
                category: 'functional',
                input: {
                    query: 'artificial intelligence',
                    region: 'US',
                    language: 'en-US',
                    maxItems: 5,
                },
                setup: async () => {
                    // Create mock data for this scenario
                    localTestingTools.createMockRssFeed('ai_news', [
                        {
                            title: 'AI Breakthrough in Healthcare',
                            link: 'https://example.com/ai-healthcare',
                            guid: 'ai-healthcare-123',
                            pubDate: new Date().toUTCString(),
                            description: 'Revolutionary AI system improves diagnosis',
                            source: 'TechNews',
                            sourceUrl: 'https://technews.com',
                        },
                    ]);
                },
                execute: async (input) => {
                    const rssFetcher = new RssFetcher();
                    return await rssFetcher.fetchRssItems(input);
                },
                validate: (result) => {
                    return {
                        success: result instanceof Map && result.size >= 0,
                        message: `Found ${result?.size || 0} articles`,
                    };
                },
            },
            
            {
                name: 'error_handling',
                description: 'Test error handling with invalid inputs',
                category: 'error_handling',
                input: {
                    query: '', // Invalid empty query
                    region: 'INVALID',
                    language: 'xx-XX',
                    maxItems: -1,
                },
                execute: async (input) => {
                    try {
                        const rssFetcher = new RssFetcher();
                        return await rssFetcher.fetchRssItems(input);
                    } catch (error) {
                        return { error: error.message, handled: true };
                    }
                },
                validate: (result) => {
                    return {
                        success: result.error || result.handled,
                        message: 'Error properly handled',
                    };
                },
            },
            
            {
                name: 'content_extraction',
                description: 'Test content extraction from mock articles',
                category: 'extraction',
                setup: async () => {
                    localTestingTools.createMockArticle('extraction_test', {
                        title: 'Test Article for Extraction',
                        content: 'This is comprehensive test content for extraction testing.',
                        author: 'Test Author',
                        date: new Date().toISOString(),
                    });
                },
                execute: async () => {
                    const mockHtml = localTestingTools.getMockResponse('article_extraction_test');
                    return {
                        hasTitle: mockHtml?.includes('Test Article for Extraction'),
                        hasContent: mockHtml?.includes('comprehensive test content'),
                        hasAuthor: mockHtml?.includes('Test Author'),
                        htmlLength: mockHtml?.length || 0,
                    };
                },
                validate: (result) => {
                    const success = result.hasTitle && result.hasContent && result.hasAuthor;
                    return {
                        success,
                        message: `Extraction test: ${success ? 'PASSED' : 'FAILED'}`,
                    };
                },
            },
            
            {
                name: 'performance_test',
                description: 'Test performance with multiple operations',
                category: 'performance',
                execute: async () => {
                    const startTime = Date.now();
                    const operations = [];
                    
                    // Create multiple mock operations
                    for (let i = 0; i < 10; i++) {
                        operations.push(
                            localTestingTools.createMockRssFeed(`perf_${i}`, [
                                {
                                    title: `Performance Test ${i}`,
                                    link: `https://example.com/perf-${i}`,
                                    guid: `perf-${i}`,
                                    pubDate: new Date().toUTCString(),
                                    description: `Performance test ${i}`,
                                    source: 'PerfTest',
                                    sourceUrl: 'https://example.com',
                                },
                            ])
                        );
                    }
                    
                    await Promise.all(operations);
                    const duration = Date.now() - startTime;
                    
                    return {
                        operations: operations.length,
                        duration,
                        avgTime: duration / operations.length,
                    };
                },
                validate: (result) => {
                    const success = result.avgTime < 50; // Should be fast
                    return {
                        success,
                        message: `Performance: ${result.avgTime.toFixed(2)}ms avg (${success ? 'GOOD' : 'SLOW'})`,
                    };
                },
            },
            
            {
                name: 'storage_test',
                description: 'Test local storage functionality',
                category: 'storage',
                execute: async () => {
                    const testKey = 'scenario_test_data';
                    const testData = {
                        timestamp: new Date().toISOString(),
                        data: 'Test storage data',
                        nested: { value: 123 },
                    };
                    
                    // Store data
                    await localStorage.setValue(testKey, testData, { category: 'test' });
                    
                    // Retrieve data
                    const retrieved = await localStorage.getValue(testKey);
                    
                    // Clean up
                    await localStorage.deleteValue(testKey);
                    
                    return {
                        stored: true,
                        retrieved: retrieved !== null,
                        dataMatches: JSON.stringify(retrieved) === JSON.stringify(testData),
                    };
                },
                validate: (result) => {
                    const success = result.stored && result.retrieved && result.dataMatches;
                    return {
                        success,
                        message: `Storage test: ${success ? 'PASSED' : 'FAILED'}`,
                    };
                },
            },
            
            {
                name: 'concurrent_operations',
                description: 'Test concurrent operations handling',
                category: 'concurrency',
                execute: async () => {
                    const concurrentOps = 5;
                    const operations = [];
                    
                    for (let i = 0; i < concurrentOps; i++) {
                        operations.push(
                            (async () => {
                                const startTime = Date.now();
                                localTestingTools.createMockRssFeed(`concurrent_${i}`);
                                return Date.now() - startTime;
                            })()
                        );
                    }
                    
                    const results = await Promise.all(operations);
                    const totalTime = results.reduce((sum, time) => sum + time, 0);
                    
                    return {
                        operations: concurrentOps,
                        totalTime,
                        avgTime: totalTime / concurrentOps,
                        maxTime: Math.max(...results),
                        minTime: Math.min(...results),
                    };
                },
                validate: (result) => {
                    const success = result.avgTime < 100 && result.maxTime < 200;
                    return {
                        success,
                        message: `Concurrency: ${result.avgTime.toFixed(2)}ms avg, ${result.maxTime}ms max`,
                    };
                },
            },
            
            {
                name: 'memory_usage',
                description: 'Test memory usage patterns',
                category: 'memory',
                execute: async () => {
                    const initialMemory = process.memoryUsage();
                    
                    // Create memory-intensive operations
                    const largeData = [];
                    for (let i = 0; i < 1000; i++) {
                        largeData.push(localTestingTools.createMockRssFeed(`memory_${i}`));
                    }
                    
                    const peakMemory = process.memoryUsage();
                    
                    // Clean up
                    largeData.length = 0;
                    
                    const finalMemory = process.memoryUsage();
                    
                    return {
                        initialHeap: Math.round(initialMemory.heapUsed / 1024 / 1024),
                        peakHeap: Math.round(peakMemory.heapUsed / 1024 / 1024),
                        finalHeap: Math.round(finalMemory.heapUsed / 1024 / 1024),
                        memoryIncrease: Math.round((peakMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024),
                    };
                },
                validate: (result) => {
                    const success = result.memoryIncrease < 100; // Less than 100MB increase
                    return {
                        success,
                        message: `Memory: ${result.memoryIncrease}MB increase (${success ? 'GOOD' : 'HIGH'})`,
                    };
                },
            },
        ];

        // Load scenarios
        for (const scenario of scenarios) {
            this.scenarios.set(scenario.name, scenario);
            await localTestingTools.createTestScenario(scenario.name, scenario);
        }

        log.info(`Loaded ${scenarios.length} test scenarios`);
    }

    async runAllScenarios() {
        console.log('🎭 Running Test Scenarios');
        console.log('=========================');

        const categories = new Set();
        for (const scenario of this.scenarios.values()) {
            categories.add(scenario.category);
        }

        for (const category of categories) {
            console.log(`\n📂 Category: ${category.toUpperCase()}`);
            console.log('-'.repeat(40));

            const categoryScenarios = Array.from(this.scenarios.values())
                .filter(s => s.category === category);

            for (const scenario of categoryScenarios) {
                await this.runScenario(scenario);
            }
        }

        this.generateReport();
    }

    async runScenario(scenario) {
        console.log(`\n🎬 Running: ${scenario.name}`);
        console.log(`   ${scenario.description}`);

        const startTime = Date.now();

        try {
            // Setup
            if (scenario.setup) {
                await scenario.setup();
            }

            // Execute
            const result = await scenario.execute(scenario.input);
            
            // Validate
            const validation = scenario.validate ? scenario.validate(result) : { success: true, message: 'No validation' };
            
            const duration = Date.now() - startTime;
            
            const scenarioResult = {
                name: scenario.name,
                category: scenario.category,
                success: validation.success,
                result,
                validation,
                duration,
                timestamp: new Date().toISOString(),
            };

            this.results.push(scenarioResult);

            const status = validation.success ? '✅ PASSED' : '❌ FAILED';
            console.log(`   ${status} (${duration}ms) - ${validation.message}`);

        } catch (error) {
            const duration = Date.now() - startTime;
            
            const scenarioResult = {
                name: scenario.name,
                category: scenario.category,
                success: false,
                error: error.message,
                duration,
                timestamp: new Date().toISOString(),
            };

            this.results.push(scenarioResult);
            console.log(`   💥 ERROR (${duration}ms) - ${error.message}`);
        }
    }

    generateReport() {
        const totalScenarios = this.results.length;
        const passed = this.results.filter(r => r.success).length;
        const failed = totalScenarios - passed;
        const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

        console.log('\n📊 Scenario Results Summary');
        console.log('============================');
        console.log(`Total Scenarios: ${totalScenarios}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Success Rate: ${((passed / totalScenarios) * 100).toFixed(1)}%`);
        console.log(`Total Duration: ${totalDuration}ms`);
        console.log(`Average Duration: ${Math.round(totalDuration / totalScenarios)}ms`);

        // Category breakdown
        const categories = {};
        for (const result of this.results) {
            if (!categories[result.category]) {
                categories[result.category] = { total: 0, passed: 0 };
            }
            categories[result.category].total++;
            if (result.success) {
                categories[result.category].passed++;
            }
        }

        console.log('\n📂 Results by Category:');
        for (const [category, stats] of Object.entries(categories)) {
            const rate = ((stats.passed / stats.total) * 100).toFixed(1);
            console.log(`  ${category}: ${stats.passed}/${stats.total} (${rate}%)`);
        }

        if (failed > 0) {
            console.log('\n❌ Failed Scenarios:');
            this.results
                .filter(r => !r.success)
                .forEach(r => {
                    console.log(`  - ${r.name}: ${r.error || r.validation?.message || 'Unknown error'}`);
                });
        }

        // Save detailed report
        const report = {
            summary: {
                total: totalScenarios,
                passed,
                failed,
                successRate: `${((passed / totalScenarios) * 100).toFixed(1)}%`,
                totalDuration,
                averageDuration: Math.round(totalDuration / totalScenarios),
            },
            categories,
            results: this.results,
            timestamp: new Date().toISOString(),
        };

        return report;
    }

    async cleanup() {
        await localTestingTools.cleanup();
        await localStorage.shutdown();
        await debugLogger.shutdown();
        await Actor.exit();
    }
}

// Run scenarios if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new ScenarioRunner();
    
    try {
        await runner.initialize();
        await runner.runAllScenarios();
        console.log('\n🎉 All scenarios completed!');
    } catch (error) {
        console.error('\n💥 Scenario runner failed:', error.message);
        process.exit(1);
    } finally {
        await runner.cleanup();
    }
}
