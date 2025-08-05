# Configuration Guide

This guide covers all configuration options for the Google News Scraper, including environment variables, input parameters, and advanced settings.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Input Configuration](#input-configuration)
- [Performance Tuning](#performance-tuning)
- [Error Handling Configuration](#error-handling-configuration)
- [Development Configuration](#development-configuration)
- [Proxy Configuration](#proxy-configuration)
- [Monitoring Configuration](#monitoring-configuration)

## Environment Variables

### Production Environment

#### `NODE_ENV`
**Default**: `production`
**Values**: `production`, `development`, `test`
**Description**: Sets the runtime environment mode.

```bash
NODE_ENV=production
```

#### `APIFY_TOKEN`
**Required**: Yes (for Apify platform)
**Description**: Your Apify API token for platform integration.

```bash
APIFY_TOKEN=your_apify_token_here
```

#### `LOG_LEVEL`
**Default**: `INFO`
**Values**: `ERROR`, `WARN`, `INFO`, `DEBUG`, `TRACE`
**Description**: Controls logging verbosity.

```bash
LOG_LEVEL=INFO
```

### Development Environment

#### `DEBUG`
**Default**: `false`
**Values**: `true`, `false`
**Description**: Enables debug mode with enhanced logging.

```bash
DEBUG=true
```

#### `USE_MOCK_DATA`
**Default**: `false`
**Values**: `true`, `false`
**Description**: Uses mock data instead of live requests.

```bash
USE_MOCK_DATA=true
```

#### `BROWSER_HEADLESS`
**Default**: `true`
**Values**: `true`, `false`
**Description**: Controls browser visibility in development.

```bash
BROWSER_HEADLESS=false
```

#### `BROWSER_DEVTOOLS`
**Default**: `false`
**Values**: `true`, `false`
**Description**: Opens browser DevTools in development.

```bash
BROWSER_DEVTOOLS=true
```

### Storage Configuration

#### `LOCAL_STORAGE_DIR`
**Default**: `./storage`
**Description**: Directory for local data storage.

```bash
LOCAL_STORAGE_DIR=./storage
```

#### `ENABLE_LOCAL_STORAGE`
**Default**: `true`
**Values**: `true`, `false`
**Description**: Enables local storage for development.

```bash
ENABLE_LOCAL_STORAGE=true
```

#### `CACHE_DIR`
**Default**: `./cache`
**Description**: Directory for temporary cache files.

```bash
CACHE_DIR=./cache
```

### Logging Configuration

#### `LOG_TO_FILE`
**Default**: `true`
**Values**: `true`, `false`
**Description**: Enables file logging.

```bash
LOG_TO_FILE=true
```

#### `LOG_FILE_PATH`
**Default**: `./logs/scraper.log`
**Description**: Path to the main log file.

```bash
LOG_FILE_PATH=./logs/scraper.log
```

#### `LOG_MAX_SIZE`
**Default**: `10MB`
**Description**: Maximum log file size before rotation.

```bash
LOG_MAX_SIZE=10MB
```

#### `LOG_MAX_FILES`
**Default**: `5`
**Description**: Maximum number of rotated log files to keep.

```bash
LOG_MAX_FILES=5
```

## Input Configuration

### Search Parameters

#### Query Configuration
```json
{
  "query": "artificial intelligence",
  "queryOptions": {
    "exactMatch": false,
    "excludeTerms": ["advertisement", "sponsored"],
    "includeTerms": ["research", "breakthrough"]
  }
}
```

#### Regional Configuration
```json
{
  "region": "US",
  "language": "en-US",
  "regionalOptions": {
    "timezone": "America/New_York",
    "currency": "USD",
    "dateFormat": "MM/DD/YYYY"
  }
}
```

#### Date Range Configuration
```json
{
  "dateRange": "week",
  "customDateRange": {
    "from": "2024-01-01",
    "to": "2024-01-31"
  },
  "dateOptions": {
    "includeWeekends": true,
    "businessHoursOnly": false
  }
}
```

### Content Extraction Configuration

#### Extraction Settings
```json
{
  "extractionConfig": {
    "method": "auto",
    "fallbackMethods": ["unfluff", "css-selector", "heuristic"],
    "minContentLength": 100,
    "maxContentLength": 50000,
    "removeAds": true,
    "removeComments": true,
    "preserveFormatting": false
  }
}
```

#### Image Configuration
```json
{
  "imageConfig": {
    "includeImages": true,
    "validateImages": true,
    "minImageSize": {
      "width": 100,
      "height": 100
    },
    "maxImages": 10,
    "allowedFormats": ["jpg", "jpeg", "png", "webp"],
    "downloadImages": false
  }
}
```

### Quality Control Configuration

#### Content Validation
```json
{
  "validationConfig": {
    "validateContent": true,
    "minQualityScore": 0.5,
    "languageDetection": true,
    "duplicateDetection": true,
    "spamDetection": true,
    "adultContentFilter": false
  }
}
```

## Performance Tuning

### Concurrency Configuration

#### Request Limits
```json
{
  "performanceConfig": {
    "maxConcurrency": 10,
    "requestDelay": 2000,
    "batchSize": 50,
    "maxRetries": 3,
    "timeout": 30000
  }
}
```

#### Memory Management
```json
{
  "memoryConfig": {
    "maxMemoryUsage": "512MB",
    "garbageCollectionInterval": 60000,
    "cacheSize": "100MB",
    "streamProcessing": true
  }
}
```

### Browser Configuration

#### Browser Settings
```json
{
  "browserConfig": {
    "headless": true,
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "userAgent": "Mozilla/5.0 (compatible; GoogleNewsBot/1.0)",
    "timeout": 30000,
    "waitForSelector": "article, .content, main",
    "blockResources": ["image", "stylesheet", "font"]
  }
}
```

## Error Handling Configuration

### Retry Configuration

#### Retry Settings
```json
{
  "retryConfig": {
    "maxRetries": 3,
    "retryDelay": 1000,
    "exponentialBackoff": true,
    "backoffMultiplier": 2,
    "maxRetryDelay": 30000,
    "retryableErrors": [
      "NETWORK_ERROR",
      "TIMEOUT_ERROR",
      "RATE_LIMIT_ERROR"
    ]
  }
}
```

#### Circuit Breaker Configuration
```json
{
  "circuitBreakerConfig": {
    "enabled": true,
    "failureThreshold": 5,
    "recoveryTimeout": 60000,
    "monitoringPeriod": 10000,
    "halfOpenMaxCalls": 3
  }
}
```

### Error Classification

#### Error Types Configuration
```json
{
  "errorConfig": {
    "classifyErrors": true,
    "errorCategories": {
      "NETWORK": {
        "retryable": true,
        "severity": "HIGH"
      },
      "PARSING": {
        "retryable": false,
        "severity": "MEDIUM"
      },
      "RATE_LIMIT": {
        "retryable": true,
        "severity": "LOW"
      }
    }
  }
}
```

## Development Configuration

### Development Settings

#### Debug Configuration
```json
{
  "debugConfig": {
    "enabled": true,
    "logLevel": "DEBUG",
    "showStackTraces": true,
    "profilePerformance": true,
    "saveDebugData": true,
    "debugDataPath": "./debug"
  }
}
```

#### Mock Data Configuration
```json
{
  "mockConfig": {
    "enabled": false,
    "dataPath": "./dev/mock-data",
    "scenarios": ["basic", "error", "performance"],
    "responseDelay": 100,
    "errorRate": 0.1
  }
}
```

### Testing Configuration

#### Test Settings
```json
{
  "testConfig": {
    "timeout": 30000,
    "retries": 2,
    "parallel": false,
    "coverage": true,
    "mockData": true,
    "testDataPath": "./dev/test-data"
  }
}
```

## Proxy Configuration

### Apify Proxy Configuration

#### Basic Proxy Setup
```json
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "US"
  }
}
```

#### Advanced Proxy Configuration
```json
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL", "DATACENTER"],
    "apifyProxyCountry": "US",
    "sessionRotation": true,
    "sessionRotationInterval": 300000,
    "proxyRotation": true,
    "proxyRotationInterval": 60000
  }
}
```

### Custom Proxy Configuration

#### External Proxy Setup
```json
{
  "proxyConfiguration": {
    "useApifyProxy": false,
    "proxyUrls": [
      "http://proxy1.example.com:8080",
      "http://proxy2.example.com:8080"
    ],
    "proxyAuth": {
      "username": "your_username",
      "password": "your_password"
    }
  }
}
```

## Monitoring Configuration

### Health Monitoring

#### Health Check Configuration
```json
{
  "healthConfig": {
    "enabled": true,
    "checkInterval": 30000,
    "checks": [
      "memory",
      "disk",
      "network",
      "errors"
    ],
    "thresholds": {
      "memoryUsage": 0.8,
      "diskUsage": 0.9,
      "errorRate": 0.1
    }
  }
}
```

#### Metrics Configuration
```json
{
  "metricsConfig": {
    "enabled": true,
    "collectInterval": 10000,
    "metrics": [
      "requests",
      "responses",
      "errors",
      "performance"
    ],
    "exportFormat": "json",
    "exportPath": "./metrics"
  }
}
```

### Alerting Configuration

#### Alert Settings
```json
{
  "alertConfig": {
    "enabled": true,
    "channels": ["console", "file", "webhook"],
    "thresholds": {
      "errorRate": 0.1,
      "responseTime": 5000,
      "memoryUsage": 0.9
    },
    "webhookUrl": "https://hooks.slack.com/your-webhook"
  }
}
```

## Configuration Examples

### Production Configuration

```json
{
  "query": "technology news",
  "region": "US",
  "language": "en-US",
  "maxItems": 100,
  "dateRange": "day",
  "performanceConfig": {
    "maxConcurrency": 5,
    "requestDelay": 3000,
    "timeout": 45000
  },
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  },
  "retryConfig": {
    "maxRetries": 5,
    "exponentialBackoff": true
  }
}
```

### Development Configuration

```json
{
  "query": "test query",
  "maxItems": 10,
  "debugConfig": {
    "enabled": true,
    "logLevel": "DEBUG"
  },
  "mockConfig": {
    "enabled": true,
    "scenarios": ["basic"]
  },
  "browserConfig": {
    "headless": false,
    "devtools": true
  }
}
```

### High-Volume Configuration

```json
{
  "query": "market research",
  "maxItems": 1000,
  "performanceConfig": {
    "maxConcurrency": 20,
    "requestDelay": 1000,
    "batchSize": 100
  },
  "memoryConfig": {
    "maxMemoryUsage": "2GB",
    "streamProcessing": true
  },
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["DATACENTER", "RESIDENTIAL"],
    "sessionRotation": true
  }
}
```

## Configuration Validation

The actor validates all configuration parameters at startup and provides detailed error messages for invalid configurations. Use the development tools to validate your configuration:

```bash
npm run validate
```

For more configuration examples and best practices, see the [Examples](EXAMPLES.md) documentation.
