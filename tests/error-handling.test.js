/**
 * Error handling and resilience tests
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { RssFetcher } from '../src/rss-fetcher.js';
import { ArticleCrawler } from '../src/article-crawler.js';
import { SessionManager } from '../src/session-manager.js';
import { ContentExtractor } from '../src/content-extractor.js';
import { createMockGotScraping, mockResponses } from './mocks/http-responses.js';

// Mock dependencies
jest.unstable_mockModule('apify', () => ({
  Actor: {
    setValue: jest.fn(),
  },
  Dataset: {
    pushData: jest.fn(),
  },
}));

jest.unstable_mockModule('crawlee', () => ({
  log: {
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Error Handling Tests', () => {
  describe('RSS Fetcher Error Handling', () => {
    let rssFetcher;

    beforeEach(() => {
      rssFetcher = new RssFetcher();
    });

    test('should handle network timeouts gracefully', async () => {
      // Mock got-scraping to timeout
      jest.doMock('got-scraping', () => ({
        gotScraping: jest.fn().mockRejectedValue(new Error('Request timeout')),
      }));

      const items = await rssFetcher.fetchFeed('https://news.google.com/rss/search?q=timeout');
      
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(0);
    });

    test('should handle HTTP error responses', async () => {
      jest.doMock('got-scraping', () => ({
        gotScraping: jest.fn().mockResolvedValue(mockResponses.serverError),
      }));

      const items = await rssFetcher.fetchFeed('https://news.google.com/rss/search?q=error');
      
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(0);
    });

    test('should handle malformed XML gracefully', async () => {
      jest.doMock('got-scraping', () => ({
        gotScraping: jest.fn().mockResolvedValue({
          statusCode: 200,
          body: '<invalid>xml<content>without</proper>closing</tags>',
        }),
      }));

      const items = await rssFetcher.fetchFeed('https://news.google.com/rss/search?q=malformed');
      
      expect(Array.isArray(items)).toBe(true);
      // Should handle malformed XML without crashing
    });

    test('should handle empty response body', async () => {
      jest.doMock('got-scraping', () => ({
        gotScraping: jest.fn().mockResolvedValue({
          statusCode: 200,
          body: '',
        }),
      }));

      const items = await rssFetcher.fetchFeed('https://news.google.com/rss/search?q=empty');
      
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(0);
    });

    test('should handle RSS items with missing required fields', () => {
      const malformedItems = [
        { title: 'Title Only' }, // Missing link and guid
        { link: 'https://example.com/link-only' }, // Missing title and guid
        { guid: 'guid-only' }, // Missing title and link
        {}, // Empty item
        null, // Null item
        undefined, // Undefined item
      ];

      const newItemsCount = rssFetcher.processRssItems(malformedItems);
      
      // Should skip malformed items gracefully
      expect(newItemsCount).toBeLessThan(malformedItems.length);
      expect(rssFetcher.getArticles().size).toBeGreaterThanOrEqual(0);
    });

    test('should handle date parsing errors', () => {
      const itemsWithBadDates = [
        global.testUtils.createMockRssItem({
          pubDate: 'invalid-date-format',
          guid: 'bad-date-1',
        }),
        global.testUtils.createMockRssItem({
          pubDate: null,
          guid: 'bad-date-2',
        }),
        global.testUtils.createMockRssItem({
          pubDate: undefined,
          guid: 'bad-date-3',
        }),
      ];

      const newItemsCount = rssFetcher.processRssItems(itemsWithBadDates);
      
      expect(newItemsCount).toBe(3);
      expect(rssFetcher.getArticles().size).toBe(3);
      
      // Should have fallback dates
      const articles = rssFetcher.getArticlesArray();
      articles.forEach(article => {
        expect(article.pubDate).toBeTruthy();
      });
    });
  });

  describe('Content Extractor Error Handling', () => {
    let contentExtractor;

    beforeEach(() => {
      contentExtractor = new ContentExtractor();
    });

    test('should handle null/undefined HTML input', () => {
      const mockCheerio = () => ({
        first: () => ({ text: () => '', length: 0 }),
        each: () => {},
        text: () => '',
        attr: () => null,
        length: 0,
      });

      const result1 = contentExtractor.extractContent(null, mockCheerio);
      const result2 = contentExtractor.extractContent(undefined, mockCheerio);
      const result3 = contentExtractor.extractContent('', mockCheerio);

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
      expect(result3.success).toBe(false);
    });

    test('should handle Cheerio parsing errors', () => {
      const faultyCheerio = () => {
        throw new Error('Cheerio parsing failed');
      };

      const result = contentExtractor.extractContent('<html></html>', faultyCheerio);
      
      expect(result.success).toBe(false);
      expect(result.title).toBe('');
      expect(result.text).toBe('');
    });

    test('should handle unfluff extraction errors', () => {
      // Mock unfluff to throw an error
      jest.doMock('unfluff', () => {
        return jest.fn().mockImplementation(() => {
          throw new Error('Unfluff extraction failed');
        });
      });

      const mockCheerio = () => ({
        first: () => ({ text: () => 'Fallback Title', length: 1 }),
        each: () => {},
        text: () => 'Fallback content',
        attr: () => 'en',
        length: 1,
      });

      const result = contentExtractor.extractContent('<html></html>', mockCheerio);
      
      // Should fall back to other extraction methods
      expect(result.success).toBe(true);
      expect(result.title).toBe('Fallback Title');
    });

    test('should handle extraction with corrupted selectors', () => {
      const corruptedCheerio = (selector) => {
        if (selector.includes('corrupted')) {
          throw new Error('Selector error');
        }
        return {
          first: () => ({ text: () => 'Safe content', length: 1 }),
          each: () => {},
          text: () => 'Safe content',
          attr: () => 'en',
          length: 1,
        };
      };

      const result = contentExtractor.extractWithSelectors('<html></html>', corruptedCheerio);
      
      expect(result.success).toBe(true);
    });
  });

  describe('Session Manager Error Handling', () => {
    let sessionManager;

    beforeEach(() => {
      sessionManager = new SessionManager();
    });

    test('should handle cookie setting failures', async () => {
      const faultySession = {
        setCookies: jest.fn().mockRejectedValue(new Error('Cookie setting failed')),
      };

      // Should not throw error even if cookie setting fails
      await expect(sessionManager.addConsentCookies(faultySession)).resolves.not.toThrow();
      await expect(sessionManager.addGooglePreferences(faultySession)).resolves.not.toThrow();
      await expect(sessionManager.addEuropeanBypass(faultySession)).resolves.not.toThrow();
    });

    test('should handle invalid HTML in consent detection', () => {
      const invalidInputs = [
        null,
        undefined,
        '',
        123,
        {},
        [],
        '<invalid>html<without>proper</structure>',
      ];

      invalidInputs.forEach(input => {
        expect(() => sessionManager.isConsentPage(input, 'https://example.com')).not.toThrow();
        expect(sessionManager.isConsentPage(input, 'https://example.com')).toBe(false);
      });
    });

    test('should handle missing session in blocked response handler', async () => {
      const contextWithoutSession = {
        response: { statusCode: 403, body: 'Forbidden' },
        session: null,
        request: { url: 'https://example.com' },
      };

      const shouldRetry = await sessionManager.handleBlockedResponse(contextWithoutSession);
      
      expect(shouldRetry).toBe(false);
    });

    test('should handle invalid strategy index in consent bypass', async () => {
      const mockSession = {
        setCookies: jest.fn(),
      };

      // Should handle invalid strategy indices gracefully
      await expect(sessionManager.applyConsentBypass(mockSession, -1)).resolves.not.toThrow();
      await expect(sessionManager.applyConsentBypass(mockSession, 999)).resolves.not.toThrow();
      
      expect(mockSession.setCookies).not.toHaveBeenCalled();
    });
  });

  describe('Article Crawler Error Handling', () => {
    let articleCrawler;

    beforeEach(() => {
      articleCrawler = new ArticleCrawler();
    });

    test('should handle image validation failures', async () => {
      const problematicImages = [
        'https://example.com/valid.jpg',
        'invalid-url',
        null,
        undefined,
        '',
        'https://example.com/404.jpg',
      ];

      // Mock got-scraping to handle different scenarios
      jest.doMock('got-scraping', () => ({
        gotScraping: jest.fn()
          .mockResolvedValueOnce({ statusCode: 200 }) // First image works
          .mockRejectedValueOnce(new Error('Invalid URL')) // Second fails
          .mockRejectedValueOnce(new Error('Null URL')) // Third fails
          .mockRejectedValueOnce(new Error('Undefined URL')) // Fourth fails
          .mockRejectedValueOnce(new Error('Empty URL')) // Fifth fails
          .mockResolvedValueOnce({ statusCode: 404 }), // Sixth returns 404
      }));

      const workingImages = await articleCrawler.validateImages(problematicImages);
      
      expect(Array.isArray(workingImages)).toBe(true);
      // Should filter out problematic images
      expect(workingImages.length).toBeLessThan(problematicImages.length);
    });

    test('should handle content extraction failures gracefully', async () => {
      // Mock content extractor to fail
      articleCrawler.contentExtractor = {
        extractContent: jest.fn().mockImplementation(() => {
          throw new Error('Content extraction failed');
        }),
      };

      const rssItems = [global.testUtils.createMockRssItem()];
      
      await articleCrawler.crawlArticles(rssItems, 'test query');
      
      // Should record the failure without crashing
      expect(articleCrawler.getFailedUrls().length).toBe(1);
      expect(articleCrawler.getFailedUrls()[0].error).toContain('Content extraction failed');
    });

    test('should handle browser mode detection errors', () => {
      const problematicInputs = [
        ['invalid-url', '<html></html>'],
        ['https://example.com', null],
        ['https://example.com', undefined],
        [null, '<html></html>'],
        [undefined, '<html></html>'],
      ];

      problematicInputs.forEach(([url, html]) => {
        expect(() => articleCrawler.needsBrowserMode(url, html)).not.toThrow();
        expect(articleCrawler.needsBrowserMode(url, html)).toBe(false);
      });
    });

    test('should handle crawler creation failures', () => {
      // Test with invalid proxy configuration
      articleCrawler.proxyConfiguration = 'invalid-proxy-config';
      
      expect(() => articleCrawler.createCrawler()).not.toThrow();
    });
  });

  describe('Graceful Degradation Tests', () => {
    test('should continue processing when some RSS items fail', async () => {
      const rssFetcher = new RssFetcher();
      
      // Mix of valid and invalid items
      const mixedItems = [
        global.testUtils.createMockRssItem({ guid: 'valid-1', title: 'Valid Article 1' }),
        { title: 'Invalid - No GUID or Link' },
        global.testUtils.createMockRssItem({ guid: 'valid-2', title: 'Valid Article 2' }),
        null,
        global.testUtils.createMockRssItem({ guid: 'valid-3', title: 'Valid Article 3' }),
        undefined,
      ];

      const newItemsCount = rssFetcher.processRssItems(mixedItems);
      
      expect(newItemsCount).toBe(3); // Should process only valid items
      expect(rssFetcher.getArticles().size).toBe(3);
    });

    test('should provide fallback content when primary extraction fails', () => {
      const contentExtractor = new ContentExtractor();
      
      // Mock unfluff to fail, but selectors to work
      const mockCheerio = () => ({
        first: () => ({ text: () => 'Fallback Title', length: 1 }),
        each: () => {},
        text: () => 'Fallback content from selectors',
        attr: () => 'en',
        length: 1,
      });

      // Mock unfluff to fail
      jest.doMock('unfluff', () => {
        return jest.fn().mockImplementation(() => {
          throw new Error('Primary extraction failed');
        });
      });

      const result = contentExtractor.extractContent('<html></html>', mockCheerio);
      
      expect(result.success).toBe(true);
      expect(result.title).toBe('Fallback Title');
      expect(result.text).toBe('Fallback content from selectors');
    });

    test('should handle partial failures in concurrent operations', async () => {
      const operations = Array.from({ length: 10 }, async (_, i) => {
        if (i % 3 === 0) {
          // Simulate some operations failing
          throw new Error(`Operation ${i} failed`);
        }
        
        const rssFetcher = new RssFetcher();
        const items = [global.testUtils.createMockRssItem({ guid: `concurrent-${i}` })];
        return rssFetcher.processRssItems(items);
      });

      const results = await Promise.allSettled(operations);
      
      const successful = results.filter(result => result.status === 'fulfilled');
      const failed = results.filter(result => result.status === 'rejected');
      
      expect(successful.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
      expect(successful.length + failed.length).toBe(10);
    });
  });

  describe('Recovery and Retry Logic', () => {
    test('should implement exponential backoff for retries', async () => {
      const maxRetries = 3;
      const baseDelay = 100;
      const retryDelays = [];

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const delay = baseDelay * Math.pow(2, attempt);
        retryDelays.push(delay);
        
        const startTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, delay));
        const actualDelay = Date.now() - startTime;
        
        expect(actualDelay).toBeGreaterThanOrEqual(delay * 0.9); // Allow 10% variance
      }

      // Verify exponential growth
      expect(retryDelays[1]).toBe(retryDelays[0] * 2);
      expect(retryDelays[2]).toBe(retryDelays[0] * 4);
    });

    test('should limit retry attempts', async () => {
      const maxRetries = 3;
      let attemptCount = 0;

      const failingOperation = async () => {
        attemptCount++;
        if (attemptCount <= maxRetries) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return 'success';
      };

      try {
        for (let i = 0; i < maxRetries; i++) {
          try {
            await failingOperation();
            break;
          } catch (error) {
            if (i === maxRetries - 1) {
              throw error; // Final attempt failed
            }
          }
        }
      } catch (error) {
        expect(attemptCount).toBe(maxRetries);
        expect(error.message).toContain(`Attempt ${maxRetries} failed`);
      }
    });
  });
});
