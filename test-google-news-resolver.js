/**
 * Comprehensive test for the production-grade Google News URL resolver
 */

import { GoogleNewsResolver } from './src/google-news-resolver.js';
import { ResidentialProxyManager } from './src/residential-proxy-manager.js';
import { RssFetcher } from './src/rss-fetcher.js';
import { log } from 'crawlee';

// Test configuration
const TEST_CONFIG = {
    testQueries: ['Tesla', 'artificial intelligence', 'climate change'],
    maxUrlsPerQuery: 5,
    testTimeout: 60000
};

/**
 * Test the production-grade Google News URL resolver
 */
async function testGoogleNewsResolver() {
    console.log('🧪 Testing Production-Grade Google News URL Resolver...\n');
    
    let resolver = null;
    let rssFetcher = null;
    
    try {
        // Initialize components
        const proxyManager = new ResidentialProxyManager(); // No proxy config for testing
        resolver = new GoogleNewsResolver(proxyManager, {
            enablePersistence: false, // Don't persist during testing
            minRequestInterval: 2000, // 2 seconds between requests for testing
            maxCacheSize: 1000
        });
        
        rssFetcher = new RssFetcher();
        
        let totalTested = 0;
        let totalResolved = 0;
        let totalFailed = 0;
        const resolvedUrls = [];
        const failedUrls = [];
        
        // Test with real Google News URLs from RSS feeds
        for (const query of TEST_CONFIG.testQueries) {
            console.log(`\n📰 Testing query: "${query}"`);
            console.log('=' .repeat(50));
            
            try {
                // Fetch real Google News URLs
                const articlesMap = await rssFetcher.fetchRssItems({
                    query: query,
                    region: 'US',
                    language: 'en',
                    maxItems: TEST_CONFIG.maxUrlsPerQuery
                });
                
                const articles = Array.from(articlesMap.values());
                console.log(`Found ${articles.length} Google News URLs for "${query}"`);
                
                if (articles.length === 0) {
                    console.log('⚠️  No articles found for this query');
                    continue;
                }
                
                // Test URL resolution for each article
                for (const article of articles) {
                    totalTested++;
                    const googleNewsUrl = article.link;
                    
                    console.log(`\n  Testing URL ${totalTested}: ${googleNewsUrl.substring(0, 80)}...`);
                    
                    try {
                        const startTime = Date.now();
                        const resolvedUrl = await resolver.resolveUrl(googleNewsUrl);
                        const resolveTime = Date.now() - startTime;
                        
                        if (resolvedUrl !== googleNewsUrl && !resolvedUrl.includes('news.google.com')) {
                            totalResolved++;
                            resolvedUrls.push({
                                original: googleNewsUrl,
                                resolved: resolvedUrl,
                                title: article.title,
                                source: article.source,
                                resolveTime: resolveTime
                            });
                            
                            console.log(`  ✅ RESOLVED (${resolveTime}ms)`);
                            console.log(`     Original: ${googleNewsUrl.substring(0, 60)}...`);
                            console.log(`     Resolved: ${resolvedUrl}`);
                            console.log(`     Source: ${article.source}`);
                            
                        } else {
                            totalFailed++;
                            failedUrls.push({
                                original: googleNewsUrl,
                                title: article.title,
                                source: article.source,
                                resolveTime: resolveTime
                            });
                            
                            console.log(`  ❌ FAILED (${resolveTime}ms) - Could not resolve`);
                            console.log(`     URL: ${googleNewsUrl.substring(0, 60)}...`);
                        }
                        
                    } catch (error) {
                        totalFailed++;
                        failedUrls.push({
                            original: googleNewsUrl,
                            title: article.title,
                            source: article.source,
                            error: error.message
                        });
                        
                        console.log(`  ❌ ERROR: ${error.message}`);
                    }
                    
                    // Add delay between requests to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (error) {
                console.error(`❌ Error testing query "${query}":`, error.message);
            }
        }
        
        // Print comprehensive results
        console.log('\n' + '='.repeat(80));
        console.log('📊 GOOGLE NEWS URL RESOLVER TEST RESULTS');
        console.log('='.repeat(80));
        
        const successRate = totalTested > 0 ? (totalResolved / totalTested * 100).toFixed(1) : 0;
        
        console.log(`Total URLs tested: ${totalTested}`);
        console.log(`Successfully resolved: ${totalResolved} (${successRate}%)`);
        console.log(`Failed to resolve: ${totalFailed} (${(100 - successRate).toFixed(1)}%)`);
        
        // Show resolver statistics
        const resolverStats = resolver.getCacheStats();
        console.log('\n📈 RESOLVER STATISTICS:');
        console.log(`  Cache entries: ${resolverStats.totalEntries}`);
        console.log(`  Success rate: ${resolverStats.successRate}`);
        console.log(`  Total requests: ${resolverStats.requestCount}`);
        
        // Show sample successful resolutions
        if (resolvedUrls.length > 0) {
            console.log('\n✅ SAMPLE SUCCESSFUL RESOLUTIONS:');
            resolvedUrls.slice(0, 5).forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.source}`);
                console.log(`     Title: ${item.title.substring(0, 60)}...`);
                console.log(`     Resolved to: ${item.resolved}`);
                console.log(`     Time: ${item.resolveTime}ms`);
                console.log('');
            });
        }
        
        // Show sample failures for analysis
        if (failedUrls.length > 0) {
            console.log('\n❌ SAMPLE FAILED RESOLUTIONS:');
            failedUrls.slice(0, 3).forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.source}`);
                console.log(`     Title: ${item.title.substring(0, 60)}...`);
                console.log(`     URL: ${item.original.substring(0, 80)}...`);
                if (item.error) {
                    console.log(`     Error: ${item.error}`);
                }
                console.log('');
            });
        }
        
        // Assess results
        console.log('='.repeat(80));
        if (totalResolved === 0) {
            console.log('❌ CRITICAL: No URLs were resolved - resolver is not working');
            return false;
        } else if (successRate >= 70) {
            console.log(`🎉 EXCELLENT: ${successRate}% success rate - resolver is working very well!`);
            return true;
        } else if (successRate >= 40) {
            console.log(`✅ GOOD: ${successRate}% success rate - resolver is working with some limitations`);
            return true;
        } else if (successRate >= 20) {
            console.log(`⚠️  FAIR: ${successRate}% success rate - resolver needs improvement`);
            return false;
        } else {
            console.log(`❌ POOR: ${successRate}% success rate - resolver has significant issues`);
            return false;
        }
        
    } catch (error) {
        console.error('💥 Test failed:', error);
        return false;
    } finally {
        // Cleanup
        if (resolver) {
            await resolver.cleanup();
        }
    }
}

/**
 * Test specific URL patterns
 */
async function testSpecificUrlPatterns() {
    console.log('\n🎯 Testing specific URL patterns...\n');
    
    const resolver = new GoogleNewsResolver(null, {
        enablePersistence: false,
        minRequestInterval: 1000
    });
    
    // Test different URL patterns that we know exist
    const testPatterns = [
        {
            name: 'New AU_yqL format',
            pattern: 'AU_yqL',
            description: 'URLs starting with AU_yqL (requires batchexecute)'
        },
        {
            name: 'CBM format',
            pattern: 'CBM',
            description: 'URLs starting with CBM (legacy base64)'
        }
    ];
    
    try {
        // Get some real URLs to test patterns
        const rssFetcher = new RssFetcher();
        const articlesMap = await rssFetcher.fetchRssItems({
            query: 'technology',
            region: 'US',
            language: 'en',
            maxItems: 10
        });
        
        const articles = Array.from(articlesMap.values());
        
        for (const pattern of testPatterns) {
            console.log(`Testing ${pattern.name} (${pattern.description}):`);
            
            const matchingUrls = articles.filter(article => 
                article.link.includes(pattern.pattern)
            );
            
            if (matchingUrls.length === 0) {
                console.log(`  No URLs found with ${pattern.pattern} pattern`);
                continue;
            }
            
            console.log(`  Found ${matchingUrls.length} URLs with ${pattern.pattern} pattern`);
            
            // Test first URL of this pattern
            const testUrl = matchingUrls[0].link;
            console.log(`  Testing: ${testUrl.substring(0, 80)}...`);
            
            try {
                const resolved = await resolver.resolveUrl(testUrl);
                if (resolved !== testUrl && !resolved.includes('google.com')) {
                    console.log(`  ✅ Successfully resolved ${pattern.name} format`);
                    console.log(`     Resolved to: ${resolved}`);
                } else {
                    console.log(`  ❌ Failed to resolve ${pattern.name} format`);
                }
            } catch (error) {
                console.log(`  ❌ Error resolving ${pattern.name}: ${error.message}`);
            }
            
            console.log('');
        }
        
    } catch (error) {
        console.error('Error in pattern testing:', error.message);
    } finally {
        await resolver.cleanup();
    }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
    testGoogleNewsResolver()
        .then(success => {
            if (success) {
                return testSpecificUrlPatterns();
            }
        })
        .then(() => {
            console.log('\n🏁 Google News resolver testing completed!');
        })
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
}

export { testGoogleNewsResolver, testSpecificUrlPatterns };
