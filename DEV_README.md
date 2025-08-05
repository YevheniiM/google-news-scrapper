# Google News Scraper - Development Guide

This guide covers local development setup, testing, and debugging for the Google News Scraper project.

## 🚀 Quick Start

### 1. Initial Setup
```bash
# Clone and install dependencies
npm install

# Set up development environment
npm run dev:setup

# Copy environment configuration
cp .env.example .env

# Edit .env file with your settings
nano .env
```

### 2. Run Development Mode
```bash
# Start in development mode with debug logging
npm run dev

# Start with file watching (auto-restart on changes)
npm run dev:watch

# Start with Node.js debugger
npm run dev:debug
```

### 3. Run Tests
```bash
# Run development tests
npm run dev:test

# Run test scenarios
npm run dev:scenarios

# Run health check
npm run dev:health
```

## 📁 Development Structure

```
dev/
├── setup.js           # Environment setup script
├── test-runner.js     # Development test runner
├── scenario-runner.js # Comprehensive test scenarios
├── health-check.js    # Environment health checker
├── cleanup.js         # Development cleanup utility
├── monitor.js         # Real-time monitoring
├── mock-data/         # Mock RSS feeds and articles
├── test-data/         # Test scenarios and expected results
└── config.json        # Development configuration

logs/
├── scraper.log        # Main application logs
└── errors/            # Error-specific logs

storage/
├── metadata.json      # Storage metadata
└── [categories]/      # Categorized storage files

cache/                 # Temporary cache files
```

## 🛠️ Development Tools

### Environment Setup
```bash
npm run dev:setup      # Initialize development environment
npm run dev:health     # Check environment health
npm run dev:clean      # Clean development data
```

### Testing & Debugging
```bash
npm run dev:test       # Run development tests
npm run dev:scenarios  # Run comprehensive scenarios
npm run dev:mock       # Run with mock data
npm run dev:debug      # Start with debugger
```

### Monitoring & Maintenance
```bash
npm run monitor        # Real-time monitoring
npm run logs           # View application logs
npm run logs:errors    # View error logs
npm run dev:clean      # Clean up development files
```

## 🧪 Testing Framework

### Mock Data System
The development environment includes a comprehensive mock data system:

- **RSS Feeds**: Mock Google News RSS responses
- **Articles**: Sample article HTML for content extraction
- **Error Scenarios**: Simulated error conditions
- **Performance Data**: Large datasets for performance testing

### Test Scenarios
Pre-built test scenarios cover:

- **Basic Functionality**: RSS fetching and processing
- **Error Handling**: Network errors, invalid inputs, timeouts
- **Content Extraction**: HTML parsing and content extraction
- **Performance**: Memory usage, processing speed, concurrency
- **Storage**: Local data persistence and retrieval
- **Monitoring**: Health checks and metrics collection

### Running Specific Tests
```bash
# Run all development tests
npm run dev:test

# Run specific test scenarios
npm run dev:scenarios

# Run with mock data
npm run dev:mock

# Performance testing
npm run benchmark
```

## 🔧 Configuration

### Environment Variables (.env)
```bash
# Development Mode
NODE_ENV=development
DEBUG=true

# Logging
LOG_LEVEL=DEBUG
LOG_TO_FILE=true
LOG_FILE_PATH=./logs/scraper.log

# Local Storage
LOCAL_STORAGE_DIR=./storage
ENABLE_LOCAL_STORAGE=true

# Mock Data
USE_MOCK_DATA=false
MOCK_DATA_DIR=./dev/mock-data

# Browser (for debugging)
BROWSER_HEADLESS=false
BROWSER_DEVTOOLS=true
BROWSER_SLOW_MO=100
```

### Development Features
- **Hot Reload**: Automatic restart on file changes
- **Debug UI**: Enhanced debugging interface
- **Metrics Dashboard**: Real-time performance metrics
- **Local Database**: JSON-based local persistence
- **Desktop Notifications**: Development alerts

## 📊 Monitoring & Debugging

### Real-time Monitoring
```bash
npm run monitor
```

Displays:
- Memory usage and trends
- Disk space utilization
- File counts by category
- Error and warning counts
- Overall health status

### Debug Logging
Enhanced logging with:
- Structured JSON logs
- Caller information
- Memory usage tracking
- Performance timing
- Error classification

### Health Checks
```bash
npm run dev:health
```

Checks:
- Environment configuration
- Required directories
- Dependencies
- Storage system
- Mock data availability
- Log files
- Memory usage
- Disk space

## 🧹 Maintenance

### Cleanup Utilities
```bash
# Clean specific data types
npm run dev:clean -- --logs
npm run dev:clean -- --storage
npm run dev:clean -- --cache
npm run dev:clean -- --mock
npm run dev:clean -- --test

# Clean everything
npm run dev:clean -- --all

# Force cleanup without confirmation
npm run dev:clean -- --all --force
```

### Storage Management
The local storage system provides:
- Automatic cleanup of expired data
- Size-based cleanup when limits exceeded
- Data export/import capabilities
- Metadata tracking
- Category-based organization

## 🐛 Debugging Tips

### Common Issues

1. **Memory Issues**
   - Monitor with `npm run monitor`
   - Clean cache with `npm run dev:clean -- --cache`
   - Check memory limits in `.env`

2. **Storage Issues**
   - Run health check: `npm run dev:health`
   - Clean storage: `npm run dev:clean -- --storage`
   - Check disk space

3. **Test Failures**
   - Check mock data: `npm run dev:health`
   - Reset environment: `npm run dev:setup`
   - Review logs: `npm run logs`

### Debug Mode Features
- Detailed console output with colors
- Caller information in logs
- Memory usage tracking
- HTTP request/response logging
- Performance timing measurements

### Browser Debugging
When `BROWSER_HEADLESS=false`:
- Visual browser window
- DevTools enabled
- Slow motion execution
- Network request inspection

## 📈 Performance Testing

### Benchmarking
```bash
npm run benchmark
```

Tests:
- RSS processing speed
- Content extraction performance
- Memory usage patterns
- Concurrent operation handling
- Storage read/write performance

### Memory Profiling
- Built-in memory monitoring
- Automatic memory leak detection
- Memory usage alerts
- Garbage collection tracking

## 🔄 Development Workflow

### Typical Development Session
1. **Setup**: `npm run dev:setup`
2. **Health Check**: `npm run dev:health`
3. **Start Development**: `npm run dev:watch`
4. **Run Tests**: `npm run dev:test`
5. **Monitor**: `npm run monitor` (in separate terminal)
6. **Debug Issues**: Check logs and health status
7. **Cleanup**: `npm run dev:clean` (as needed)

### Best Practices
- Always run health checks before starting development
- Use mock data for consistent testing
- Monitor memory usage during development
- Clean up regularly to avoid disk space issues
- Use debug mode for troubleshooting
- Run scenarios to test comprehensive functionality

## 📚 Additional Resources

- **Main README**: Project overview and production setup
- **API Documentation**: Detailed API reference
- **Configuration Guide**: Complete configuration options
- **Troubleshooting**: Common issues and solutions

## 🆘 Getting Help

If you encounter issues:
1. Run `npm run dev:health` to check environment
2. Check logs with `npm run logs`
3. Review error logs with `npm run logs:errors`
4. Clean and reset with `npm run dev:clean -- --all && npm run dev:setup`
5. Check the troubleshooting section in the main README
