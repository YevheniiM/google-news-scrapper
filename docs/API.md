# API Reference

This document provides detailed API reference for the Google News Scraper actor.

## Table of Contents

- [Input Schema](#input-schema)
- [Output Schema](#output-schema)
- [Error Handling](#error-handling)
- [Rate Limits](#rate-limits)
- [Examples](#examples)

## Input Schema

### Required Parameters

#### `query` (string)
The search query for Google News articles.

**Example**: `"artificial intelligence"`
**Constraints**: 
- Minimum length: 1 character
- Maximum length: 500 characters
- Cannot be empty or only whitespace

#### Optional Parameters

#### `region` (string)
The region/country code for localized news results.

**Default**: `"US"`
**Supported Values**:
- `"US"` - United States
- `"GB"` - United Kingdom  
- `"DE"` - Germany
- `"FR"` - France
- `"JP"` - Japan
- `"AU"` - Australia
- `"CA"` - Canada
- `"IN"` - India
- `"BR"` - Brazil
- `"IT"` - Italy
- `"ES"` - Spain
- `"RU"` - Russia
- `"CN"` - China
- `"KR"` - South Korea

#### `language` (string)
The language code for article content.

**Default**: `"en-US"`
**Supported Values**:
- `"en-US"` - English (US)
- `"en-GB"` - English (UK)
- `"de-DE"` - German
- `"fr-FR"` - French
- `"ja-JP"` - Japanese
- `"es-ES"` - Spanish
- `"it-IT"` - Italian
- `"pt-BR"` - Portuguese (Brazil)
- `"ru-RU"` - Russian
- `"zh-CN"` - Chinese (Simplified)
- `"ko-KR"` - Korean

#### `maxItems` (number)
Maximum number of articles to scrape.

**Default**: `100`
**Range**: `1` to `1000`
**Note**: Higher values may increase processing time and memory usage.

#### `dateRange` (string)
Time range for article filtering.

**Default**: `"week"`
**Supported Values**:
- `"hour"` - Last hour
- `"day"` - Last 24 hours
- `"week"` - Last 7 days
- `"month"` - Last 30 days
- `"year"` - Last 365 days

#### `sortBy` (string)
Sort order for search results.

**Default**: `"relevance"`
**Supported Values**:
- `"relevance"` - Sort by relevance to query
- `"date"` - Sort by publication date (newest first)

#### `enableBrowserMode` (boolean)
Force browser mode for all requests.

**Default**: `false`
**Description**: When `true`, all requests use browser automation instead of HTTP requests. Slower but more reliable for JavaScript-heavy sites.

#### `proxyConfiguration` (object)
Proxy configuration for requests.

**Default**: `null`
**Schema**:
```json
{
  "useApifyProxy": true,
  "apifyProxyGroups": ["RESIDENTIAL"],
  "apifyProxyCountry": "US"
}
```

### Advanced Configuration

#### `requestDelay` (number)
Delay between requests in milliseconds.

**Default**: `2000`
**Range**: `500` to `10000`
**Note**: Lower values may trigger rate limiting.

#### `maxConcurrency` (number)
Maximum number of concurrent requests.

**Default**: `10`
**Range**: `1` to `50`
**Note**: Higher values may cause memory issues or rate limiting.

#### `retryCount` (number)
Number of retry attempts for failed requests.

**Default**: `3`
**Range**: `0` to `10`

#### `timeout` (number)
Request timeout in milliseconds.

**Default**: `30000`
**Range**: `5000` to `120000`

#### `includeImages` (boolean)
Whether to extract and validate article images.

**Default**: `true`
**Note**: Disabling may improve performance but reduces data completeness.

#### `validateContent` (boolean)
Whether to validate extracted content quality.

**Default**: `true`
**Note**: Includes content quality scoring and language detection.

### Complete Input Example

```json
{
  "query": "climate change renewable energy",
  "region": "US",
  "language": "en-US",
  "maxItems": 50,
  "dateRange": "week",
  "sortBy": "date",
  "enableBrowserMode": false,
  "requestDelay": 2000,
  "maxConcurrency": 5,
  "retryCount": 3,
  "timeout": 30000,
  "includeImages": true,
  "validateContent": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "US"
  }
}
```

## Output Schema

### Article Object

Each scraped article contains the following fields:

#### Core Fields

##### `title` (string)
The article headline/title.

**Example**: `"Revolutionary AI Breakthrough in Healthcare"`

##### `url` (string)
The original article URL (after redirect resolution).

**Example**: `"https://example.com/ai-healthcare-breakthrough"`

##### `text` (string)
The full article content/body text.

**Example**: `"Scientists at MIT have developed a revolutionary AI system..."`
**Note**: May be empty if extraction fails.

##### `description` (string)
Article summary or meta description.

**Example**: `"Scientists develop AI system that can diagnose diseases with 95% accuracy"`

##### `author` (string|null)
Article author name.

**Example**: `"Dr. Jane Smith"`
**Note**: May be `null` if not available.

##### `publishedDate` (string|null)
Article publication date in ISO 8601 format.

**Example**: `"2024-01-15T14:30:00Z"`
**Note**: May be `null` if not available.

##### `source` (string)
News source/publication name.

**Example**: `"TechNews Daily"`

##### `sourceUrl` (string)
Base URL of the news source.

**Example**: `"https://technews.com"`

#### Media Fields

##### `images` (array)
Array of image URLs found in the article.

**Example**: 
```json
[
  "https://example.com/images/ai-healthcare.jpg",
  "https://example.com/images/doctor-ai.png"
]
```
**Note**: Images are validated for accessibility and format.

#### Extraction Metadata

##### `extractionSuccess` (boolean)
Whether content extraction was successful.

**Example**: `true`

##### `extractionMethod` (string)
Method used for content extraction.

**Possible Values**:
- `"unfluff"` - Primary extraction method
- `"css-selector"` - CSS selector-based extraction
- `"heuristic"` - Heuristic-based extraction
- `"browser"` - Browser-based extraction

##### `metadata` (object)
Additional metadata about the article.

**Schema**:
```json
{
  "wordCount": 1250,
  "readingTime": "5 min",
  "language": "en",
  "contentQuality": 0.95,
  "processingTime": 1500
}
```

**Fields**:
- `wordCount` (number): Number of words in article text
- `readingTime` (string): Estimated reading time
- `language` (string): Detected content language
- `contentQuality` (number): Quality score from 0 to 1
- `processingTime` (number): Processing time in milliseconds

##### `scrapedAt` (string)
Timestamp when the article was scraped (ISO 8601).

**Example**: `"2024-01-15T15:00:00Z"`

### Complete Output Example

```json
{
  "title": "Revolutionary AI Breakthrough in Healthcare",
  "url": "https://example.com/ai-healthcare-breakthrough",
  "text": "Scientists at MIT have developed a revolutionary AI system that can diagnose diseases with unprecedented accuracy. The system, trained on millions of medical records, achieved a 95% accuracy rate in clinical trials...",
  "description": "Scientists develop AI system that can diagnose diseases with 95% accuracy, potentially revolutionizing healthcare diagnostics.",
  "author": "Dr. Jane Smith",
  "publishedDate": "2024-01-15T14:30:00Z",
  "source": "TechNews Daily",
  "sourceUrl": "https://technews.com",
  "images": [
    "https://example.com/images/ai-healthcare.jpg",
    "https://example.com/images/doctor-ai.png"
  ],
  "extractionSuccess": true,
  "extractionMethod": "unfluff",
  "metadata": {
    "wordCount": 1250,
    "readingTime": "5 min",
    "language": "en",
    "contentQuality": 0.95,
    "processingTime": 1500
  },
  "scrapedAt": "2024-01-15T15:00:00Z"
}
```

## Error Handling

### Error Types

#### Input Validation Errors
Returned when input parameters are invalid.

**HTTP Status**: `400 Bad Request`

**Example**:
```json
{
  "error": {
    "type": "INPUT_VALIDATION_ERROR",
    "message": "Invalid query parameter",
    "details": {
      "field": "query",
      "value": "",
      "constraint": "Query cannot be empty"
    }
  }
}
```

#### Rate Limit Errors
Returned when rate limits are exceeded.

**HTTP Status**: `429 Too Many Requests`

**Example**:
```json
{
  "error": {
    "type": "RATE_LIMIT_ERROR",
    "message": "Rate limit exceeded",
    "details": {
      "retryAfter": 60,
      "limit": 100,
      "window": "hour"
    }
  }
}
```

#### Network Errors
Returned when network requests fail.

**Example**:
```json
{
  "error": {
    "type": "NETWORK_ERROR",
    "message": "Failed to fetch RSS feed",
    "details": {
      "url": "https://news.google.com/rss/search",
      "statusCode": 503,
      "retryable": true
    }
  }
}
```

#### Content Extraction Errors
Returned when content extraction fails for all articles.

**Example**:
```json
{
  "error": {
    "type": "EXTRACTION_ERROR",
    "message": "Failed to extract content from any articles",
    "details": {
      "articlesAttempted": 50,
      "successfulExtractions": 0,
      "commonErrors": ["consent_page", "javascript_required"]
    }
  }
}
```

### Error Recovery

The actor implements automatic error recovery:

1. **Retry Logic**: Failed requests are retried with exponential backoff
2. **Circuit Breakers**: Prevent cascade failures by temporarily disabling failing operations
3. **Graceful Degradation**: Return partial results when some operations fail
4. **Fallback Methods**: Use alternative extraction methods when primary methods fail

## Rate Limits

### Default Limits
- **Requests per minute**: 60
- **Concurrent requests**: 10
- **Articles per run**: 1000

### Best Practices
1. Use appropriate `requestDelay` values (minimum 2000ms)
2. Don't exceed `maxConcurrency` of 10
3. Implement exponential backoff for retries
4. Monitor rate limit headers in responses

## Examples

### Basic News Search

```json
{
  "query": "artificial intelligence",
  "maxItems": 20
}
```

### Regional News Search

```json
{
  "query": "Brexit negotiations",
  "region": "GB",
  "language": "en-GB",
  "dateRange": "day",
  "maxItems": 50
}
```

### Breaking News Monitoring

```json
{
  "query": "breaking news",
  "sortBy": "date",
  "dateRange": "hour",
  "maxItems": 10,
  "requestDelay": 1000
}
```

### High-Volume Research

```json
{
  "query": "climate change policy",
  "maxItems": 500,
  "enableBrowserMode": true,
  "maxConcurrency": 5,
  "requestDelay": 3000,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

### Multi-Language Search

```json
{
  "query": "intelligence artificielle",
  "region": "FR",
  "language": "fr-FR",
  "dateRange": "week",
  "maxItems": 100
}
```
