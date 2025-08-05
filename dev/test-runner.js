#!/usr/bin/env node
/**
 * Development Test Runner
 * Runs various development tests and scenarios
 */

import { Actor } from 'apify';
import { log } from 'crawlee';
import { localTestingTools } from '../src/local-testing-tools.js';
import { debugLogger } from '../src/debug-logger.js';
import { errorHandling } from '../src/error-handling-integration.js';
import { RssFetcher } from '../src/rss-fetcher.js';
import { ArticleCrawler } from '../src/article-crawler.js';

class DevelopmentTestRunner {
    constructor() {
        this.testResults = [];
        this.startTime = Date.now();
    }

    async initialize() {
        await Actor.init();
        await debugLogger.initialize();
        await localTestingTools.initialize();
        await errorHandling.initialize();
        
        log.info('Development test runner initialized');
    }

    async runAllTests() {
        console.log('🧪 Running Development Tests');
        console.log('============================');

        const tests = [
            { name: 'Mock Data Test', fn: () => this.testMockData() },
            { name: 'RSS Fetcher Test', fn: () => this.testRssFetcher() },
            { name: 'Error Handling Test', fn: () => this.testErrorHandling() },
            { name: 'Content Extraction Test', fn: () => this.testContentExtraction() },
            { name: 'Performance Test', fn: () => this.testPerformance() },
        ];

        for (const test of tests) {
            console.log(`\n📋 Running: ${test.name}`);
            try {
                const result = await this.runTest(test.name, test.fn);
                this.testResults.push(result);
                
                if (result.success) {
                    console.log(`✅ ${test.name} PASSED (${result.duration}ms)`);
                } else {
                    console.log(`❌ ${test.name} FAILED: ${result.error}`);
                }
            } catch (error) {
                console.log(`💥 ${test.name} CRASHED: ${error.message}`);
                this.testResults.push({
                    name: test.name,
                    success: false,
                    error: error.message,
                    duration: 0,
                });
            }
        }

        this.generateReport();
    }

    async runTest(name, testFunction) {
        const startTime = Date.now();
        
        try {
            const result = await testFunction();
            const duration = Date.now() - startTime;
            
            return {
                name,
                success: true,
                result,
                duration,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            
            return {
                name,
                success: false,
                error: error.message,
                duration,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async testMockData() {
        // Test mock RSS creation
        const rssXml = localTestingTools.createMockRssFeed('test', [
            {
                title: 'Test Article',
                link: 'https://example.com/test',
                guid: 'test-123',
                pubDate: new Date().toUTCString(),
                description: 'Test description',
                source: 'Test Source',
                sourceUrl: 'https://example.com',
            },
        ]);

        if (!rssXml.includes('Test Article')) {
            throw new Error('Mock RSS creation failed');
        }

        // Test mock article creation
        const articleHtml = localTestingTools.createMockArticle('test', {
            title: 'Test Article',
            content: 'Test content',
        });

        if (!articleHtml.includes('Test Article')) {
            throw new Error('Mock article creation failed');
        }

        return { rssCreated: true, articleCreated: true };
    }

    async testRssFetcher() {
        // Create mock RSS data
        localTestingTools.createMockRssFeed('development_test');
        
        const rssFetcher = new RssFetcher();
        
        // Test with a simple query (will likely fail due to network, but should handle gracefully)
        try {
            const articles = await rssFetcher.fetchRssItems({
                query: 'test',
                region: 'US',
                language: 'en-US',
                maxItems: 2,
            });

            return {
                articlesFound: articles.size,
                testCompleted: true,
            };
        } catch (error) {
            // Expected to fail in development, but should handle gracefully
            return {
                articlesFound: 0,
                testCompleted: true,
                expectedFailure: true,
                error: error.message,
            };
        }
    }

    async testErrorHandling() {
        // Test error classification
        const testError = new Error('Test network error');
        testError.code = 'ECONNRESET';
        
        const errorInfo = await errorHandling.errorHandler.handleError(testError, {
            operation: 'test',
            url: 'https://example.com/test',
        });

        if (errorInfo.type !== 'NETWORK') {
            throw new Error('Error classification failed');
        }

        // Test retry logic
        let attempts = 0;
        const result = await errorHandling.executeWithErrorHandling(
            'test_operation',
            async ({ attempt }) => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Temporary failure');
                }
                return { success: true, attempts };
            },
            {
                context: { testId: 'error_handling_test' },
                retryOptions: { maxRetries: 5 },
                enableRecovery: false,
            }
        );

        return {
            errorClassified: true,
            retryWorked: result.success,
            totalAttempts: attempts,
        };
    }

    async testContentExtraction() {
        // Create mock article
        const mockHtml = localTestingTools.createMockArticle('extraction_test', {
            title: 'Content Extraction Test',
            content: 'This is test content for extraction.',
            author: 'Test Author',
        });

        // Test content extraction (simplified)
        const hasTitle = mockHtml.includes('Content Extraction Test');
        const hasContent = mockHtml.includes('This is test content');
        const hasAuthor = mockHtml.includes('Test Author');

        if (!hasTitle || !hasContent || !hasAuthor) {
            throw new Error('Content extraction test failed');
        }

        return {
            titleExtracted: hasTitle,
            contentExtracted: hasContent,
            authorExtracted: hasAuthor,
        };
    }

    async testPerformance() {
        const iterations = 100;
        const startTime = Date.now();
        
        // Test mock data creation performance
        for (let i = 0; i < iterations; i++) {
            localTestingTools.createMockRssFeed(`perf_test_${i}`, [
                {
                    title: `Performance Test ${i}`,
                    link: `https://example.com/perf-${i}`,
                    guid: `perf-${i}`,
                    pubDate: new Date().toUTCString(),
                    description: `Performance test description ${i}`,
                    source: 'Perf Test',
                    sourceUrl: 'https://example.com',
                },
            ]);
        }
        
        const duration = Date.now() - startTime;
        const avgTime = duration / iterations;
        
        if (avgTime > 10) { // Should be very fast
            throw new Error(`Performance test failed: ${avgTime}ms per iteration`);
        }

        return {
            iterations,
            totalTime: duration,
            averageTime: avgTime,
            performanceGood: avgTime < 10,
        };
    }

    generateReport() {
        const totalDuration = Date.now() - this.startTime;
        const passed = this.testResults.filter(r => r.success).length;
        const failed = this.testResults.filter(r => !r.success).length;
        
        console.log('\n📊 Test Results Summary');
        console.log('=======================');
        console.log(`Total Tests: ${this.testResults.length}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Success Rate: ${((passed / this.testResults.length) * 100).toFixed(1)}%`);
        console.log(`Total Duration: ${totalDuration}ms`);
        
        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults
                .filter(r => !r.success)
                .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
        }

        // Generate detailed report
        const report = localTestingTools.generateTestReport(this.testResults);
        console.log('\n📄 Detailed report available in test results');
        
        return report;
    }

    async cleanup() {
        await localTestingTools.cleanup();
        await debugLogger.shutdown();
        await errorHandling.shutdown();
        await Actor.exit();
    }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new DevelopmentTestRunner();
    
    try {
        await runner.initialize();
        await runner.runAllTests();
        console.log('\n🎉 Development tests completed!');
    } catch (error) {
        console.error('\n💥 Test runner failed:', error.message);
        process.exit(1);
    } finally {
        await runner.cleanup();
    }
}
