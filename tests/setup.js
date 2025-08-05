/**
 * Jest test setup file
 * Configures global test environment and utilities
 */

// Set up global test timeout
if (typeof jest !== 'undefined') {
  jest.setTimeout(30000);
}

// Global test utilities
global.testUtils = {
  // Wait for a specified time
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create a mock RSS item
  createMockRssItem: (overrides = {}) => ({
    title: 'Test Article Title',
    link: 'https://example.com/article',
    pubDate: new Date().toISOString(),
    source: 'Test Source',
    description: 'Test article description',
    guid: 'test-guid-123',
    ...overrides,
  }),
  
  // Create mock HTML content
  createMockHtml: (overrides = {}) => {
    const defaults = {
      title: 'Test Article',
      content: 'This is test article content.',
      author: 'Test Author',
      date: new Date().toISOString(),
    };
    
    const data = { ...defaults, ...overrides };
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>${data.title}</title>
        <meta name="description" content="Test description">
        <meta property="og:title" content="${data.title}">
        <meta property="og:description" content="Test OG description">
        <meta property="og:image" content="https://example.com/image.jpg">
      </head>
      <body>
        <article>
          <h1>${data.title}</h1>
          <div class="author">${data.author}</div>
          <time datetime="${data.date}">${data.date}</time>
          <div class="content">
            <p>${data.content}</p>
            <p>Additional paragraph with more content.</p>
          </div>
          <img src="https://example.com/article-image.jpg" alt="Test image">
        </article>
      </body>
      </html>
    `;
  },
  
  // Create mock consent page HTML
  createConsentPageHtml: () => `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Before you continue</title>
    </head>
    <body>
      <div>
        <h1>Before you continue</h1>
        <p>We use cookies and data to deliver and maintain our services.</p>
        <button>Accept all</button>
        <button>Reject all</button>
      </div>
    </body>
    </html>
  `,
  
  // Create mock RSS XML
  createMockRssXml: (items = []) => {
    const defaultItems = items.length > 0 ? items : [
      global.testUtils.createMockRssItem(),
      global.testUtils.createMockRssItem({
        title: 'Second Article',
        link: 'https://example.com/article2',
        guid: 'test-guid-456',
      }),
    ];
    
    const itemsXml = defaultItems.map(item => `
      <item>
        <title><![CDATA[${item.title}]]></title>
        <link>${item.link}</link>
        <guid isPermaLink="false">${item.guid}</guid>
        <pubDate>${item.pubDate}</pubDate>
        <description><![CDATA[${item.description}]]></description>
        <source url="https://example.com">${item.source}</source>
      </item>
    `).join('');
    
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <generator>NFE/5.0</generator>
          <title>"test query" - Google News</title>
          <language>en-US</language>
          <webMaster>news-webmaster@google.com</webMaster>
          <copyright>2024 Google Inc.</copyright>
          <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
          <description>Google News</description>
          ${itemsXml}
        </channel>
      </rss>`;
  },
};

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.APIFY_LOCAL_STORAGE_DIR = './tests/storage';
