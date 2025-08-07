/**
 * Unit tests for utility functions
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  buildFeedUrl,
  extractRealUrl,
  extractImages,
  cleanText,
  formatDate,
  getDateRanges,
} from '../src/utils.js';

describe('Utils', () => {
  describe('buildFeedUrl', () => {
    test('should build basic RSS feed URL', () => {
      const url = buildFeedUrl('artificial intelligence');
      expect(url).toContain('https://news.google.com/rss/search');
      expect(url).toContain('q=artificial+intelligence');
      expect(url).toContain('hl=en-US');
      expect(url).toContain('gl=US');
      expect(url).toContain('ceid=US%3Aen');
    });

    test('should handle custom language and region', () => {
      const url = buildFeedUrl('test query', 'fr-FR', 'FR');
      expect(url).toContain('hl=fr-FR');
      expect(url).toContain('gl=FR');
      expect(url).toContain('ceid=FR%3Afr');
    });

    test('should add date filters when provided', () => {
      const url = buildFeedUrl('test', 'en-US', 'US', '2024-01-01', '2024-01-31');
      expect(url).toContain('after%3A2024-01-01');
      expect(url).toContain('before%3A2024-01-31');
    });

    test('should handle only dateFrom', () => {
      const url = buildFeedUrl('test', 'en-US', 'US', '2024-01-01');
      expect(url).toContain('after%3A2024-01-01');
      expect(url).not.toContain('before%3A');
    });

    test('should handle only dateTo', () => {
      const url = buildFeedUrl('test', 'en-US', 'US', null, '2024-01-31');
      expect(url).toContain('before%3A2024-01-31');
      expect(url).not.toContain('after%3A');
    });

    test('should encode special characters in query', () => {
      const url = buildFeedUrl('test & query "with quotes"');
      expect(url).toContain('test+%26+query+%22with+quotes%22');
    });
  });

  describe('extractRealUrl', () => {
    test('should return non-Google News URLs unchanged', () => {
      const url = 'https://example.com/article';
      expect(extractRealUrl(url)).toBe(url);
    });

    test('should extract URL from Google News redirect with url parameter', () => {
      const googleUrl = 'https://news.google.com/articles/test?url=https%3A%2F%2Fexample.com%2Farticle';
      expect(extractRealUrl(googleUrl)).toBe('https://example.com/article');
    });

    test('should convert RSS URLs to web format', () => {
      const rssUrl = 'https://news.google.com/rss/articles/CBMiTest?oc=5';
      const result = extractRealUrl(rssUrl);
      expect(result).toBe('https://news.google.com/articles/CBMiTest?oc=5');
    });

    test('should handle complex Google News URLs', () => {
      const complexUrl = 'https://news.google.com/articles/CBMiComplexTest';
      expect(extractRealUrl(complexUrl)).toBe(complexUrl);
    });

    test('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      expect(extractRealUrl(invalidUrl)).toBe(invalidUrl);
    });
  });

  describe('extractImages', () => {
    let mockCheerio;

    beforeEach(() => {
      // Mock Cheerio-like object
      mockCheerio = (selector) => ({
        each: (callback) => {
          const mockElements = {
            'meta[property="og:image"]': [
              { attribs: { content: 'https://example.com/og-image.jpg' } },
            ],
            'meta[name="twitter:image"]': [
              { attribs: { content: 'https://example.com/twitter-image.jpg' } },
            ],
            'article img, .article img, .content img, .post img': [
              { attribs: { src: 'https://example.com/article-image.jpg' } },
            ],
          };

          const elements = mockElements[selector] || [];
          elements.forEach((el, index) => callback(index, el));
        },
        attr: (attr) => {
          const mockAttrs = {
            'meta[property="og:image"]': { content: 'https://example.com/og-image.jpg' },
            'meta[name="twitter:image"]': { content: 'https://example.com/twitter-image.jpg' },
          };
          return mockAttrs[selector]?.[attr];
        },
        first: () => ({
          attr: (attr) => {
            if (attr === 'src') return 'https://example.com/first-image.jpg';
            return null;
          },
        }),
      });
    });

    test('should extract images from unfluff data', () => {
      const unfluffData = { image: 'https://example.com/unfluff-image.jpg' };
      const images = extractImages(unfluffData, mockCheerio);
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(0);
      expect(images[0]).toHaveProperty('url', 'https://example.com/unfluff-image.jpg');
      expect(images[0]).toHaveProperty('type', 'featured');
    });

    test('should deduplicate images', () => {
      const unfluffData = { image: 'https://example.com/same-image.jpg' };
      const images = extractImages(unfluffData, mockCheerio);
      // Extract URLs for deduplication check
      const imageUrls = images.map(img => img.url);
      const uniqueUrls = [...new Set(imageUrls)];
      expect(imageUrls.length).toBe(uniqueUrls.length);
    });

    test('should handle missing unfluff image', () => {
      const unfluffData = {};
      const images = extractImages(unfluffData, mockCheerio);
      expect(Array.isArray(images)).toBe(true);
    });

    test('should filter out relative URLs', () => {
      const unfluffData = { image: '/relative/image.jpg' };
      const images = extractImages(unfluffData, mockCheerio);
      expect(images).not.toContain('/relative/image.jpg');
    });
  });

  describe('cleanText', () => {
    test('should clean multiple whitespaces', () => {
      const text = 'This   has    multiple   spaces';
      expect(cleanText(text)).toBe('This has multiple spaces');
    });

    test('should clean multiple newlines', () => {
      const text = 'Line 1\n\n\nLine 2\n\n\nLine 3';
      expect(cleanText(text)).toBe('Line 1\nLine 2\nLine 3');
    });

    test('should trim whitespace', () => {
      const text = '  \n  Text with padding  \n  ';
      expect(cleanText(text)).toBe('Text with padding');
    });

    test('should handle empty string', () => {
      expect(cleanText('')).toBe('');
    });

    test('should handle null/undefined', () => {
      expect(cleanText(null)).toBe('');
      expect(cleanText(undefined)).toBe('');
    });

    test('should convert non-strings to strings', () => {
      expect(cleanText(123)).toBe('123');
      expect(cleanText(true)).toBe('true');
    });
  });

  describe('formatDate', () => {
    test('should format date to YYYY-MM-DD', () => {
      const date = new Date('2024-08-04T15:30:00Z');
      expect(formatDate(date)).toBe('2024-08-04');
    });

    test('should handle different date formats', () => {
      // Use ISO string to avoid timezone issues
      const date = new Date('2024-08-04T12:00:00Z');
      expect(formatDate(date)).toBe('2024-08-04');
    });
  });

  describe('getDateRanges', () => {
    test('should generate date ranges', () => {
      const ranges = getDateRanges('2024-08-01', '2024-08-03', 5);
      expect(ranges).toHaveLength(3);
      expect(ranges[0]).toEqual({ from: '2024-08-02', to: '2024-08-03' });
      expect(ranges[1]).toEqual({ from: '2024-08-01', to: '2024-08-02' });
    });

    test('should handle default parameters', () => {
      const ranges = getDateRanges();
      expect(Array.isArray(ranges)).toBe(true);
      expect(ranges.length).toBeGreaterThan(0);
    });

    test('should respect maxDays parameter', () => {
      const ranges = getDateRanges(null, null, 3);
      expect(ranges.length).toBeLessThanOrEqual(3);
    });
  });
});
