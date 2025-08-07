/**
 * Mock HTTP responses for testing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load fixture files
const sampleRssXml = fs.readFileSync(path.join(__dirname, '../fixtures/sample-rss.xml'), 'utf8');
const sampleArticleHtml = fs.readFileSync(path.join(__dirname, '../fixtures/sample-article.html'), 'utf8');
const consentPageHtml = fs.readFileSync(path.join(__dirname, '../fixtures/consent-page.html'), 'utf8');

/**
 * Mock HTTP responses for different scenarios
 */
export const mockResponses = {
  // Successful RSS feed response
  rssSuccess: {
    statusCode: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=UTF-8',
    },
    body: sampleRssXml,
    url: 'https://news.google.com/rss/search?q=artificial+intelligence&hl=en-US&gl=US&ceid=US%3Aen',
  },

  // Successful article response
  articleSuccess: {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
    },
    body: sampleArticleHtml,
    url: 'https://techcrunch.com/ai-medical-breakthrough',
  },

  // Consent page response
  consentPage: {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
    },
    body: consentPageHtml,
    url: 'https://consent.google.com/ml?continue=https://techcrunch.com/article',
  },

  // Rate limited response
  rateLimited: {
    statusCode: 429,
    headers: {
      'content-type': 'text/html',
      'retry-after': '60',
    },
    body: '<html><body><h1>Too Many Requests</h1></body></html>',
    url: 'https://example.com/rate-limited',
  },

  // Blocked response
  blocked: {
    statusCode: 403,
    headers: {
      'content-type': 'text/html',
    },
    body: '<html><body><h1>Access Denied</h1></body></html>',
    url: 'https://example.com/blocked',
  },

  // Server error response
  serverError: {
    statusCode: 500,
    headers: {
      'content-type': 'text/html',
    },
    body: '<html><body><h1>Internal Server Error</h1></body></html>',
    url: 'https://example.com/error',
  },

  // Not found response
  notFound: {
    statusCode: 404,
    headers: {
      'content-type': 'text/html',
    },
    body: '<html><body><h1>Not Found</h1></body></html>',
    url: 'https://example.com/not-found',
  },

  // Empty RSS feed
  emptyRss: {
    statusCode: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=UTF-8',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Empty Feed</title>
          <description>No items</description>
        </channel>
      </rss>`,
    url: 'https://news.google.com/rss/search?q=nonexistent',
  },

  // Malformed RSS feed
  malformedRss: {
    statusCode: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=UTF-8',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Malformed Feed</title>
          <item>
            <title>Incomplete Item
            <link>https://example.com/incomplete
          </item>
        </channel>`,
    url: 'https://news.google.com/rss/search?q=malformed',
  },

  // JavaScript-required page
  jsRequired: {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
    },
    body: `<!DOCTYPE html>
      <html>
      <head>
        <title>JavaScript Required</title>
      </head>
      <body>
        <noscript>
          <h1>JavaScript is required to view this content</h1>
          <p>Please enable JavaScript in your browser.</p>
        </noscript>
        <div id="content" style="display: none;">
          <h1>Dynamic Content</h1>
          <p>This content is loaded by JavaScript.</p>
        </div>
        <script>
          document.getElementById('content').style.display = 'block';
        </script>
      </body>
      </html>`,
    url: 'https://example.com/js-required',
  },

  // Image validation responses
  imageSuccess: {
    statusCode: 200,
    headers: {
      'content-type': 'image/jpeg',
      'content-length': '12345',
    },
    body: '',
    url: 'https://example.com/image.jpg',
  },

  imageNotFound: {
    statusCode: 404,
    headers: {
      'content-type': 'text/html',
    },
    body: '<html><body><h1>Image Not Found</h1></body></html>',
    url: 'https://example.com/missing-image.jpg',
  },
};

/**
 * Create a mock got-scraping function
 * @param {object} responseMap - Map of URLs to responses
 * @returns {function} Mock got-scraping function
 */
export function createMockGotScraping(responseMap = {}) {
  return async (options) => {
    const url = typeof options === 'string' ? options : options.url;

    // Check if we have a specific mock for this URL
    if (responseMap[url]) {
      return responseMap[url];
    }

    // Special handling for RSS feeds based on query parameters
    if (url.includes('news.google.com/rss')) {
      if (url.includes('q=empty')) {
        return mockResponses.emptyRss;
      }
      if (url.includes('q=malformed')) {
        return mockResponses.malformedRss;
      }
      if (url.includes('q=error')) {
        throw new Error('Network error');
      }
      if (url.includes('q=invalid')) {
        return mockResponses.emptyRss;
      }
      if (url.includes('q=timeout')) {
        throw new Error('Timeout error');
      }
      // Default RSS response
      return mockResponses.rssSuccess;
    }

    if (url.includes('consent') || url.includes('before-you-continue')) {
      return mockResponses.consentPage;
    }

    if (url.includes('image') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return mockResponses.imageSuccess;
    }

    // Default to article success
    return mockResponses.articleSuccess;
  };
}

export default mockResponses;
