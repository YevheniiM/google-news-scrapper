/**
 * Test direct content extraction from news articles
 * This bypasses Google News URL resolution to test the core extraction functionality
 */

import { AdvancedContentExtractor } from './src/advanced-content-extractor.js';
import { gotScraping } from 'got-scraping';
import { log } from 'crawlee';

// Test URLs from major news sources
const TEST_URLS = [
    'https://www.bbc.com/news/technology',
    'https://www.reuters.com/technology/',
    'https://techcrunch.com/',
    'https://www.theverge.com/',
    'https://arstechnica.com/'
];

async function testDirectExtraction() {
    console.log('🧪 Testing direct content extraction...\n');
    
    const extractor = new AdvancedContentExtractor();
    let successCount = 0;
    let totalTested = 0;
    
    for (const url of TEST_URLS) {
        try {
            console.log(`\n📰 Testing: ${url}`);
            console.log('-'.repeat(60));
            
            // Fetch the page
            const response = await gotScraping({
                url: url,
                timeout: { request: 30000 },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                }
            });
            
            console.log(`✅ Successfully fetched page (${response.body.length} bytes)`);
            
            // Extract content
            const extractedContent = extractor.extractContent(response.body, url);
            totalTested++;
            
            if (extractedContent.success) {
                successCount++;
                console.log(`✅ Content extraction successful!`);
                console.log(`   Method: ${extractedContent.extractionMethod}`);
                console.log(`   Title: ${extractedContent.title.substring(0, 80)}...`);
                console.log(`   Text length: ${extractedContent.text.length} characters`);
                console.log(`   Images found: ${extractedContent.images.length}`);
                console.log(`   Author: ${extractedContent.author || 'Not found'}`);
                console.log(`   Language: ${extractedContent.lang}`);
                
                // Show first 200 characters of text
                if (extractedContent.text.length > 0) {
                    console.log(`   Text preview: "${extractedContent.text.substring(0, 200)}..."`);
                }
                
                // Show first few images
                if (extractedContent.images.length > 0) {
                    console.log(`   Sample images:`);
                    extractedContent.images.slice(0, 3).forEach((img, i) => {
                        console.log(`     ${i + 1}. ${img.url}`);
                        console.log(`        Alt: "${img.alt}"`);
                        console.log(`        Type: ${img.type}`);
                    });
                }
                
                // Test our quality criteria
                const meetsTextCriteria = extractedContent.text.length >= 300;
                const meetsImageCriteria = extractedContent.images.length > 0;
                const meetsAllCriteria = meetsTextCriteria && meetsImageCriteria;
                
                console.log(`\n   📊 Quality Check:`);
                console.log(`      Text ≥300 chars: ${meetsTextCriteria ? '✅' : '❌'} (${extractedContent.text.length})`);
                console.log(`      Has images: ${meetsImageCriteria ? '✅' : '❌'} (${extractedContent.images.length})`);
                console.log(`      Meets all criteria: ${meetsAllCriteria ? '✅ PASS' : '❌ FAIL'}`);
                
            } else {
                console.log(`❌ Content extraction failed`);
            }
            
        } catch (error) {
            console.log(`❌ Error testing ${url}: ${error.message}`);
            totalTested++;
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 DIRECT EXTRACTION TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total URLs tested: ${totalTested}`);
    console.log(`Successful extractions: ${successCount}`);
    console.log(`Success rate: ${totalTested > 0 ? Math.round(successCount/totalTested*100) : 0}%`);
    
    if (successCount > 0) {
        console.log('✅ Content extraction is working! The issue is likely with Google News URL resolution.');
    } else {
        console.log('❌ Content extraction is not working properly.');
    }
}

// Test a specific article URL
async function testSpecificArticle() {
    console.log('\n🎯 Testing specific article extraction...\n');
    
    // Use a known good article URL
    const articleUrl = 'https://www.bbc.com/news/articles/c4ng5g5g5g5g'; // This would be a real BBC article
    
    try {
        const extractor = new AdvancedContentExtractor();
        
        console.log(`Testing article: ${articleUrl}`);
        
        const response = await gotScraping({
            url: articleUrl,
            timeout: { request: 30000 },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            }
        });
        
        const extractedContent = extractor.extractContent(response.body, articleUrl);
        
        if (extractedContent.success) {
            console.log('✅ Article extraction successful!');
            console.log(`Title: ${extractedContent.title}`);
            console.log(`Text: ${extractedContent.text.substring(0, 500)}...`);
            console.log(`Images: ${extractedContent.images.length}`);
        } else {
            console.log('❌ Article extraction failed');
        }
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
    testDirectExtraction()
        .then(() => {
            console.log('\n🏁 Testing completed!');
        })
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
}

export { testDirectExtraction, testSpecificArticle };
