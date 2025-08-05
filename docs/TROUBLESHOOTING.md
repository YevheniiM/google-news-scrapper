# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Google News Scraper.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Common Issues](#common-issues)
- [Error Messages](#error-messages)
- [Performance Issues](#performance-issues)
- [Development Issues](#development-issues)
- [FAQ](#faq)
- [Getting Help](#getting-help)

## Quick Diagnostics

### Health Check

Run the built-in health check to identify issues:

```bash
npm run dev:health
```

This checks:
- Environment configuration
- Required directories
- Dependencies
- Storage system
- Memory usage
- Disk space

### Log Analysis

Check logs for error patterns:

```bash
# View recent logs
npm run logs

# View error logs only
npm run logs:errors

# Search for specific errors
grep "ERROR" logs/scraper.log
```

### System Status

Monitor real-time system status:

```bash
npm run monitor
```

## Common Issues

### 1. No Articles Found

**Symptoms:**
- Actor completes but returns empty dataset
- RSS feed returns no results
- All articles fail content extraction

**Causes & Solutions:**

#### Invalid Query
```bash
# Problem: Query too specific or contains typos
# Solution: Simplify query
{
  "query": "artificial intelligence" // Instead of "AI ML deep learning neural networks"
}
```

#### Region/Language Mismatch
```bash
# Problem: Searching for English content in non-English region
# Solution: Match region and language
{
  "query": "technology",
  "region": "DE",
  "language": "de-DE" // Use German for Germany
}
```

#### Date Range Too Narrow
```bash
# Problem: No articles in specified time range
# Solution: Expand date range
{
  "query": "breaking news",
  "dateRange": "week" // Instead of "hour"
}
```

### 2. Content Extraction Failures

**Symptoms:**
- Articles found but text field is empty
- extractionSuccess: false
- Missing author/images

**Causes & Solutions:**

#### Consent Pages/Paywalls
```bash
# Problem: Sites require consent or subscription
# Solution: Enable browser mode
{
  "enableBrowserMode": true,
  "requestDelay": 3000
}
```

#### JavaScript-Heavy Sites
```bash
# Problem: Content loaded dynamically
# Solution: Use browser mode with longer timeouts
{
  "enableBrowserMode": true,
  "timeout": 45000,
  "browserConfig": {
    "waitForSelector": "article, .content, main"
  }
}
```

#### Anti-Bot Protection
```bash
# Problem: Sites blocking automated requests
# Solution: Use residential proxies and delays
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  },
  "requestDelay": 5000,
  "maxConcurrency": 3
}
```

### 3. Rate Limiting Issues

**Symptoms:**
- HTTP 429 errors
- Requests timing out
- Slow processing

**Causes & Solutions:**

#### Too Many Concurrent Requests
```bash
# Problem: Overwhelming target servers
# Solution: Reduce concurrency
{
  "maxConcurrency": 3, // Instead of 10+
  "requestDelay": 3000 // Increase delay
}
```

#### Insufficient Delays
```bash
# Problem: Requests too frequent
# Solution: Increase delays
{
  "requestDelay": 5000, // 5 seconds between requests
  "retryDelay": 10000   // 10 seconds for retries
}
```

### 4. Memory Issues

**Symptoms:**
- Out of memory errors
- Slow performance
- Actor crashes

**Causes & Solutions:**

#### Processing Too Many Articles
```bash
# Problem: Trying to process 1000+ articles
# Solution: Reduce batch size
{
  "maxItems": 100,     // Limit total articles
  "batchSize": 25      // Process in smaller batches
}
```

#### Memory Leaks
```bash
# Problem: Memory not being released
# Solution: Enable garbage collection
{
  "memoryConfig": {
    "garbageCollectionInterval": 30000,
    "maxMemoryUsage": "512MB"
  }
}
```

### 5. Proxy Issues

**Symptoms:**
- Connection errors
- IP blocking
- Inconsistent results

**Causes & Solutions:**

#### Proxy Configuration
```bash
# Problem: Incorrect proxy setup
# Solution: Verify proxy configuration
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"], // Use residential for news sites
    "apifyProxyCountry": "US"            // Match target region
  }
}
```

#### Proxy Rotation
```bash
# Problem: Same IP being blocked
# Solution: Enable session rotation
{
  "proxyConfiguration": {
    "sessionRotation": true,
    "sessionRotationInterval": 300000 // 5 minutes
  }
}
```

## Error Messages

### Network Errors

#### `ECONNRESET` / `ECONNREFUSED`
**Meaning**: Connection was reset or refused by server
**Solutions**:
1. Increase request delay: `"requestDelay": 5000`
2. Reduce concurrency: `"maxConcurrency": 3`
3. Enable retries: `"retryCount": 5`
4. Use residential proxies

#### `ETIMEDOUT`
**Meaning**: Request timed out
**Solutions**:
1. Increase timeout: `"timeout": 60000`
2. Use browser mode for slow sites
3. Check network connectivity
4. Verify proxy configuration

### Parsing Errors

#### `Invalid XML`
**Meaning**: RSS feed contains malformed XML
**Solutions**:
1. Check query for special characters
2. Try different region/language
3. Verify Google News availability in region

#### `Content extraction failed`
**Meaning**: Unable to extract article content
**Solutions**:
1. Enable browser mode
2. Add custom CSS selectors
3. Increase timeout values
4. Check for consent pages

### Rate Limiting Errors

#### `HTTP 429 - Too Many Requests`
**Meaning**: Server is rate limiting requests
**Solutions**:
1. Increase delays: `"requestDelay": 10000`
2. Reduce concurrency: `"maxConcurrency": 1`
3. Use different proxy groups
4. Implement exponential backoff

#### `HTTP 403 - Forbidden`
**Meaning**: Access denied, possibly IP blocked
**Solutions**:
1. Use residential proxies
2. Rotate user agents
3. Add request headers
4. Check for geographic restrictions

## Performance Issues

### Slow Processing

**Diagnosis:**
```bash
# Check performance metrics
npm run monitor

# Profile memory usage
node --inspect src/main.js
```

**Solutions:**
1. **Reduce Scope**: Lower `maxItems` value
2. **Optimize Concurrency**: Find optimal `maxConcurrency`
3. **Enable Caching**: Use local storage for repeated requests
4. **Stream Processing**: Process articles in batches

### High Memory Usage

**Diagnosis:**
```bash
# Monitor memory in real-time
npm run monitor

# Check for memory leaks
node --inspect --expose-gc src/main.js
```

**Solutions:**
1. **Batch Processing**: Process articles in smaller batches
2. **Garbage Collection**: Enable explicit GC
3. **Memory Limits**: Set `maxMemoryUsage` limits
4. **Stream Processing**: Avoid loading all data in memory

### Timeout Issues

**Common Timeouts:**
- Request timeout: Individual HTTP requests
- Actor timeout: Overall actor execution
- Browser timeout: Page load timeout

**Solutions:**
```json
{
  "timeout": 45000,           // Request timeout
  "actorTimeout": 3600,       // Actor timeout (1 hour)
  "browserTimeout": 60000     // Browser timeout
}
```

## Development Issues

### Environment Setup

#### `Module not found` errors
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### `Permission denied` errors
```bash
# Solution: Fix permissions
chmod +x dev/*.js
npm run dev:setup
```

### Testing Issues

#### Tests failing in development
```bash
# Solution: Reset test environment
npm run dev:clean -- --all
npm run dev:setup
npm run dev:test
```

#### Mock data not working
```bash
# Solution: Regenerate mock data
npm run dev:clean -- --mock
npm run dev:setup
```

### Build Issues

#### ESLint errors
```bash
# Solution: Fix linting issues
npm run lint:fix
```

#### Prettier formatting
```bash
# Solution: Format code
npm run format
```

## FAQ

### Q: Why are some articles missing content?

**A**: This can happen due to:
- Consent pages or paywalls
- JavaScript-heavy sites
- Anti-bot protection
- Content behind authentication

**Solution**: Enable browser mode and use residential proxies.

### Q: How can I improve extraction success rate?

**A**: Try these approaches:
1. Enable browser mode: `"enableBrowserMode": true`
2. Use residential proxies
3. Increase delays between requests
4. Add custom extraction rules

### Q: Why is the actor running slowly?

**A**: Common causes:
- High concurrency settings
- Browser mode enabled for all requests
- Large number of articles requested
- Network latency

**Solution**: Optimize concurrency and use HTTP mode when possible.

### Q: How do I handle different languages?

**A**: Set appropriate region and language:
```json
{
  "region": "DE",
  "language": "de-DE",
  "query": "Künstliche Intelligenz"
}
```

### Q: Can I scrape articles from specific time periods?

**A**: Yes, use date range filtering:
```json
{
  "dateRange": "week",
  "customDateRange": {
    "from": "2024-01-01",
    "to": "2024-01-31"
  }
}
```

### Q: How do I handle rate limiting?

**A**: Implement these strategies:
1. Increase delays: `"requestDelay": 5000`
2. Reduce concurrency: `"maxConcurrency": 3`
3. Use residential proxies
4. Enable exponential backoff

### Q: What's the maximum number of articles I can scrape?

**A**: Technical limit is 1000 articles per run, but consider:
- Memory usage increases with article count
- Processing time scales linearly
- Rate limiting may affect large requests

**Recommendation**: Start with 100 articles and scale up based on performance.

## Getting Help

### Debug Information

When reporting issues, include:

1. **Input Configuration**:
```json
{
  "query": "your query",
  "region": "US",
  "maxItems": 50
}
```

2. **Error Messages**:
```bash
npm run logs:errors
```

3. **System Information**:
```bash
npm run dev:health
```

4. **Performance Metrics**:
```bash
npm run monitor
```

### Support Channels

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/your-username/google-news-scraper/issues)
- **GitHub Discussions**: [Ask questions and share ideas](https://github.com/your-username/google-news-scraper/discussions)
- **Documentation**: Check other documentation files
- **Email Support**: support@example.com

### Before Reporting Issues

1. **Check Documentation**: Review all documentation files
2. **Search Existing Issues**: Look for similar problems
3. **Run Diagnostics**: Use built-in diagnostic tools
4. **Try Solutions**: Attempt suggested solutions
5. **Gather Information**: Collect debug information

### Issue Template

When reporting issues, use this template:

```markdown
## Issue Description
Brief description of the problem

## Configuration
```json
{
  "query": "your query",
  "region": "US"
}
```

## Error Messages
```
Paste error messages here
```

## Environment
- Node.js version:
- Operating system:
- Actor version:

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What you expected to happen

## Actual Behavior
What actually happened
```
