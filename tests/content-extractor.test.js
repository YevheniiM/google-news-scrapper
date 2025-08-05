/**
 * Unit tests for ContentExtractor
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ContentExtractor } from '../src/content-extractor.js';

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

  describe('extractWithUnfluff', () => {
    test('should extract content using unfluff', () => {
      const mockHtml = '<html><body><h1>Test</h1><p>Content</p></body></html>';
      const result = extractor.extractWithUnfluff(mockHtml, mockCheerio);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('author');
    });

    test('should handle unfluff errors gracefully', () => {
      const invalidHtml = null;
      const result = extractor.extractWithUnfluff(invalidHtml, mockCheerio);
      
      expect(result.success).toBe(false);
    });
  });

  describe('extractWithSelectors', () => {
    test('should extract content using CSS selectors', () => {
      const mockHtml = '<html><body><h1>Test</h1></body></html>';
      const result = extractor.extractWithSelectors(mockHtml, mockCheerio);
      
      expect(result.success).toBe(true);
      expect(result.title).toBe('Test Article Title');
      expect(result.text).toBe('This is the main article content with detailed information.');
      expect(result.author).toBe('John Doe');
      expect(result.lang).toBe('en');
    });

    test('should handle missing elements gracefully', () => {
      const emptyCheerio = () => ({
        first: () => ({ text: () => '', length: 0 }),
        each: () => {},
        text: () => '',
        attr: () => null,
        length: 0,
      });
      
      const result = extractor.extractWithSelectors('<html></html>', emptyCheerio);
      expect(result.success).toBe(false);
    });
  });

  describe('extractWithHeuristics', () => {
    test('should extract content using heuristic methods', () => {
      const mockHtml = '<html><body><h1>Test</h1></body></html>';
      const result = extractor.extractWithHeuristics(mockHtml, mockCheerio);
      
      expect(result.success).toBe(true);
      expect(result.title).toBe('Test Article Title');
      expect(result.description).toBe('Test article description');
    });

    test('should find largest text block', () => {
      const result = extractor.extractWithHeuristics('<html></html>', mockCheerio);
      
      expect(result.text).toContain('substantial content');
      expect(result.text.length).toBeGreaterThan(100);
    });
  });

  describe('extractBySelectors', () => {
    test('should try multiple selectors', () => {
      const selectors = ['h1', 'h2', 'title'];
      const result = extractor.extractBySelectors(mockCheerio, selectors);
      
      expect(result).toBe('Test Article Title');
    });

    test('should return empty string if no selectors match', () => {
      const selectors = ['.nonexistent', '#missing'];
      const result = extractor.extractBySelectors(mockCheerio, selectors);
      
      expect(result).toBe('');
    });
  });

  describe('extractContent', () => {
    test('should return best extraction result', () => {
      const mockHtml = '<html><body><h1>Test</h1><p>Content</p></body></html>';
      const result = extractor.extractContent(mockHtml, mockCheerio);
      
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('author');
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('image');
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('lang');
    });

    test('should return empty result if all strategies fail', () => {
      const emptyCheerio = () => ({
        first: () => ({ text: () => '', length: 0 }),
        each: () => {},
        text: () => '',
        attr: () => null,
        length: 0,
      });
      
      const result = extractor.extractContent('', emptyCheerio);
      
      expect(result.success).toBe(false);
      expect(result.title).toBe('');
      expect(result.text).toBe('');
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
