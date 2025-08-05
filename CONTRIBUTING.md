# Contributing to Google News Scraper

We welcome contributions to the Google News Scraper project! This guide will help you get started with contributing code, documentation, or reporting issues.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) to help us maintain a welcoming and inclusive community.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Git
- Basic knowledge of JavaScript/Node.js
- Familiarity with web scraping concepts

### First Contribution

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Set up the development environment**
4. **Make your changes**
5. **Test your changes**
6. **Submit a pull request**

## Development Setup

### 1. Clone and Install

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/google-news-scraper.git
cd google-news-scraper

# Add upstream remote
git remote add upstream https://github.com/original-owner/google-news-scraper.git

# Install dependencies
npm install

# Set up development environment
npm run dev:setup
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env
```

### 3. Verify Setup

```bash
# Run health check
npm run dev:health

# Run tests
npm run test

# Start development mode
npm run dev
```

## Contributing Guidelines

### Types of Contributions

We welcome several types of contributions:

1. **Bug Fixes**: Fix existing issues
2. **Feature Enhancements**: Improve existing features
3. **New Features**: Add new functionality
4. **Documentation**: Improve or add documentation
5. **Tests**: Add or improve test coverage
6. **Performance**: Optimize performance
7. **Refactoring**: Improve code structure

### Before You Start

1. **Check existing issues** to see if your idea is already being worked on
2. **Create an issue** to discuss major changes before implementing
3. **Search pull requests** to avoid duplicate work
4. **Read the documentation** to understand the project structure

### Contribution Process

1. **Create an Issue**: For bugs or feature requests
2. **Fork and Branch**: Create a feature branch
3. **Develop**: Make your changes with tests
4. **Test**: Ensure all tests pass
5. **Document**: Update relevant documentation
6. **Submit**: Create a pull request

## Pull Request Process

### 1. Prepare Your Branch

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Keep your branch updated
git fetch upstream
git rebase upstream/main
```

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style
- Add tests for new functionality
- Update documentation as needed
- Commit changes with clear messages

### 3. Test Your Changes

```bash
# Run all tests
npm run test

# Run development tests
npm run dev:test

# Run linting
npm run lint

# Check formatting
npm run format:check
```

### 4. Submit Pull Request

1. **Push your branch** to your fork
2. **Create pull request** on GitHub
3. **Fill out the template** completely
4. **Link related issues**
5. **Request review** from maintainers

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## Issue Reporting

### Bug Reports

Use the bug report template:

```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- Node.js version:
- Operating system:
- Actor version:

## Additional Context
Screenshots, logs, etc.
```

### Feature Requests

Use the feature request template:

```markdown
## Feature Description
Clear description of the feature

## Use Case
Why is this feature needed?

## Proposed Solution
How should this work?

## Alternatives Considered
Other approaches considered

## Additional Context
Mockups, examples, etc.
```

## Development Workflow

### Branch Naming

Use descriptive branch names:

- `feature/add-proxy-rotation`
- `fix/memory-leak-issue`
- `docs/update-api-reference`
- `test/add-integration-tests`
- `refactor/error-handling`

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting changes
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(rss): add support for custom date ranges
fix(crawler): resolve memory leak in article processing
docs(api): update configuration examples
test(unit): add tests for error handler
```

### Development Commands

```bash
# Development mode with hot reload
npm run dev:watch

# Run with debugger
npm run dev:debug

# Run specific tests
npm run test:unit
npm run test:integration

# Code quality checks
npm run lint
npm run format
npm run validate

# Performance monitoring
npm run monitor
npm run benchmark
```

## Code Style

### JavaScript Style Guide

We use ESLint and Prettier for code formatting:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

### Code Standards

1. **Use ES6+ features** (async/await, destructuring, etc.)
2. **Write descriptive variable names**
3. **Add JSDoc comments** for public methods
4. **Handle errors gracefully**
5. **Use consistent indentation** (2 spaces)
6. **Limit line length** to 100 characters
7. **Use semicolons** consistently

### Example Code Style

```javascript
/**
 * Fetches RSS feed and parses articles
 * @param {Object} input - Input configuration
 * @param {string} input.query - Search query
 * @param {string} input.region - Region code
 * @returns {Promise<Map>} Map of articles
 */
async function fetchRssItems(input) {
    const { query, region = 'US', language = 'en-US' } = input;
    
    try {
        const url = this.buildRssUrl(query, region, language);
        const response = await this.makeRequest(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const xmlContent = await response.text();
        return this.parseRssContent(xmlContent);
    } catch (error) {
        this.logger.error('RSS fetch failed', { query, region, error: error.message });
        throw error;
    }
}
```

## Testing

### Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── rss-fetcher.test.js
│   ├── article-crawler.test.js
│   └── error-handler.test.js
├── integration/             # Integration tests
│   ├── full-workflow.test.js
│   └── error-scenarios.test.js
└── performance/             # Performance tests
    ├── memory-usage.test.js
    └── concurrency.test.js
```

### Writing Tests

#### Unit Test Example

```javascript
import { RssFetcher } from '../src/rss-fetcher.js';
import { jest } from '@jest/globals';

describe('RssFetcher', () => {
    let rssFetcher;

    beforeEach(() => {
        rssFetcher = new RssFetcher();
    });

    describe('buildRssUrl', () => {
        test('should build correct URL with basic parameters', () => {
            const url = rssFetcher.buildRssUrl('test', 'US', 'en-US');
            
            expect(url).toContain('news.google.com/rss/search');
            expect(url).toContain('q=test');
            expect(url).toContain('gl=US');
            expect(url).toContain('hl=en-US');
        });

        test('should handle special characters in query', () => {
            const url = rssFetcher.buildRssUrl('test & query', 'US', 'en-US');
            
            expect(url).toContain('q=test%20%26%20query');
        });
    });

    describe('fetchRssItems', () => {
        test('should handle network errors gracefully', async () => {
            jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
            
            await expect(rssFetcher.fetchRssItems({ query: 'test' }))
                .rejects.toThrow('Network error');
        });
    });
});
```

#### Integration Test Example

```javascript
import { Actor } from 'apify';
import { main } from '../src/main.js';

describe('Full Workflow Integration', () => {
    beforeAll(async () => {
        await Actor.init();
    });

    afterAll(async () => {
        await Actor.exit();
    });

    test('should complete scraping workflow', async () => {
        const input = {
            query: 'test query',
            maxItems: 5,
            region: 'US'
        };

        await Actor.setValue('INPUT', input);
        await main();
        
        const dataset = await Actor.openDataset();
        const { items } = await dataset.getData();
        
        expect(items.length).toBeGreaterThan(0);
        expect(items[0]).toHaveProperty('title');
        expect(items[0]).toHaveProperty('url');
        expect(items[0]).toHaveProperty('text');
    });
});
```

### Test Commands

```bash
# Run all tests
npm run test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:performance

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run development tests
npm run dev:test
```

## Documentation

### Documentation Standards

1. **Keep documentation up-to-date** with code changes
2. **Use clear, concise language**
3. **Include practical examples**
4. **Document all public APIs**
5. **Add JSDoc comments** to functions
6. **Update README** for major changes

### Documentation Types

1. **API Documentation**: Function signatures and parameters
2. **User Guides**: How to use the actor
3. **Developer Guides**: Technical implementation details
4. **Examples**: Practical usage examples
5. **Troubleshooting**: Common issues and solutions

### JSDoc Standards

```javascript
/**
 * Extracts content from article HTML
 * @param {string} html - Article HTML content
 * @param {Object} options - Extraction options
 * @param {string} options.method - Extraction method to use
 * @param {boolean} options.removeAds - Whether to remove advertisements
 * @returns {Promise<Object>} Extracted article data
 * @throws {Error} When extraction fails completely
 * @example
 * const content = await extractContent(html, { method: 'unfluff' });
 * console.log(content.title, content.text);
 */
async function extractContent(html, options = {}) {
    // Implementation
}
```

## Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and general discussion
- **Pull Request Reviews**: Code review and feedback
- **Documentation**: Comprehensive guides and examples

### Asking for Help

When asking for help:

1. **Search existing issues** first
2. **Provide context** about what you're trying to do
3. **Include error messages** and logs
4. **Share relevant code** snippets
5. **Describe what you've tried** already

### Mentorship

New contributors can:

- Look for issues labeled `good first issue`
- Ask questions in GitHub Discussions
- Request code review feedback
- Participate in documentation improvements

## Recognition

Contributors are recognized through:

- **GitHub Contributors** page
- **Release notes** acknowledgments
- **Community highlights**
- **Maintainer recommendations**

Thank you for contributing to the Google News Scraper project! Your contributions help make this tool better for everyone.
