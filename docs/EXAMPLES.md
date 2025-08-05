# Examples & Tutorials

This document provides practical examples and step-by-step tutorials for using the Google News Scraper.

## Table of Contents

- [Basic Examples](#basic-examples)
- [Advanced Use Cases](#advanced-use-cases)
- [Integration Examples](#integration-examples)
- [Step-by-Step Tutorials](#step-by-step-tutorials)
- [Best Practices](#best-practices)
- [Real-World Scenarios](#real-world-scenarios)

## Basic Examples

### 1. Simple News Search

Search for recent technology news:

```json
{
  "query": "artificial intelligence",
  "maxItems": 20
}
```

**Expected Output**: 20 recent articles about AI from various sources.

### 2. Regional News Search

Get news from a specific region:

```json
{
  "query": "climate change",
  "region": "GB",
  "language": "en-GB",
  "maxItems": 30
}
```

**Expected Output**: 30 climate change articles from UK sources in British English.

### 3. Breaking News Monitoring

Monitor breaking news in real-time:

```json
{
  "query": "breaking news",
  "dateRange": "hour",
  "sortBy": "date",
  "maxItems": 10
}
```

**Expected Output**: 10 most recent breaking news articles from the last hour.

### 4. Multi-Language Search

Search for news in different languages:

```json
{
  "query": "intelligence artificielle",
  "region": "FR",
  "language": "fr-FR",
  "dateRange": "week",
  "maxItems": 25
}
```

**Expected Output**: 25 French articles about AI from the past week.

## Advanced Use Cases

### 1. High-Volume Data Collection

Collect large amounts of data with optimization:

```json
{
  "query": "renewable energy solar wind",
  "maxItems": 500,
  "maxConcurrency": 5,
  "requestDelay": 3000,
  "enableBrowserMode": false,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["DATACENTER", "RESIDENTIAL"]
  },
  "retryCount": 5,
  "timeout": 45000
}
```

**Use Case**: Market research requiring comprehensive data collection.

### 2. Multi-Region Comparison

Compare news coverage across regions:

```javascript
// Run multiple searches for comparison
const regions = ['US', 'GB', 'DE', 'JP'];
const results = {};

for (const region of regions) {
  const input = {
    query: "climate summit",
    region: region,
    language: region === 'DE' ? 'de-DE' : 
              region === 'JP' ? 'ja-JP' : 'en-US',
    maxItems: 50,
    dateRange: "week"
  };
  
  results[region] = await runActor(input);
}
```

**Use Case**: Analyzing how different countries report on global events.

### 3. Sentiment Analysis Pipeline

Collect data optimized for sentiment analysis:

```json
{
  "query": "stock market cryptocurrency bitcoin",
  "maxItems": 200,
  "validateContent": true,
  "includeImages": false,
  "extractionConfig": {
    "minContentLength": 200,
    "removeAds": true,
    "preserveFormatting": false
  },
  "contentFilters": {
    "minQualityScore": 0.7,
    "languageDetection": true
  }
}
```

**Use Case**: Financial sentiment analysis requiring high-quality text data.

### 4. Academic Research

Collect data for academic research with strict quality controls:

```json
{
  "query": "machine learning research papers",
  "dateRange": "month",
  "maxItems": 100,
  "validateContent": true,
  "qualityFilters": {
    "minWordCount": 300,
    "requireAuthor": true,
    "requirePublishDate": true,
    "contentQualityThreshold": 0.8
  },
  "sourceFilters": {
    "excludeDomains": ["reddit.com", "twitter.com"],
    "preferAcademic": true
  }
}
```

**Use Case**: Academic research requiring high-quality, credible sources.

## Integration Examples

### 1. Node.js Integration

```javascript
import { ApifyApi } from 'apify-client';

const client = new ApifyApi({
    token: process.env.APIFY_TOKEN
});

async function scrapeNews(query, options = {}) {
    const input = {
        query,
        maxItems: options.maxItems || 50,
        region: options.region || 'US',
        language: options.language || 'en-US',
        ...options
    };

    try {
        const run = await client.actor('google-news-scraper').call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        return items.map(item => ({
            title: item.title,
            url: item.url,
            text: item.text,
            publishedDate: item.publishedDate,
            source: item.source
        }));
    } catch (error) {
        console.error('Scraping failed:', error);
        throw error;
    }
}

// Usage
const articles = await scrapeNews('artificial intelligence', {
    maxItems: 30,
    region: 'US'
});

console.log(`Found ${articles.length} articles`);
```

### 2. Python Integration

```python
from apify_client import ApifyClient
import pandas as pd

class NewsScraperClient:
    def __init__(self, token):
        self.client = ApifyClient(token)
    
    def scrape_news(self, query, **kwargs):
        input_data = {
            'query': query,
            'maxItems': kwargs.get('max_items', 50),
            'region': kwargs.get('region', 'US'),
            'language': kwargs.get('language', 'en-US'),
            **kwargs
        }
        
        run = self.client.actor('google-news-scraper').call(run_input=input_data)
        items = self.client.dataset(run['defaultDatasetId']).list_items().items
        
        return pd.DataFrame(items)
    
    def analyze_sentiment(self, articles_df):
        # Add sentiment analysis logic here
        pass

# Usage
scraper = NewsScraperClient('your_token')
df = scraper.scrape_news('climate change', max_items=100, region='US')
print(f"Scraped {len(df)} articles")
```

### 3. Webhook Integration

```javascript
// Express.js webhook endpoint
app.post('/scrape-news', async (req, res) => {
    const { query, webhook_url } = req.body;
    
    const input = {
        query,
        maxItems: 50,
        webhookUrl: webhook_url // Send results to webhook
    };
    
    try {
        const run = await client.actor('google-news-scraper').call(input);
        res.json({ 
            success: true, 
            runId: run.id,
            message: 'Scraping started, results will be sent to webhook'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
```

## Step-by-Step Tutorials

### Tutorial 1: Building a News Monitoring Dashboard

**Goal**: Create a real-time news monitoring system.

#### Step 1: Set Up the Environment

```bash
mkdir news-monitor
cd news-monitor
npm init -y
npm install apify-client express socket.io
```

#### Step 2: Create the Scraper Service

```javascript
// scraper-service.js
import { ApifyApi } from 'apify-client';

export class NewsMonitor {
    constructor(token) {
        this.client = new ApifyApi({ token });
        this.activeQueries = new Map();
    }
    
    async startMonitoring(query, interval = 300000) { // 5 minutes
        const monitorId = `${query}-${Date.now()}`;
        
        const monitor = setInterval(async () => {
            try {
                const articles = await this.scrapeNews(query, {
                    dateRange: 'hour',
                    maxItems: 10,
                    sortBy: 'date'
                });
                
                this.onNewArticles(query, articles);
            } catch (error) {
                console.error(`Monitoring error for ${query}:`, error);
            }
        }, interval);
        
        this.activeQueries.set(monitorId, { query, monitor });
        return monitorId;
    }
    
    async scrapeNews(query, options) {
        const input = { query, ...options };
        const run = await this.client.actor('google-news-scraper').call(input);
        const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
        return items;
    }
    
    onNewArticles(query, articles) {
        // Override this method to handle new articles
        console.log(`Found ${articles.length} new articles for "${query}"`);
    }
}
```

#### Step 3: Create the Web Interface

```javascript
// server.js
import express from 'express';
import { Server } from 'socket.io';
import { NewsMonitor } from './scraper-service.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const monitor = new NewsMonitor(process.env.APIFY_TOKEN);

// Override to send articles to web interface
monitor.onNewArticles = (query, articles) => {
    io.emit('new-articles', { query, articles });
};

app.use(express.static('public'));
app.use(express.json());

app.post('/start-monitoring', async (req, res) => {
    const { query } = req.body;
    const monitorId = await monitor.startMonitoring(query);
    res.json({ success: true, monitorId });
});

server.listen(3000, () => {
    console.log('News monitor running on http://localhost:3000');
});
```

#### Step 4: Create the Frontend

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html>
<head>
    <title>News Monitor</title>
    <script src="/socket.io/socket.io.js"></script>
</head>
<body>
    <div id="app">
        <h1>Real-Time News Monitor</h1>
        
        <div>
            <input type="text" id="query" placeholder="Enter search query">
            <button onclick="startMonitoring()">Start Monitoring</button>
        </div>
        
        <div id="articles"></div>
    </div>
    
    <script>
        const socket = io();
        
        socket.on('new-articles', (data) => {
            displayArticles(data.query, data.articles);
        });
        
        function startMonitoring() {
            const query = document.getElementById('query').value;
            fetch('/start-monitoring', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
        }
        
        function displayArticles(query, articles) {
            const container = document.getElementById('articles');
            const section = document.createElement('div');
            section.innerHTML = `
                <h2>${query} (${articles.length} articles)</h2>
                ${articles.map(article => `
                    <div class="article">
                        <h3><a href="${article.url}">${article.title}</a></h3>
                        <p>${article.description}</p>
                        <small>${article.source} - ${article.publishedDate}</small>
                    </div>
                `).join('')}
            `;
            container.appendChild(section);
        }
    </script>
</body>
</html>
```

### Tutorial 2: Content Analysis Pipeline

**Goal**: Build a system to analyze news content for trends and sentiment.

#### Step 1: Data Collection

```javascript
// data-collector.js
export class NewsDataCollector {
    constructor(apifyToken) {
        this.client = new ApifyApi({ token: apifyToken });
    }
    
    async collectTopicData(topics, timeRange = 'week') {
        const results = {};
        
        for (const topic of topics) {
            console.log(`Collecting data for: ${topic}`);
            
            const input = {
                query: topic,
                dateRange: timeRange,
                maxItems: 100,
                validateContent: true,
                includeImages: false
            };
            
            const run = await this.client.actor('google-news-scraper').call(input);
            const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
            
            results[topic] = items.filter(item => 
                item.text && 
                item.text.length > 200 &&
                item.extractionSuccess
            );
        }
        
        return results;
    }
}
```

#### Step 2: Content Analysis

```javascript
// analyzer.js
import natural from 'natural';

export class ContentAnalyzer {
    constructor() {
        this.sentiment = new natural.SentimentAnalyzer('English', 
            natural.PorterStemmer, 'afinn');
        this.tokenizer = new natural.WordTokenizer();
    }
    
    analyzeSentiment(text) {
        const tokens = this.tokenizer.tokenize(text.toLowerCase());
        const score = this.sentiment.getSentiment(tokens);
        
        return {
            score,
            label: score > 0.1 ? 'positive' : 
                   score < -0.1 ? 'negative' : 'neutral'
        };
    }
    
    extractKeywords(articles, topN = 10) {
        const allText = articles.map(a => a.text).join(' ');
        const tokens = this.tokenizer.tokenize(allText.toLowerCase());
        
        // Remove stop words and count frequency
        const stopWords = natural.stopwords;
        const wordFreq = {};
        
        tokens.forEach(token => {
            if (!stopWords.includes(token) && token.length > 3) {
                wordFreq[token] = (wordFreq[token] || 0) + 1;
            }
        });
        
        return Object.entries(wordFreq)
            .sort(([,a], [,b]) => b - a)
            .slice(0, topN)
            .map(([word, count]) => ({ word, count }));
    }
    
    generateReport(topicData) {
        const report = {};
        
        for (const [topic, articles] of Object.entries(topicData)) {
            const sentiments = articles.map(a => this.analyzeSentiment(a.text));
            const keywords = this.extractKeywords(articles);
            
            report[topic] = {
                articleCount: articles.length,
                averageSentiment: sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length,
                sentimentDistribution: {
                    positive: sentiments.filter(s => s.label === 'positive').length,
                    neutral: sentiments.filter(s => s.label === 'neutral').length,
                    negative: sentiments.filter(s => s.label === 'negative').length
                },
                topKeywords: keywords,
                sources: [...new Set(articles.map(a => a.source))],
                dateRange: {
                    earliest: Math.min(...articles.map(a => new Date(a.publishedDate))),
                    latest: Math.max(...articles.map(a => new Date(a.publishedDate)))
                }
            };
        }
        
        return report;
    }
}
```

#### Step 3: Putting It Together

```javascript
// main.js
import { NewsDataCollector } from './data-collector.js';
import { ContentAnalyzer } from './analyzer.js';

async function runAnalysis() {
    const collector = new NewsDataCollector(process.env.APIFY_TOKEN);
    const analyzer = new ContentAnalyzer();
    
    const topics = [
        'artificial intelligence',
        'climate change',
        'cryptocurrency',
        'renewable energy',
        'space exploration'
    ];
    
    console.log('Collecting news data...');
    const topicData = await collector.collectTopicData(topics);
    
    console.log('Analyzing content...');
    const report = analyzer.generateReport(topicData);
    
    console.log('Analysis Report:');
    console.log(JSON.stringify(report, null, 2));
    
    // Save report
    await fs.writeFile('analysis-report.json', JSON.stringify(report, null, 2));
    console.log('Report saved to analysis-report.json');
}

runAnalysis().catch(console.error);
```

## Best Practices

### 1. Rate Limiting and Politeness

```json
{
  "requestDelay": 3000,
  "maxConcurrency": 5,
  "retryCount": 3,
  "timeout": 30000
}
```

**Why**: Prevents overwhelming target servers and reduces chance of being blocked.

### 2. Proxy Usage

```json
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "sessionRotation": true
  }
}
```

**Why**: Residential proxies are less likely to be blocked by news sites.

### 3. Content Quality Validation

```json
{
  "validateContent": true,
  "extractionConfig": {
    "minContentLength": 100,
    "removeAds": true
  }
}
```

**Why**: Ensures high-quality data for analysis and research.

### 4. Error Handling

```javascript
async function robustScraping(query, options) {
    const maxAttempts = 3;
    let attempt = 0;
    
    while (attempt < maxAttempts) {
        try {
            return await scrapeNews(query, options);
        } catch (error) {
            attempt++;
            console.log(`Attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxAttempts) {
                const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`Failed after ${maxAttempts} attempts`);
}
```

## Real-World Scenarios

### 1. Financial News Monitoring

Monitor financial news for trading signals:

```json
{
  "query": "stock market earnings report",
  "dateRange": "hour",
  "sortBy": "date",
  "maxItems": 20,
  "sourceFilters": {
    "includeDomains": ["reuters.com", "bloomberg.com", "wsj.com"]
  }
}
```

### 2. Crisis Communication Monitoring

Monitor news during crisis situations:

```json
{
  "query": "natural disaster emergency response",
  "region": "US",
  "dateRange": "hour",
  "maxItems": 50,
  "enableBrowserMode": true,
  "requestDelay": 1000
}
```

### 3. Competitive Intelligence

Monitor competitor mentions in news:

```json
{
  "query": "CompanyName product launch acquisition",
  "dateRange": "week",
  "maxItems": 100,
  "validateContent": true,
  "includeImages": true
}
```

### 4. Academic Research

Collect data for research papers:

```json
{
  "query": "machine learning healthcare applications",
  "dateRange": "month",
  "maxItems": 200,
  "qualityFilters": {
    "minWordCount": 500,
    "requireAuthor": true,
    "contentQualityThreshold": 0.8
  }
}
```

These examples demonstrate the versatility and power of the Google News Scraper for various use cases. Adapt the configurations based on your specific needs and always respect rate limits and terms of service.
