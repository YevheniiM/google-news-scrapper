/**
 * Integration tests for ArticleCrawler
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ArticleCrawler } from '../src/article-crawler.js';
import { createMockGotScraping, mockResponses } from './mocks/http-responses.js';

// Mock dependencies
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

jest.unstable_mockModule('crawlee', () => ({
  CheerioCrawler: jest.fn().mockImplementation((options) => ({
    run: jest.fn().mockImplementation(async (requests) => {
      // Simulate crawler processing
      for (const request of requests) {
        const mockContext = {
          request,
          $: createMockCheerio(),
          body: mockResponses.articleSuccess.body,
          response: mockResponses.articleSuccess,
          session: { id: 'test-session' },
        };
        await options.requestHandler(mockContext);
      }
    }),
  })),
  PlaywrightCrawler: jest.fn().mockImplementation((options) => ({
    run: jest.fn().mockImplementation(async (requests) => {
      // Simulate browser crawler processing
      for (const request of requests) {
        const mockContext = {
          request,
          page: {
            content: () => Promise.resolve(mockResponses.articleSuccess.body),
          },
          response: mockResponses.articleSuccess,
          session: { id: 'test-session' },
        };
        await options.requestHandler(mockContext);
      }
    }),
  })),
  log: {
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Cheerio
function createMockCheerio() {
  return (selector) => ({
    each: jest.fn(),
    first: () => ({
      attr: jest.fn().mockReturnValue('https://example.com/image.jpg'),
    }),
    attr: jest.fn().mockReturnValue('Test content'),
    text: jest.fn().mockReturnValue('Test text'),
  });
}

describe('ArticleCrawler Integration', () => {
  let articleCrawler;

  beforeEach(() => {
    jest.clearAllMocks();
    articleCrawler = new ArticleCrawler(null, false);
  });

  describe('needsBrowserMode', () => {
    test('should detect JavaScript requirement', () => {
      const html = '<html><body><p>JavaScript is required to view this content</p></body></html>';
      const needsBrowser = articleCrawler.needsBrowserMode('https://example.com', html);
      
      expect(needsBrowser).toBe(true);
    });

    test('should not require browser for normal content', () => {
      const html = '<html><body><h1>Normal Article</h1><p>Content</p></body></html>';
      const needsBrowser = articleCrawler.needsBrowserMode('https://example.com', html);
      
      expect(needsBrowser).toBe(false);
    });

    test('should remember domains that need browser mode', () => {
      const html = '<html><body><p>Enable JavaScript to continue</p></body></html>';
      
      // First call should detect and remember
      const firstCall = articleCrawler.needsBrowserMode('https://jsrequired.com/article1', html);
      expect(firstCall).toBe(true);
      
      // Second call to same domain should return true even without JS indicators
      const secondCall = articleCrawler.needsBrowserMode('https://jsrequired.com/article2', '');
      expect(secondCall).toBe(true);
    });
  });

  describe('createCrawler', () => {
    test('should create CheerioCrawler by default', () => {
      const crawler = articleCrawler.createCrawler();
      expect(crawler).toBeDefined();
    });

    test('should create PlaywrightCrawler when useBrowser is true', () => {
      articleCrawler.useBrowser = true;
      const crawler = articleCrawler.createCrawler();
      expect(crawler).toBeDefined();
    });

    test('should not include proxy configuration when null', () => {
      articleCrawler.proxyConfiguration = null;
      const crawler = articleCrawler.createCrawler();
      expect(crawler).toBeDefined();
    });
  });

  describe('validateImages', () => {
    test('should validate working image URLs', async () => {
      const imageUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.png',
      ];
      
      // Mock got-scraping for image validation
      jest.doMock('got-scraping', () => ({
        gotScraping: jest.fn().mockResolvedValue({ statusCode: 200 }),
      }));
      
      const workingImages = await articleCrawler.validateImages(imageUrls);
      
      expect(Array.isArray(workingImages)).toBe(true);
    });

    test('should filter out broken image URLs', async () => {
      const imageUrls = [
        'https://example.com/working.jpg',
        'https://example.com/broken.jpg',
      ];
      
      // Mock got-scraping to return different responses
      jest.doMock('got-scraping', () => ({
        gotScraping: jest.fn()
          .mockResolvedValueOnce({ statusCode: 200 }) // First image works
          .mockRejectedValueOnce(new Error('Not found')), // Second image fails
      }));
      
      const workingImages = await articleCrawler.validateImages(imageUrls);
      
      expect(Array.isArray(workingImages)).toBe(true);
    });

    test('should handle empty image array', async () => {
      const workingImages = await articleCrawler.validateImages([]);
      
      expect(workingImages).toEqual([]);
    });

    test('should handle null/undefined image URLs', async () => {
      const workingImages = await articleCrawler.validateImages(null);
      
      expect(workingImages).toEqual([]);
    });
  });

  describe('crawlArticles', () => {
    test('should crawl articles successfully', async () => {
      const rssItems = [
        global.testUtils.createMockRssItem({
          title: 'Test Article 1',
          link: 'https://example.com/article1',
        }),
        global.testUtils.createMockRssItem({
          title: 'Test Article 2',
          link: 'https://example.com/article2',
        }),
      ];
      
      await articleCrawler.crawlArticles(rssItems, 'test query');
      
      // Should have processed articles without errors
      expect(articleCrawler.getFailedUrls().length).toBe(0);
    });

    test('should handle empty RSS items', async () => {
      await articleCrawler.crawlArticles([], 'test query');
      
      // Should complete without errors
      expect(articleCrawler.getFailedUrls().length).toBe(0);
    });

    test('should handle null RSS items', async () => {
      await articleCrawler.crawlArticles(null, 'test query');
      
      // Should complete without errors
      expect(articleCrawler.getFailedUrls().length).toBe(0);
    });

    test('should extract real URLs from Google News links', async () => {
      const rssItems = [
        global.testUtils.createMockRssItem({
          link: 'https://news.google.com/rss/articles/CBMiTest?oc=5',
        }),
      ];
      
      await articleCrawler.crawlArticles(rssItems, 'test query');
      
      // Should have processed the converted URL
      expect(articleCrawler.getFailedUrls().length).toBe(0);
    });
  });

  describe('runBrowserFallback', () => {
    test('should run browser fallback for failed requests', async () => {
      const requests = [
        {
          url: 'https://example.com/js-required',
          userData: global.testUtils.createMockRssItem(),
        },
      ];
      
      await articleCrawler.runBrowserFallback(requests);
      
      // Should complete without errors
      expect(articleCrawler.getFailedUrls().length).toBe(0);
    });

    test('should handle empty requests array', async () => {
      await articleCrawler.runBrowserFallback([]);
      
      // Should complete immediately
      expect(articleCrawler.getFailedUrls().length).toBe(0);
    });

    test('should restore original useBrowser setting', async () => {
      const originalUseBrowser = articleCrawler.useBrowser;
      
      await articleCrawler.runBrowserFallback([]);
      
      expect(articleCrawler.useBrowser).toBe(originalUseBrowser);
    });
  });

  describe('error handling', () => {
    test('should handle request handler errors', async () => {
      // Create crawler with failing request handler
      const failingCrawler = new ArticleCrawler();
      
      // Mock the content extractor to throw an error
      failingCrawler.contentExtractor = {
        extractContent: jest.fn().mockImplementation(() => {
          throw new Error('Extraction failed');
        }),
      };
      
      const rssItems = [global.testUtils.createMockRssItem()];
      
      await failingCrawler.crawlArticles(rssItems, 'test query');
      
      // Should have recorded the failed URL
      expect(failingCrawler.getFailedUrls().length).toBeGreaterThan(0);
    });

    test('should handle consent page detection', async () => {
      // Mock session manager to detect consent page
      articleCrawler.sessionManager = {
        isConsentPage: jest.fn().mockReturnValue(true),
        handleBlockedResponse: jest.fn().mockResolvedValue(false),
        getSessionPoolOptions: jest.fn().mockReturnValue({}),
      };
      
      const rssItems = [global.testUtils.createMockRssItem()];
      
      await articleCrawler.crawlArticles(rssItems, 'test query');
      
      // Should have detected consent page
      expect(articleCrawler.sessionManager.isConsentPage).toHaveBeenCalled();
    });
  });

  describe('getFailedUrls', () => {
    test('should return failed URLs array', () => {
      const failedUrls = articleCrawler.getFailedUrls();
      
      expect(Array.isArray(failedUrls)).toBe(true);
    });

    test('should track failed URLs', () => {
      // Manually add a failed URL for testing
      articleCrawler.failedUrls.push({
        url: 'https://example.com/failed',
        error: 'Test error',
        timestamp: new Date().toISOString(),
      });
      
      const failedUrls = articleCrawler.getFailedUrls();
      
      expect(failedUrls.length).toBe(1);
      expect(failedUrls[0]).toHaveProperty('url');
      expect(failedUrls[0]).toHaveProperty('error');
      expect(failedUrls[0]).toHaveProperty('timestamp');
    });
  });
});
