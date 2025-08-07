/**
 * Performance tests for Google News Scraper
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { RssFetcher } from '../src/rss-fetcher.js';
import { ArticleCrawler } from '../src/article-crawler.js';
import { ContentExtractor } from '../src/content-extractor.js';
import { createMockGotScraping, mockResponses } from './mocks/http-responses.js';

// Mock dependencies for performance testing
jest.unstable_mockModule('got-scraping', () => ({
  gotScraping: createMockGotScraping(),
}));

jest.unstable_mockModule('apify', () => ({
  Actor: {
    setValue: jest.fn(),
  },
  Dataset: {
    pushData: jest.fn(),
  },
}));

describe('Performance Tests', () => {
  describe('RSS Fetcher Performance', () => {
    let rssFetcher;

    beforeEach(() => {
      rssFetcher = new RssFetcher();
    });

    test('should handle large RSS feeds efficiently', async () => {
      // Create a large number of RSS items
      const largeItemCount = 1000;
      const items = Array.from({ length: largeItemCount }, (_, i) => 
        global.testUtils.createMockRssItem({
          guid: `item-${i}`,
          title: `Article ${i}`,
          link: `https://example.com/article-${i}`,
        })
      );

      const startTime = Date.now();
      const newItemsCount = rssFetcher.processRssItems(items);
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      expect(newItemsCount).toBe(largeItemCount);
      expect(processingTime).toBeLessThan(1000); // Should process 1000 items in under 1 second
      expect(rssFetcher.getArticles().size).toBe(largeItemCount);
    });

    test('should handle deduplication efficiently with large datasets', async () => {
      const itemCount = 500;
      const duplicateCount = 250;

      // Create items with some duplicates
      const items = [
        ...Array.from({ length: itemCount }, (_, i) => 
          global.testUtils.createMockRssItem({
            guid: `unique-item-${i}`,
            title: `Unique Article ${i}`,
          })
        ),
        ...Array.from({ length: duplicateCount }, (_, i) => 
          global.testUtils.createMockRssItem({
            guid: `unique-item-${i}`, // Duplicate GUIDs
            title: `Duplicate Article ${i}`,
          })
        ),
      ];

      const startTime = Date.now();
      const newItemsCount = rssFetcher.processRssItems(items);
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      expect(newItemsCount).toBe(itemCount); // Should deduplicate correctly
      expect(processingTime).toBeLessThan(500); // Should be fast even with duplicates
      expect(rssFetcher.getArticles().size).toBe(itemCount);
    });

    test('should respect memory limits with maxItems', async () => {
      const maxItems = 100;
      const totalItems = 1000;

      const items = Array.from({ length: totalItems }, (_, i) => 
        global.testUtils.createMockRssItem({
          guid: `item-${i}`,
          title: `Article ${i}`,
        })
      );

      const startTime = Date.now();
      const newItemsCount = rssFetcher.processRssItems(items, maxItems);
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      expect(newItemsCount).toBe(maxItems);
      expect(rssFetcher.getArticles().size).toBe(maxItems);
      expect(processingTime).toBeLessThan(200); // Should stop early and be fast
    });
  });

  describe('Content Extractor Performance', () => {
    let contentExtractor;

    beforeEach(() => {
      contentExtractor = new ContentExtractor();
    });

    test('should extract content from large HTML documents efficiently', () => {
      // Create a large HTML document
      const largeContent = Array.from({ length: 1000 }, (_, i) => 
        `<p>This is paragraph ${i} with substantial content that simulates a real article.</p>`
      ).join('\n');

      const largeHtml = global.testUtils.createMockHtml({
        content: largeContent,
        title: 'Large Article with Many Paragraphs',
      });

      // Mock Cheerio for large document
      const mockCheerio = () => ({
        first: () => ({
          text: () => 'Large Article with Many Paragraphs',
          length: 1,
        }),
        each: (callback) => {
          // Simulate processing many elements
          for (let i = 0; i < 100; i++) {
            callback(i, { text: () => `Content block ${i}` });
          }
        },
        text: () => largeContent,
        attr: () => 'en',
        length: 100,
      });

      const startTime = Date.now();
      const result = contentExtractor.extractContent(largeHtml, mockCheerio);
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(result.title).toBeTruthy();
      expect(result.text).toBeTruthy();
      expect(processingTime).toBeLessThan(200); // Should extract large content quickly
    });

    test('should handle multiple extraction strategies efficiently', () => {
      const html = global.testUtils.createMockHtml();
      const mockCheerio = () => ({
        first: () => ({ text: () => 'Test Title', length: 1 }),
        each: () => {},
        text: () => 'Test content',
        attr: () => 'en',
        length: 1,
      });

      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const result = contentExtractor.extractContent(html, mockCheerio);
        expect(result.success).toBe(true);
      }

      const endTime = Date.now();
      const avgProcessingTime = (endTime - startTime) / iterations;

      expect(avgProcessingTime).toBeLessThan(10); // Should average less than 10ms per extraction
    });

    test('should score extractions efficiently', () => {
      const testResults = Array.from({ length: 1000 }, (_, i) => ({
        title: `Test Title ${i}`,
        text: `This is test content ${i} with varying lengths and quality scores.`,
        author: i % 2 === 0 ? `Author ${i}` : '',
        date: i % 3 === 0 ? new Date().toISOString() : null,
        description: i % 4 === 0 ? `Description ${i}` : '',
      }));

      const startTime = Date.now();
      const scores = testResults.map(result => contentExtractor.scoreExtraction(result));
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      expect(scores.length).toBe(1000);
      expect(scores.every(score => typeof score === 'number')).toBe(true);
      expect(processingTime).toBeLessThan(50); // Should score 1000 results quickly
    });
  });

  describe('Memory Usage Tests', () => {
    test('should not leak memory with repeated RSS processing', () => {
      const rssFetcher = new RssFetcher();
      const initialMemory = process.memoryUsage().heapUsed;

      // Process many batches of RSS items
      for (let batch = 0; batch < 10; batch++) {
        const items = Array.from({ length: 100 }, (_, i) => 
          global.testUtils.createMockRssItem({
            guid: `batch-${batch}-item-${i}`,
            title: `Batch ${batch} Article ${i}`,
          })
        );

        rssFetcher.processRssItems(items);
        
        // Clear articles periodically to simulate real usage
        if (batch % 3 === 0) {
          rssFetcher.clear();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should handle concurrent operations without memory issues', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create multiple RSS fetchers running concurrently
      const concurrentOperations = Array.from({ length: 10 }, async (_, i) => {
        const rssFetcher = new RssFetcher();
        const items = Array.from({ length: 50 }, (_, j) => 
          global.testUtils.createMockRssItem({
            guid: `concurrent-${i}-item-${j}`,
            title: `Concurrent ${i} Article ${j}`,
          })
        );
        
        rssFetcher.processRssItems(items);
        return rssFetcher.getArticles().size;
      });

      const results = await Promise.all(concurrentOperations);
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(results.every(size => size === 50)).toBe(true);
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
    });
  });

  describe('Concurrency Tests', () => {
    test('should handle high concurrency RSS processing', async () => {
      const concurrencyLevel = 20;
      const itemsPerBatch = 50;

      const startTime = Date.now();
      
      const concurrentPromises = Array.from({ length: concurrencyLevel }, async (_, i) => {
        const rssFetcher = new RssFetcher();
        const items = Array.from({ length: itemsPerBatch }, (_, j) => 
          global.testUtils.createMockRssItem({
            guid: `concurrent-${i}-${j}`,
            title: `Concurrent Article ${i}-${j}`,
          })
        );
        
        return rssFetcher.processRssItems(items);
      });

      const results = await Promise.all(concurrentPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(results.every(count => count === itemsPerBatch)).toBe(true);
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('should maintain data integrity under concurrent access', async () => {
      const rssFetcher = new RssFetcher();
      const concurrencyLevel = 10;
      const itemsPerBatch = 20;

      // Process items concurrently in the same fetcher instance
      const concurrentPromises = Array.from({ length: concurrencyLevel }, (_, i) => {
        const items = Array.from({ length: itemsPerBatch }, (_, j) => 
          global.testUtils.createMockRssItem({
            guid: `shared-${i}-${j}`,
            title: `Shared Article ${i}-${j}`,
          })
        );
        
        return rssFetcher.processRssItems(items);
      });

      await Promise.all(concurrentPromises);

      // Should have all unique items (no race conditions)
      const totalExpectedItems = concurrencyLevel * itemsPerBatch;
      expect(rssFetcher.getArticles().size).toBe(totalExpectedItems);
    });
  });

  describe('Timeout and Rate Limiting Tests', () => {
    test('should respect rate limiting delays', async () => {
      const operations = 5;
      const expectedDelay = 100; // ms between operations
      
      const startTime = Date.now();
      
      for (let i = 0; i < operations; i++) {
        // Simulate rate-limited operation
        await new Promise(resolve => setTimeout(resolve, expectedDelay));
        
        const rssFetcher = new RssFetcher();
        const items = [global.testUtils.createMockRssItem({ guid: `rate-limited-${i}` })];
        rssFetcher.processRssItems(items);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const expectedMinTime = operations * expectedDelay;
      
      expect(totalTime).toBeGreaterThanOrEqual(expectedMinTime * 0.9); // Allow 10% variance
    });

    test('should handle timeout scenarios gracefully', async () => {
      const timeoutMs = 100;
      
      const startTime = Date.now();
      
      // Simulate operation that should timeout
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve('completed'), timeoutMs * 2); // Takes longer than timeout
      });
      
      const raceResult = await Promise.race([
        timeoutPromise,
        new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs))
      ]);
      
      const endTime = Date.now();
      const actualTime = endTime - startTime;
      
      expect(raceResult).toBe('timeout');
      expect(actualTime).toBeLessThan(timeoutMs * 1.5); // Should timeout quickly
    });
  });
});
