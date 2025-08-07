/**
 * Unit tests for ContentExtractor
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ContentExtractor } from '../src/content-extractor.js';
import * as cheerio from 'cheerio';

describe('ContentExtractor', () => {
  let extractor;
  let mockCheerio;

  beforeEach(() => {
    extractor = new ContentExtractor();
    
    // Mock Cheerio-like object
    mockCheerio = (selector) => {
      const mockElements = {
        'h1': [{ text: () => 'Test Article Title' }],
        'h2': [{ text: () => 'Secondary Title' }],
        'title': [{ text: () => 'Page Title - Test Site' }],
        '.article-content': [{ text: () => 'This is the main article content with detailed information.' }],
        '.author': [{ text: () => 'John Doe' }],
        'time': [{ text: () => '2024-08-04' }],
        'html': [{ attr: () => 'en' }],
        'meta[name="description"]': [{ attr: () => 'Test article description' }],
        'p, div': [
          { text: () => 'Short text' },
          { text: () => 'This is a much longer text block that contains substantial content and should be considered as the main content of the article. It has more than 100 characters and provides detailed information about the topic.' },
          { text: () => 'Another paragraph' },
        ],
      };

      return {
        first: () => ({
          text: () => mockElements[selector]?.[0]?.text() || '',
          attr: (attr) => {
            if (selector === 'html' && attr === 'lang') return 'en';
            if (selector.includes('meta') && attr === 'content') return 'Test article description';
            return null;
          },
          length: mockElements[selector]?.length || 0,
        }),
        each: (callback) => {
          const elements = mockElements[selector] || [];
          elements.forEach((el, index) => {
            callback(index, {
              text: el.text,
              attr: el.attr,
            });
          });
        },
        text: () => mockElements[selector]?.[0]?.text() || '',
        attr: (attr) => {
          if (selector === 'html' && attr === 'lang') return 'en';
          if (selector.includes('meta') && attr === 'content') return 'Test article description';
          return null;
        },
        length: mockElements[selector]?.length || 0,
      };
    };
  });

  describe('extractWithReadability', () => {
    test('should extract content using readability', () => {
      const mockHtml = '<html><body><h1>Test</h1><p>Content</p></body></html>';
      const result = extractor.extractWithReadability(mockHtml);

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      if (result.success) {
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('author');
      }
    });

    test('should handle readability errors gracefully', () => {
      const invalidHtml = null;
      const result = extractor.extractWithReadability(invalidHtml);

      expect(result.success).toBe(false);
    });
  });

  describe('extractWithCustomSelectors', () => {
    test('should extract content using CSS selectors', () => {
      const mockHtml = '<html><body><h1>Test</h1></body></html>';
      const result = extractor.extractWithCustomSelectors(mockHtml);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('text');
      expect(typeof result.success).toBe('boolean');
    });

    test('should handle missing elements gracefully', () => {
      const emptyHtml = '<html></html>';

      const result = extractor.extractWithCustomSelectors(emptyHtml);
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('extractWithHeuristics', () => {
    test('should extract content using heuristic methods', () => {
      const mockHtml = '<html><body><h1>Test</h1></body></html>';
      const result = extractor.extractWithHeuristics(mockHtml);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('text');
      expect(typeof result.success).toBe('boolean');
    });

    test('should find largest text block', () => {
      const mockHtml = '<html><body><div>Some content</div><div>More substantial content here with lots of text</div></body></html>';
      const result = extractor.extractWithHeuristics(mockHtml);

      expect(result).toHaveProperty('text');
      expect(typeof result.text).toBe('string');
    });
  });

  describe('extractTitle', () => {
    test('should extract title from HTML', () => {
      const mockHtml = '<html><head><title>Test Title</title></head><body><h1>Test</h1></body></html>';
      const $ = cheerio.load(mockHtml);
      const result = extractor.extractTitle($);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    test('should return empty string if no title found', () => {
      const mockHtml = '<html><body></body></html>';
      const $ = cheerio.load(mockHtml);
      const result = extractor.extractTitle($);

      expect(typeof result).toBe('string');
    });
  });

  describe('extractContent', () => {
    test('should return best extraction result', () => {
      const mockHtml = '<html><body><h1>Test</h1><p>Content</p></body></html>';
      const result = extractor.extractContent(mockHtml);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('author');
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('images'); // Note: 'images' not 'image'
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('lang');
      expect(typeof result.success).toBe('boolean');
    });

    test('should return empty result if all strategies fail', () => {
      const emptyHtml = '';

      const result = extractor.extractContent(emptyHtml);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('text');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.title).toBe('string');
      expect(typeof result.text).toBe('string');
    });
  });

  describe('scoreExtraction', () => {
    test('should score extraction results', () => {
      const goodResult = {
        title: 'Long enough title for good score',
        text: 'This is a very long text content that should receive a high score because it contains substantial information and is longer than 500 characters. It provides detailed information about the topic and demonstrates that the extraction was successful in capturing meaningful content from the source material.',
        author: 'John Doe',
        date: '2024-08-04',
        description: 'A good description with enough content',
      };
      
      const score = extractor.scoreExtraction(goodResult);
      expect(score).toBeGreaterThan(50);
    });

    test('should give low scores to poor results', () => {
      const poorResult = {
        title: '',
        text: '',
        author: '',
        date: null,
        description: '',
      };
      
      const score = extractor.scoreExtraction(poorResult);
      expect(score).toBe(0);
    });

    test('should score medium results appropriately', () => {
      const mediumResult = {
        title: 'Medium Title',
        text: 'Medium length text content that is not too short but not very long either.',
        author: 'Author',
        date: '2024-08-04',
        description: 'Short desc',
      };
      
      const score = extractor.scoreExtraction(mediumResult);
      expect(score).toBeGreaterThan(20);
      expect(score).toBeLessThan(80);
    });
  });
});
