#!/usr/bin/env node
/**
 * Test script for Snoop Dogg query
 */

import { Actor } from 'apify';
import fs from 'fs';

async function testSnoopDogg() {
    console.log('🎤 Testing Google News Scraper with "Snoop Dogg"');
    console.log('================================================');
    
    try {
        // Create test input
        const testInput = {
            query: 'Snoop Dogg',
            maxItems: 5,
            region: 'US',
            language: 'en-US',
            dateRange: 'week'
        };
        
        console.log('Input configuration:');
        console.log(JSON.stringify(testInput, null, 2));
        console.log('');
        
        // Write input to INPUT.json
        fs.writeFileSync('./INPUT.json', JSON.stringify(testInput, null, 2));
        
        console.log('🚀 Starting scraper...');
        console.log('This may take 1-2 minutes to complete...');
        console.log('');
        
        // Import and run main.js
        await import('./src/main.js');
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

testSnoopDogg();
