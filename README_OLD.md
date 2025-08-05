# Google News Scraper

A comprehensive Google News scraper that extracts articles with full text, images, and metadata using RSS feeds and article crawling.

## Features

- **Two-stage architecture**: RSS feed discovery + article content extraction
- **Full content extraction**: Title, text, images, author, publication date, and metadata
- **Image validation**: Verifies that image URLs are accessible
- **Proxy support**: Uses GOOGLE_SERP proxies for RSS feeds and RESIDENTIAL proxies for articles
- **Date range filtering**: Support for custom date ranges with automatic date slicing
- **Robust error handling**: Comprehensive retry logic and session management
- **Flexible output**: JSON dataset with structured article data

## How it works

### Stage A: RSS Feed Processing
1. Builds Google News RSS feed URLs with search parameters
2. Fetches and parses RSS feeds using fast-xml-parser
3. Implements date slicing for large queries (>100 articles)
4. Deduplicates articles using GUID/link identifiers

### Stage B: Article Crawling
1. Extracts real URLs from Google News redirect links
2. Crawls each article using CheerioCrawler or PlaywrightCrawler
3. Extracts content using Unfluff library
4. Validates and collects working image URLs
5. Outputs structured data to Apify Dataset

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Google News search query |
| `region` | string | ❌ | "US" | Country code for regional news |
| `language` | string | ❌ | "en-US" | Language code for content |
| `maxItems` | integer | ❌ | 0 | Maximum articles (0 = unlimited) |
| `dateFrom` | string | ❌ | - | Start date (YYYY-MM-DD) |
| `dateTo` | string | ❌ | - | End date (YYYY-MM-DD) |
| `useBrowser` | boolean | ❌ | false | Use Playwright for JS-heavy sites |

## Output Format

Each article in the dataset contains:

```json
{
  "query": "artificial intelligence",
  "title": "Article Title",
  "url": "https://example.com/article",
  "source": "Example News",
  "publishedAt": "2024-01-01T12:00:00Z",
  "author": "John Doe",
  "text": "Full article text content...",
  "description": "Article description or excerpt",
  "images": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
  "tags": ["AI", "Technology"],
  "language": "en",
  "scrapedAt": "2024-01-01T12:30:00Z"
}
```

## Usage Examples

### Basic Search
```json
{
  "query": "climate change"
}
```

### Advanced Search with Date Range
```json
{
  "query": "Tesla earnings",
  "region": "US",
  "language": "en-US",
  "maxItems": 50,
  "dateFrom": "2024-01-01",
  "dateTo": "2024-01-31"
}
```

### Browser Mode for Complex Sites
```json
{
  "query": "cryptocurrency news",
  "useBrowser": true,
  "maxItems": 25
}
```

## Development

### Local Setup
```bash
npm install
npm start
```

### Testing
```bash
npm test
```

### Linting
```bash
npm run lint
npm run lint:fix
```

### Formatting
```bash
npm run format
npm run format:check
```

## Architecture

```
src/
├── main.js           # Main entry point and orchestration
├── config.js         # Configuration constants
├── utils.js          # Utility functions
├── rss-fetcher.js    # Stage A: RSS feed processing
└── article-crawler.js # Stage B: Article content extraction
```

## Proxy Configuration

The scraper uses different proxy groups for optimal performance:

- **GOOGLE_SERP**: For RSS feed requests to Google News
- **RESIDENTIAL**: For article crawling (most reliable)
- **DATACENTER**: Fallback option for article crawling

## Rate Limiting

- RSS requests: 200ms delay between requests
- Article requests: 100ms delay between requests
- Image validation: Batched with 5 concurrent validations max

## Error Handling

- Automatic retry with exponential backoff
- Session rotation on blocks/errors
- Failed URL logging for debugging
- Graceful degradation on partial failures

## License

MIT
