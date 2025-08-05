/**
 * Basic tests to verify test setup
 */

import { describe, test, expect } from '@jest/globals';

describe('Basic Test Setup', () => {
  test('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should have test utilities available', () => {
    expect(global.testUtils).toBeDefined();
    expect(typeof global.testUtils.createMockRssItem).toBe('function');
    expect(typeof global.testUtils.createMockHtml).toBe('function');
  });

  test('should create mock RSS item', () => {
    const mockItem = global.testUtils.createMockRssItem();
    
    expect(mockItem).toHaveProperty('title');
    expect(mockItem).toHaveProperty('link');
    expect(mockItem).toHaveProperty('pubDate');
    expect(mockItem).toHaveProperty('source');
    expect(mockItem).toHaveProperty('description');
    expect(mockItem).toHaveProperty('guid');
  });

  test('should create mock HTML', () => {
    const mockHtml = global.testUtils.createMockHtml();
    
    expect(typeof mockHtml).toBe('string');
    expect(mockHtml).toContain('<html');
    expect(mockHtml).toContain('</html>');
  });

  test('should create consent page HTML', () => {
    const consentHtml = global.testUtils.createConsentPageHtml();
    
    expect(typeof consentHtml).toBe('string');
    expect(consentHtml).toContain('Before you continue');
  });

  test('should create mock RSS XML', () => {
    const rssXml = global.testUtils.createMockRssXml();
    
    expect(typeof rssXml).toBe('string');
    expect(rssXml).toContain('<?xml');
    expect(rssXml).toContain('<rss');
    expect(rssXml).toContain('<item>');
  });
});
