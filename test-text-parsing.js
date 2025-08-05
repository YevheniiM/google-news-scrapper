/**
 * Test script for the enhanced text parsing and image extraction functionality
 */

import { Actor } from 'apify';
import { log } from 'crawlee';
import { ArticleCrawler } from './src/article-crawler.js';
import { RssFetcher } from './src/rss-fetcher.js';
import { CONFIG } from './src/config.js';
import { buildFeedUrl } from './src/utils.js';

// Test configuration
const TEST_CONFIG = {
    queries: ['Tesla', 'AI technology', 'climate change'],
    maxArticlesPerQuery: 3,
    testTimeout: 60000 // 1 minute per test
};

/**
 * Test the enhanced text parsing functionality
 */
async function testTextParsing() {
    console.log('🧪 Starting text parsing and image extraction tests...\n');

    try {
        // Initialize Actor
        await Actor.init();
        log.setLevel(log.LEVELS.INFO);

        // Initialize components
        const rssFetcher = new RssFetcher();
        const articleCrawler = new ArticleCrawler();

        let totalArticlesTested = 0;
        let successfulExtractions = 0;
        let googleNewsResolutions = 0;
        let imageExtractions = 0;

        for (const query of TEST_CONFIG.queries) {
            console.log(`\n📰 Testing query: "${query}"`);
            console.log('=' .repeat(50));

            try {
                // Fetch RSS articles
                const articlesMap = await rssFetcher.fetchRssItems({
                    query: query,
                    region: 'US',
                    language: 'en',
                    maxItems: TEST_CONFIG.maxArticlesPerQuery
                });
                const articles = Array.from(articlesMap.values());
                console.log(`Found ${articles.length} articles for query: ${query}`);

                if (articles.length === 0) {
                    console.log('⚠️  No articles found for this query');
                    continue;
                }

                // Test article crawling
                await articleCrawler.crawlArticles(articles, query);

                // Analyze results from dataset
                const dataset = await Actor.openDataset();
                const results = await dataset.getData();
                const queryResults = results.items.filter(item => item.query === query);

                console.log(`\n📊 Results for "${query}":`);
                console.log(`- Articles processed: ${queryResults.length}`);

                queryResults.forEach((article, index) => {
                    totalArticlesTested++;
                    
                    console.log(`\n  Article ${index + 1}: ${article.title}`);
                    console.log(`  URL: ${article.url}`);
                    console.log(`  Source: ${article.source}`);
                    console.log(`  Text length: ${article.text.length} characters`);
                    console.log(`  Images found: ${article.images.length}`);
                    console.log(`  Quality score: ${article.contentQuality?.score || 'N/A'}`);
                    console.log(`  Quality level: ${article.contentQuality?.level || 'N/A'}`);

                    // Check if extraction was successful
                    if (article.extractionSuccess && article.text.length > 100) {
                        successfulExtractions++;
                        console.log('  ✅ Extraction successful');
                    } else {
                        console.log('  ❌ Extraction failed or poor quality');
                        if (article.contentQuality?.issues) {
                            console.log(`  Issues: ${article.contentQuality.issues.join(', ')}`);
                        }
                    }

                    // Check if Google News URL was resolved
                    if (article.url.includes('news.google.com')) {
                        console.log('  📰 Google News URL (not resolved)');
                    } else if (article.url !== article.originalGoogleUrl) {
                        googleNewsResolutions++;
                        console.log('  🔗 Google News URL resolved successfully');
                    }

                    // Check image extraction
                    if (article.images.length > 0) {
                        imageExtractions++;
                        console.log(`  🖼️  Images extracted: ${article.images.length}`);
                        
                        // Show first few images
                        article.images.slice(0, 2).forEach((img, imgIndex) => {
                            console.log(`    Image ${imgIndex + 1}: ${img.url}`);
                            console.log(`    Type: ${img.type}, Alt: "${img.alt}"`);
                        });
                    }

                    console.log('  ' + '-'.repeat(40));
                });

            } catch (error) {
                console.error(`❌ Error testing query "${query}":`, error.message);
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📈 TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total articles tested: ${totalArticlesTested}`);
        console.log(`Successful extractions: ${successfulExtractions} (${Math.round(successfulExtractions/totalArticlesTested*100)}%)`);
        console.log(`Google News URLs resolved: ${googleNewsResolutions}`);
        console.log(`Articles with images: ${imageExtractions} (${Math.round(imageExtractions/totalArticlesTested*100)}%)`);

        // Quality assessment
        const successRate = successfulExtractions / totalArticlesTested;
        if (successRate >= 0.8) {
            console.log('🎉 EXCELLENT: Text parsing is working very well!');
        } else if (successRate >= 0.6) {
            console.log('✅ GOOD: Text parsing is working well with some issues');
        } else if (successRate >= 0.4) {
            console.log('⚠️  FAIR: Text parsing needs improvement');
        } else {
            console.log('❌ POOR: Text parsing has significant issues');
        }

        console.log('\n🏁 Testing completed!');

    } catch (error) {
        console.error('💥 Test failed:', error);
        throw error;
    } finally {
        await Actor.exit();
    }
}

/**
 * Test specific Google News URL decoding
 */
async function testGoogleNewsDecoding() {
    console.log('\n🔍 Testing Google News URL decoding...');
    
    const { decodeGoogleNewsUrl } = await import('./src/utils.js');
    
    // Test URLs (these would be real Google News URLs in practice)
    const testUrls = [
        'https://news.google.com/articles/CBMicEFVX3lxTE5mMlVxTGp2OENTbnVCUjJfb21yMVlobkVLalBVQ3BhM21rTTFvdV9aZXBWR0RHUl9sWmxUX3dLMHFSTmtld09LbEtUVUhyR1VHeWJiNkpqeHBOZXkzdFdxdF9IbmdpeTJzT1RmZFhZVF8?oc=5',
        'https://news.google.com/articles/CBMipwFBVV95cUxPT3d4c2JsRkE4NmhZdW9LV1RlaUtSY285QVhyMWxjOVF4Y203MTE0NWllUDZmaVVxZWw5ZVY3TWc2Q0ZPU2JuamZuTjFCdWE2QjZybTNPNkp5cDlpTERwZWdwdTBFRDJNNDI5cVI1VnFtUGtZU1ZWU0MxVHA3SXBCcGI4QmN6RkpHYk5XbmNXRnd5U1FwTlBjWmhxb09ZdExxRGdqbHlxa9IBrAFBVV85cUxOdGZWbmhhMDBNM1LOTHF5ZHgzWTRET1l6dENzUzRWUVF0eUgzM0NXby1WS1d0NHlveWozeTZQeTlDR1A2QXRsc2J3T2JqQVgtUXhRelF5WW9WUm16YjMyTU1hWFdzZzFqX2d2NDBOdUlBdkQ2THBEQlNFUGdTRzM5cThGejdIOVM5UjkxMjhXWEpJaEhhd2FtQzJ3SXI3NjlkVkZjS2tMdmJuVXlq?oc=5'
    ];
    
    for (const url of testUrls) {
        console.log(`\nTesting URL: ${url.substring(0, 80)}...`);
        const decoded = decodeGoogleNewsUrl(url);
        
        if (decoded !== url) {
            console.log(`✅ Successfully decoded to: ${decoded}`);
        } else {
            console.log(`❌ Could not decode URL`);
        }
    }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
    testTextParsing()
        .then(() => testGoogleNewsDecoding())
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
}

export { testTextParsing, testGoogleNewsDecoding };
