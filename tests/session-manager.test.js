/**
 * Unit tests for SessionManager
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { SessionManager } from '../src/session-manager.js';

describe('SessionManager', () => {
  let sessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  describe('getRandomUserAgent', () => {
    test('should return a user agent string', () => {
      const userAgent = sessionManager.getRandomUserAgent();
      expect(typeof userAgent).toBe('string');
      expect(userAgent.length).toBeGreaterThan(0);
      expect(userAgent).toContain('Mozilla');
    });

    test('should return different user agents on multiple calls', () => {
      const userAgents = new Set();
      for (let i = 0; i < 10; i++) {
        userAgents.add(sessionManager.getRandomUserAgent());
      }
      // Should have some variety (not necessarily all different due to randomness)
      expect(userAgents.size).toBeGreaterThan(0);
    });
  });

  describe('getNextUserAgent', () => {
    test('should rotate through user agents', () => {
      const firstUA = sessionManager.getNextUserAgent();
      const secondUA = sessionManager.getNextUserAgent();
      
      expect(typeof firstUA).toBe('string');
      expect(typeof secondUA).toBe('string');
      expect(firstUA.length).toBeGreaterThan(0);
      expect(secondUA.length).toBeGreaterThan(0);
    });

    test('should cycle back to first user agent after all are used', () => {
      const userAgents = [];
      // Get more user agents than available to test cycling
      for (let i = 0; i < 10; i++) {
        userAgents.push(sessionManager.getNextUserAgent());
      }
      
      // Should have cycled back to earlier user agents
      expect(userAgents[0]).toBe(userAgents[4]); // Assuming 4 user agents in config
    });
  });

  describe('isConsentPage', () => {
    test('should detect consent page indicators', () => {
      const consentHtml = '<html><body><h1>Before you continue</h1><p>We use cookies</p></body></html>';
      expect(sessionManager.isConsentPage(consentHtml, 'https://example.com')).toBe(true);
    });

    test('should detect consent page with different indicators', () => {
      const consentHtml = '<html><body><p>Please accept cookies to continue</p></body></html>';
      expect(sessionManager.isConsentPage(consentHtml, 'https://example.com')).toBe(true);
    });

    test('should not detect consent page in normal content', () => {
      const normalHtml = '<html><body><h1>Article Title</h1><p>Article content</p></body></html>';
      expect(sessionManager.isConsentPage(normalHtml, 'https://example.com')).toBe(false);
    });

    test('should handle empty or null HTML', () => {
      expect(sessionManager.isConsentPage('', 'https://example.com')).toBe(false);
      expect(sessionManager.isConsentPage(null, 'https://example.com')).toBe(false);
      expect(sessionManager.isConsentPage(undefined, 'https://example.com')).toBe(false);
    });

    test('should be case insensitive', () => {
      const consentHtml = '<html><body><h1>BEFORE YOU CONTINUE</h1></body></html>';
      expect(sessionManager.isConsentPage(consentHtml, 'https://example.com')).toBe(true);
    });
  });

  describe('addConsentCookies', () => {
    test('should add consent cookies to session', async () => {
      const mockSession = {
        setCookies: jest.fn(),
      };

      await sessionManager.addConsentCookies(mockSession);
      
      expect(mockSession.setCookies).toHaveBeenCalled();
      const cookiesCall = mockSession.setCookies.mock.calls[0];
      expect(Array.isArray(cookiesCall[0])).toBe(true);
      expect(cookiesCall[1]).toBe('https://google.com');
    });
  });

  describe('addGooglePreferences', () => {
    test('should add Google preference cookies to session', async () => {
      const mockSession = {
        setCookies: jest.fn(),
      };

      await sessionManager.addGooglePreferences(mockSession);
      
      expect(mockSession.setCookies).toHaveBeenCalled();
    });
  });

  describe('addEuropeanBypass', () => {
    test('should add European consent bypass cookies to session', async () => {
      const mockSession = {
        setCookies: jest.fn(),
      };

      await sessionManager.addEuropeanBypass(mockSession);
      
      expect(mockSession.setCookies).toHaveBeenCalled();
    });
  });

  describe('applyConsentBypass', () => {
    test('should apply consent bypass strategy', async () => {
      const mockSession = {
        setCookies: jest.fn(),
      };

      await sessionManager.applyConsentBypass(mockSession, 0);
      
      expect(mockSession.setCookies).toHaveBeenCalled();
    });

    test('should handle invalid strategy index', async () => {
      const mockSession = {
        setCookies: jest.fn(),
      };

      await sessionManager.applyConsentBypass(mockSession, 999);
      
      expect(mockSession.setCookies).not.toHaveBeenCalled();
    });
  });

  describe('getEnhancedHeaders', () => {
    test('should return enhanced headers object', () => {
      const headers = sessionManager.getEnhancedHeaders();
      
      expect(headers).toHaveProperty('User-Agent');
      expect(headers).toHaveProperty('Accept');
      expect(headers).toHaveProperty('Accept-Language');
      expect(headers).toHaveProperty('Accept-Encoding');
      expect(headers).toHaveProperty('DNT');
      expect(headers).toHaveProperty('Connection');
      
      expect(headers['User-Agent']).toContain('Mozilla');
      expect(headers['Accept-Language']).toContain('en-US');
    });

    test('should use provided user agent', () => {
      const customUA = 'Custom User Agent';
      const headers = sessionManager.getEnhancedHeaders(customUA);
      
      expect(headers['User-Agent']).toBe(customUA);
    });
  });

  describe('getSessionPoolOptions', () => {
    test('should return session pool configuration', () => {
      const options = sessionManager.getSessionPoolOptions();
      
      expect(options).toHaveProperty('maxPoolSize');
      expect(options).toHaveProperty('sessionOptions');
      expect(options).toHaveProperty('persistStateKeyValueStoreId');
      
      expect(typeof options.maxPoolSize).toBe('number');
      expect(options.maxPoolSize).toBeGreaterThan(0);
      expect(options.sessionOptions).toHaveProperty('maxUsageCount');
      expect(options.sessionOptions).toHaveProperty('maxErrorScore');
    });
  });

  describe('handleBlockedResponse', () => {
    test('should handle blocked status codes', async () => {
      const mockContext = {
        response: { statusCode: 403, body: 'Forbidden' },
        session: { markBad: jest.fn(), userData: {} },
        request: { url: 'https://example.com' },
      };

      const shouldRetry = await sessionManager.handleBlockedResponse(mockContext);
      
      expect(mockContext.session.markBad).toHaveBeenCalled();
      expect(shouldRetry).toBe(false);
    });

    test('should handle consent pages', async () => {
      const mockContext = {
        response: { 
          statusCode: 200, 
          body: '<html><body><h1>Before you continue</h1></body></html>',
          url: 'https://example.com'
        },
        session: { 
          markBad: jest.fn(), 
          userData: {},
          setCookies: jest.fn(),
        },
        request: { url: 'https://example.com' },
      };

      const shouldRetry = await sessionManager.handleBlockedResponse(mockContext);
      
      expect(mockContext.session.markBad).toHaveBeenCalled();
      expect(typeof shouldRetry).toBe('boolean');
    });

    test('should handle missing response', async () => {
      const mockContext = {
        response: null,
        session: { markBad: jest.fn(), userData: {} },
        request: { url: 'https://example.com' },
      };

      const shouldRetry = await sessionManager.handleBlockedResponse(mockContext);
      
      expect(shouldRetry).toBe(false);
    });

    test('should handle normal responses', async () => {
      const mockContext = {
        response: { 
          statusCode: 200, 
          body: '<html><body><h1>Normal Article</h1></body></html>',
          url: 'https://example.com'
        },
        session: { markBad: jest.fn(), userData: {} },
        request: { url: 'https://example.com' },
      };

      const shouldRetry = await sessionManager.handleBlockedResponse(mockContext);
      
      expect(mockContext.session.markBad).not.toHaveBeenCalled();
      expect(shouldRetry).toBe(false);
    });
  });
});
