/**
 * Test script to scrape a direct article URL (not Google News redirect)
 * This will help us verify that the content extraction is working properly
 */

import { Actor } from 'apify';
import { ArticleCrawler } from './src/article-crawler.js';

async function testDirectArticle() {
    await Actor.init();
    
    try {
        console.log('Testing direct article scraping...');
        
        // Test with a direct Reuters article URL (no consent pages)
        const testArticles = [
            {
                title: "Tesla Test Article",
                link: "https://www.reuters.com/business/autos-transportation/",
                pubDate: new Date().toISOString(),
                source: "Reuters",
                description: "Test article for content extraction"
            }
        ];
        
        const crawler = new ArticleCrawler(null, true); // Use browser mode
        await crawler.crawlArticles(testArticles, "Tesla");
        
        console.log('✅ Direct article test completed');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await Actor.exit();
    }
}

testDirectArticle();
