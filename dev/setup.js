#!/usr/bin/env node
/**
 * Development Environment Setup Script
 * Initializes the local development environment
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function setupDevelopmentEnvironment() {
    console.log('🚀 Setting up development environment...');
    
    try {
        // Create required directories
        const directories = [
            'logs',
            'logs/errors',
            'storage',
            'cache',
            'dev/mock-data',
            'dev/mock-data/rss',
            'dev/mock-data/articles',
            'dev/test-data',
            'dev/test-data/scenarios',
            'dev/test-data/expected',
            'dev/browser-data',
        ];

        console.log('📁 Creating directories...');
        for (const dir of directories) {
            const fullPath = path.join(rootDir, dir);
            try {
                await fs.mkdir(fullPath, { recursive: true });
                console.log(`  ✅ Created: ${dir}`);
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    console.log(`  ❌ Failed to create ${dir}: ${error.message}`);
                }
            }
        }

        // Create .env file if it doesn't exist
        const envPath = path.join(rootDir, '.env');
        const envExamplePath = path.join(rootDir, '.env.example');
        
        try {
            await fs.access(envPath);
            console.log('📄 .env file already exists');
        } catch {
            try {
                const envExample = await fs.readFile(envExamplePath, 'utf8');
                await fs.writeFile(envPath, envExample);
                console.log('📄 Created .env file from .env.example');
            } catch (error) {
                console.log('⚠️  Could not create .env file:', error.message);
            }
        }

        // Create sample mock data
        console.log('📝 Creating sample mock data...');
        await createSampleMockData();

        // Create sample test scenarios
        console.log('🧪 Creating sample test scenarios...');
        await createSampleTestScenarios();

        // Create development configuration
        console.log('⚙️  Creating development configuration...');
        await createDevConfiguration();

        console.log('\n🎉 Development environment setup complete!');
        console.log('\n📋 Next steps:');
        console.log('  1. Review and customize .env file');
        console.log('  2. Run: npm run dev');
        console.log('  3. Run: npm run dev:test');
        console.log('  4. Check logs: npm run logs');

    } catch (error) {
        console.error('💥 Setup failed:', error.message);
        process.exit(1);
    }
}

async function createSampleMockData() {
    // Sample RSS feed
    const sampleRss = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<generator>NFE/5.0</generator>
<title>"development test" - Google News</title>
<language>en-US</language>
<webMaster>news-webmaster@google.com</webMaster>
<copyright>2024 Google Inc.</copyright>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<description>Google News</description>
<item>
<title><![CDATA[Development Test Article 1]]></title>
<link>https://news.google.com/rss/articles/CBMiDevTest1?oc=5</link>
<guid isPermaLink="false">CBMiDevTest1</guid>
<pubDate>${new Date().toUTCString()}</pubDate>
<description><![CDATA[This is a test article for development purposes.]]></description>
<source url="https://example.com">Dev News</source>
</item>
<item>
<title><![CDATA[Development Test Article 2]]></title>
<link>https://news.google.com/rss/articles/CBMiDevTest2?oc=5</link>
<guid isPermaLink="false">CBMiDevTest2</guid>
<pubDate>${new Date(Date.now() - 3600000).toUTCString()}</pubDate>
<description><![CDATA[Another test article for development.]]></description>
<source url="https://example.com">Dev News</source>
</item>
</channel>
</rss>`;

    await fs.writeFile(path.join(rootDir, 'dev/mock-data/rss/sample.xml'), sampleRss);

    // Sample article HTML
    const sampleArticle = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Development Test Article</title>
    <meta name="description" content="This is a test article for development">
    <meta name="author" content="Dev Author">
</head>
<body>
    <article>
        <h1>Development Test Article</h1>
        <div class="meta">
            <span class="author">By Dev Author</span>
            <time datetime="${new Date().toISOString()}">${new Date().toLocaleDateString()}</time>
        </div>
        <div class="content">
            <p>This is a test article created for development and testing purposes.</p>
            <p>It contains sample content that can be used to test the content extraction functionality.</p>
            <img src="https://via.placeholder.com/600x400" alt="Test image">
        </div>
    </article>
</body>
</html>`;

    await fs.writeFile(path.join(rootDir, 'dev/mock-data/articles/sample.html'), sampleArticle);
}

async function createSampleTestScenarios() {
    const scenarios = [
        {
            name: 'basic_rss_test',
            description: 'Test basic RSS feed processing',
            input: {
                query: 'test',
                region: 'US',
                language: 'en-US',
                maxItems: 5,
            },
            expected: {
                'articles.size': 2,
            },
            assertions: [
                function(result) { return result.articles && result.articles.size > 0; },
            ],
        },
        {
            name: 'error_handling_test',
            description: 'Test error handling and recovery',
            input: {
                query: 'nonexistent',
                region: 'XX',
                language: 'xx-XX',
                maxItems: 1,
            },
            expected: {
                success: false,
            },
            assertions: [
                function(result) { return result.error !== undefined; },
            ],
        },
    ];

    for (const scenario of scenarios) {
        const scenarioPath = path.join(rootDir, 'dev/test-data/scenarios', `${scenario.name}.json`);
        await fs.writeFile(scenarioPath, JSON.stringify(scenario, null, 2));
    }
}

async function createDevConfiguration() {
    const devConfig = {
        development: {
            enabled: true,
            debug: true,
            mockData: true,
            logLevel: 'DEBUG',
        },
        testing: {
            timeout: 30000,
            retries: 2,
            parallel: false,
        },
        monitoring: {
            enabled: true,
            interval: 30000,
        },
    };

    await fs.writeFile(
        path.join(rootDir, 'dev/config.json'),
        JSON.stringify(devConfig, null, 2)
    );
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    setupDevelopmentEnvironment();
}
