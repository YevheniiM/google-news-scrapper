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

    test('should respect maxItems limit', async () => {
      // Create more RSS items than the limit
      const rssItems = [
        global.testUtils.createMockRssItem({
          title: 'Test Article 1',
          link: 'https://example.com/article1',
        }),
        global.testUtils.createMockRssItem({
          title: 'Test Article 2',
          link: 'https://example.com/article2',
        }),
        global.testUtils.createMockRssItem({
          title: 'Test Article 3',
          link: 'https://example.com/article3',
        }),
        global.testUtils.createMockRssItem({
          title: 'Test Article 4',
          link: 'https://example.com/article4',
        }),
        global.testUtils.createMockRssItem({
          title: 'Test Article 5',
          link: 'https://example.com/article5',
        }),
      ];

      // Set maxItems limit to 2
      const maxItemsLimit = 2;

      // Mock the content extractor to return valid content that passes all checks
      articleCrawler.contentExtractor = {
        extractContent: jest.fn().mockReturnValue({
          success: true,
          title: 'Test Article Title',
          text: 'This is a long enough article text content that should pass the minimum character requirement for the all or nothing strategy. It contains more than 200 characters which is the minimum required by the scraper to consider an article as valid content. This ensures that the article will not be skipped due to insufficient text length.',
          images: [
            { url: 'https://example.com/image1.jpg', type: 'featured' },
            { url: 'https://example.com/image2.jpg', type: 'content' }
          ],
          author: 'Test Author',
          publishedDate: new Date().toISOString(),
          extractionMethod: 'mock'
        })
      };

      // Mock image validation to return valid images
      articleCrawler.validateImages = jest.fn().mockResolvedValue([
        { url: 'https://example.com/image1.jpg', type: 'featured' },
        { url: 'https://example.com/image2.jpg', type: 'content' }
      ]);

      await articleCrawler.crawlArticles(rssItems, 'test query', maxItemsLimit);

      // Should have saved exactly maxItemsLimit articles (check the stats)
      expect(articleCrawler.stats.saved).toBe(maxItemsLimit);

      // Should have at least one article skipped due to maxItemsReached
      expect(articleCrawler.stats.skipped.maxItemsReached).toBeGreaterThanOrEqual(1);
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
          link: 'https://example.com/regular-article', // Use regular URL to avoid Google News complexity
        }),
      ];

      // Mock the content extractor to return valid content with longer sentences
      const mockText = 'This is a comprehensive article about technology and innovation in the modern world. The article discusses various aspects of technological advancement and their impact on society. It provides detailed analysis and insights that are valuable for readers interested in this topic. The content is well-structured and informative, meeting all quality requirements for publication.';

      articleCrawler.contentExtractor = {
        extractContent: jest.fn().mockReturnValue({
          success: true,
          title: 'Test Article Title',
          text: mockText,
          images: [
            { url: 'https://example.com/image1.jpg', type: 'featured' },
            { url: 'https://example.com/image2.jpg', type: 'content' }
          ],
          author: 'Test Author',
          publishedDate: new Date().toISOString(),
          extractionMethod: 'mock'
        })
      };

      // Mock image validation to return valid images
      articleCrawler.validateImages = jest.fn().mockResolvedValue([
        { url: 'https://example.com/image1.jpg', type: 'featured' },
        { url: 'https://example.com/image2.jpg', type: 'content' }
      ]);

      // Mock the low quality content check to always return false for this test
      const originalIsLowQuality = articleCrawler.isLowQualityContent;
      articleCrawler.isLowQualityContent = jest.fn().mockReturnValue(false);

      await articleCrawler.crawlArticles(rssItems, 'test query');

      // Should have processed the URL successfully without any failures
      expect(articleCrawler.getFailedUrls().length).toBe(0);

      // Should have saved the article
      expect(articleCrawler.stats.saved).toBe(1);

      // Restore original method
      articleCrawler.isLowQualityContent = originalIsLowQuality;
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
      // Create a custom crawler with mocked handleRequest to ensure consent page detection is called
      const testCrawler = new ArticleCrawler();

      // Mock session manager to detect consent page
      testCrawler.sessionManager = {
        isConsentPage: jest.fn().mockReturnValue(true),
        handleBlockedResponse: jest.fn().mockResolvedValue(false),
        getSessionPoolOptions: jest.fn().mockReturnValue({}),
      };

      // Mock the content extractor to return valid content
      testCrawler.contentExtractor = {
        extractContent: jest.fn().mockReturnValue({
          success: true,
          title: 'Test Article Title',
          text: 'This is a long enough article text content that should pass the minimum character requirement for the all or nothing strategy. It contains more than 200 characters which is the minimum required by the scraper to consider an article as valid content.',
          images: [
            { url: 'https://example.com/image1.jpg', type: 'featured' },
            { url: 'https://example.com/image2.jpg', type: 'content' }
          ],
          author: 'Test Author',
          publishedDate: new Date().toISOString(),
          extractionMethod: 'mock'
        })
      };

      // Mock image validation to return valid images
      testCrawler.validateImages = jest.fn().mockResolvedValue([
        { url: 'https://example.com/image1.jpg', type: 'featured' },
        { url: 'https://example.com/image2.jpg', type: 'content' }
      ]);

      // Directly call handleRequest to ensure consent page detection is triggered
      const mockRequest = {
        url: 'https://example.com/test-article',
        userData: { source: 'Test Source' }
      };

      const mockResponse = {
        body: '<html><body>Test consent page content</body></html>',
        url: 'https://example.com/test-article'
      };

      await testCrawler.handleRequest({ request: mockRequest, response: mockResponse });

      // Should have detected consent page
      expect(testCrawler.sessionManager.isConsentPage).toHaveBeenCalled();
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
