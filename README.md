# Google News Scraper

A powerful and robust Apify actor that scrapes Google News articles with advanced content extraction, error handling, and monitoring capabilities. Built for production use with comprehensive testing and development tools.

## 🚀 Features

### Core Functionality
- **🔍 Flexible Search**: Search by keywords, regions, languages, and date ranges
- **📰 Content Extraction**: Full article text, metadata, images, and structured data
- **🌍 Multi-Region Support**: Search across different countries and languages
- **📅 Date Filtering**: Filter articles by hour, day, week, month, or year
- **🔄 Smart Sorting**: Sort by relevance or publication date

### Advanced Capabilities
- **🛡️ Consent Page Bypass**: Automatic handling of GDPR and cookie consent pages
- **🌐 JavaScript Fallback**: Browser mode for JavaScript-heavy sites
- **🔄 Retry Logic**: Exponential backoff with intelligent error classification
- **⚡ Circuit Breakers**: Prevent cascading failures with automatic recovery
- **📊 Real-time Monitoring**: Performance metrics and health monitoring
- **🎯 Graceful Degradation**: Partial results when some operations fail

### Quality & Reliability
- **✅ Comprehensive Testing**: Unit, integration, and performance tests
- **🔧 Error Recovery**: Automatic recovery from network and parsing errors
- **📈 Performance Optimization**: Memory management and concurrent processing
- **🏥 Health Monitoring**: Real-time system health and error tracking
- **🧹 Data Validation**: Input validation and output quality assurance

## 📋 Quick Start

### Using Apify Console

1. **Visit**: [Apify Console](https://console.apify.com)
2. **Search**: "Google News Scraper"
3. **Configure**: Set your search parameters
4. **Run**: Start the actor and monitor progress

### Using Apify CLI

```bash
# Install Apify CLI
npm install -g apify-cli

# Run the actor
apify call google-news-scraper --input '{
  "query": "artificial intelligence",
  "region": "US",
  "language": "en-US",
  "maxItems": 50,
  "dateRange": "week"
}'
```

### Using Apify API

```javascript
import { ApifyApi } from 'apify-client';

const client = new ApifyApi({
    token: 'YOUR_API_TOKEN'
});

const run = await client.actor('google-news-scraper').call({
    query: 'climate change',
    region: 'US',
    maxItems: 100
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

## ⚙️ Configuration

### Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | ✅ | - | Search query for Google News |
| `region` | string | ❌ | "US" | Region code (US, GB, DE, FR, etc.) |
| `language` | string | ❌ | "en-US" | Language code (en-US, de-DE, fr-FR, etc.) |
| `maxItems` | number | ❌ | 100 | Maximum articles to scrape (1-1000) |
| `dateRange` | string | ❌ | "week" | Time range: hour, day, week, month, year |
| `sortBy` | string | ❌ | "relevance" | Sort order: relevance, date |
| `enableBrowserMode` | boolean | ❌ | false | Force browser mode for all requests |
| `proxyConfiguration` | object | ❌ | - | Proxy settings for requests |

### Advanced Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `requestDelay` | number | 2000 | Delay between requests (ms) |
| `maxConcurrency` | number | 10 | Maximum concurrent requests |
| `retryCount` | number | 3 | Number of retry attempts |
| `timeout` | number | 30000 | Request timeout (ms) |
| `includeImages` | boolean | true | Extract and validate images |
| `validateContent` | boolean | true | Validate extracted content quality |

### Regional Support

| Region | Code | Language | Example Query |
|--------|------|----------|---------------|
| United States | US | en-US | Technology news |
| United Kingdom | GB | en-GB | Brexit updates |
| Germany | DE | de-DE | Klimawandel |
| France | FR | fr-FR | Intelligence artificielle |
| Japan | JP | ja-JP | 人工知能 |
| Australia | AU | en-AU | Bushfire news |

## 📊 Output Format

### Article Structure

```json
{
  "title": "Revolutionary AI Breakthrough in Healthcare",
  "url": "https://example.com/ai-healthcare-breakthrough",
  "text": "Full article content with comprehensive details...",
  "description": "Scientists develop AI system that can diagnose diseases...",
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
    "contentQuality": 0.95
  },
  "scrapedAt": "2024-01-15T15:00:00Z"
}
```

### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `wordCount` | number | Number of words in article text |
| `readingTime` | string | Estimated reading time |
| `language` | string | Detected content language |
| `contentQuality` | number | Quality score (0-1) |
| `extractionMethod` | string | Method used for extraction |
| `processingTime` | number | Time taken to process (ms) |

## 🔧 Development

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/your-username/google-news-scraper
cd google-news-scraper

# Install dependencies
npm install

# Set up development environment
npm run dev:setup

# Start development mode
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run development tests
npm run dev:test

# Run test scenarios
npm run dev:scenarios

# Check environment health
npm run dev:health
```

### Monitoring

```bash
# Real-time monitoring
npm run monitor

# View logs
npm run logs

# Health check
npm run dev:health
```

For detailed development information, see [DEV_README.md](DEV_README.md).

## 📚 Documentation

- **[API Reference](docs/API.md)**: Detailed API documentation
- **[Configuration Guide](docs/CONFIGURATION.md)**: Complete configuration options
- **[Developer Guide](docs/DEVELOPER.md)**: Technical documentation
- **[Troubleshooting](docs/TROUBLESHOOTING.md)**: Common issues and solutions
- **[Examples](docs/EXAMPLES.md)**: Practical usage examples

## 🔍 Use Cases

### News Monitoring
```javascript
// Monitor breaking news
{
  "query": "breaking news",
  "dateRange": "hour",
  "sortBy": "date",
  "maxItems": 20
}
```

### Market Research
```javascript
// Track industry trends
{
  "query": "artificial intelligence startup funding",
  "region": "US",
  "dateRange": "week",
  "maxItems": 100
}
```

### Content Analysis
```javascript
// Analyze sentiment and topics
{
  "query": "climate change policy",
  "region": "GB",
  "language": "en-GB",
  "validateContent": true,
  "maxItems": 200
}
```

## ⚡ Performance

### Benchmarks
- **Processing Speed**: ~50 articles per minute
- **Memory Usage**: <512MB for 1000 articles
- **Success Rate**: >95% with retry logic
- **Concurrent Requests**: Up to 10 simultaneous

### Optimization Tips
1. **Use appropriate maxItems**: Don't request more than needed
2. **Enable proxy rotation**: For high-volume scraping
3. **Set reasonable delays**: Respect rate limits
4. **Monitor performance**: Use built-in monitoring tools

## 🛡️ Error Handling

### Automatic Recovery
- **Network Errors**: Exponential backoff retry
- **Rate Limiting**: Automatic delay adjustment
- **Consent Pages**: Automatic bypass strategies
- **Content Extraction**: Multiple fallback methods
- **Circuit Breakers**: Prevent cascade failures

### Error Types
- **Retryable**: Network timeouts, rate limits, temporary failures
- **Non-retryable**: Invalid inputs, authentication errors
- **Recoverable**: Partial content extraction, image validation failures

## 📈 Monitoring & Analytics

### Built-in Metrics
- Request success/failure rates
- Response times and performance
- Memory usage and optimization
- Error classification and trends
- Content extraction quality

### Health Monitoring
- Real-time system health
- Circuit breaker status
- Resource utilization
- Error rate thresholds

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/google-news-scraper/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/google-news-scraper/discussions)
- **Email**: support@example.com

## 🏆 Acknowledgments

- Built with [Apify SDK](https://sdk.apify.com/)
- Content extraction powered by [Unfluff](https://github.com/ageitgey/node-unfluff)
- XML parsing by [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)
- Web scraping with [Crawlee](https://crawlee.dev/)
