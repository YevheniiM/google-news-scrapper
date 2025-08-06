/**
 * Optimized Content Extractor - COST EFFICIENT VERSION
 * Uses a single, fast extraction strategy instead of multiple sequential attempts
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { log } from 'crawlee';
import { cleanText } from './utils.js';
import * as cheerio from 'cheerio';
import { CONFIG } from './config.js';

/**
 * Optimized Content Extractor class - single strategy approach
 */
export class OptimizedContentExtractor {
    constructor() {
        // Pre-compiled selectors for better performance
        this.titleSelectors = [
            'h1',
            'h2',
            '[data-testid="headline"]',
            '.headline',
            '.title',
            'title'
        ];
        
        this.contentSelectors = [
            'article .article-body',
            'article .story-body',
            '.article-content',
            '.story-content',
            '[data-module="ArticleBody"]',
            '.RichTextStoryBody',
            'article',
            'main'
        ];
        
        this.authorSelectors = [
            '[rel="author"]',
            '.author',
            '.byline',
            '[data-testid="author"]',
            'meta[name="author"]'
        ];
        
        this.dateSelectors = [
            'time[datetime]',
            '[data-testid="timestamp"]',
            '.date',
            '.published',
            'meta[property="article:published_time"]'
        ];
    }

    /**
     * Fast content extraction using optimized single-pass strategy
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Extracted content
     */
    extractContent(html, url = '') {
        try {
            // COST OPTIMIZATION: Use single strategy based on config
            if (CONFIG.COST_OPTIMIZATION?.SINGLE_EXTRACTION_STRATEGY) {
                return this.fastReadabilityExtraction(html, url);
            }
            
            // Fallback to original multi-strategy approach if not optimized
            return this.multiStrategyExtraction(html, url);
            
        } catch (error) {
            log.debug('Optimized extraction failed:', error.message);
            return this.createEmptyResult();
        }
    }

    /**
     * Fast Readability-based extraction (most reliable single strategy)
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Extracted content
     */
    fastReadabilityExtraction(html, url) {
        try {
            // STEP 1: Pre-clean HTML before Readability processing
            const cleanedHtml = this.preCleanHtml(html);

            // Use Readability for main content (most reliable)
            const dom = new JSDOM(cleanedHtml, { url });
            const document = dom.window.document;
            const reader = new Readability(document);
            const article = reader.parse();

            if (!article) {
                // Quick fallback to Cheerio if Readability fails
                return this.quickCheerioExtraction(html, url);
            }

            // STEP 2: Post-process the extracted text to remove any remaining unwanted content
            const cleanedText = this.postProcessText(article.textContent || '');

            // Extract additional metadata with Cheerio (faster than DOM)
            const $ = cheerio.load(html);

            return {
                title: cleanText(article.title || this.extractTitle($)),
                text: cleanedText,
                content: article.content || '',
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(article.excerpt || this.extractDescription($)),
                images: this.extractImages($, url),
                tags: [],
                lang: document.documentElement.lang || 'en',
                success: !!(article.title && cleanedText.length > 300),
                extractionMethod: 'optimized-readability'
            };
        } catch (error) {
            log.debug('Fast Readability extraction failed:', error.message);
            return this.quickCheerioExtraction(html, url);
        }
    }

    /**
     * Quick Cheerio-based extraction (fallback)
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Extracted content
     */
    quickCheerioExtraction(html, url) {
        try {
            const $ = cheerio.load(html);
            
            // Quick content extraction using best selectors
            let content = '';
            for (const selector of this.contentSelectors) {
                const element = $(selector).first();
                if (element.length > 0) {
                    const text = element.text().trim();
                    if (text.length > content.length) {
                        content = text;
                    }
                }
            }
            
            // If no content found, use largest text block
            if (content.length < 300) {
                let largestText = '';
                $('p, div').each((_, element) => {
                    const text = $(element).text().trim();
                    if (text.length > largestText.length && text.length > 100) {
                        largestText = text;
                    }
                });
                content = largestText;
            }

            // Post-process the extracted text to remove unwanted content
            const cleanedText = this.postProcessText(content);

            return {
                title: cleanText(this.extractTitle($)),
                text: cleanedText,
                content: content,
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(this.extractDescription($)),
                images: this.extractImages($, url),
                tags: [],
                lang: $('html').attr('lang') || 'en',
                success: !!(cleanedText.length > 300),
                extractionMethod: 'optimized-cheerio'
            };
        } catch (error) {
            log.debug('Quick Cheerio extraction failed:', error.message);
            return this.createEmptyResult();
        }
    }

    /**
     * Multi-strategy extraction (original approach for non-optimized mode)
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Extracted content
     */
    multiStrategyExtraction(html, url) {
        // This would call the original AdvancedContentExtractor
        // For now, fallback to fast extraction
        return this.fastReadabilityExtraction(html, url);
    }

    /**
     * Extract title using optimized selectors
     * @param {object} $ - Cheerio instance
     * @returns {string} Title
     */
    extractTitle($) {
        for (const selector of this.titleSelectors) {
            const title = $(selector).first().text().trim();
            if (title && title.length > 5) {
                return title;
            }
        }
        return '';
    }

    /**
     * Extract author using optimized selectors
     * @param {object} $ - Cheerio instance
     * @returns {string} Author
     */
    extractAuthor($) {
        for (const selector of this.authorSelectors) {
            const author = $(selector).first().text().trim() || $(selector).attr('content');
            if (author && author.length > 2) {
                return author;
            }
        }
        return '';
    }

    /**
     * Extract publish date using optimized selectors
     * @param {object} $ - Cheerio instance
     * @returns {string|null} Publish date
     */
    extractPublishDate($) {
        for (const selector of this.dateSelectors) {
            const date = $(selector).attr('datetime') || $(selector).attr('content') || $(selector).text().trim();
            if (date) {
                return date;
            }
        }
        return null;
    }

    /**
     * Extract description using meta tags
     * @param {object} $ - Cheerio instance
     * @returns {string} Description
     */
    extractDescription($) {
        return $('meta[name="description"]').attr('content') || 
               $('meta[property="og:description"]').attr('content') || '';
    }

    /**
     * Extract images (simplified for cost optimization)
     * @param {object} $ - Cheerio instance
     * @param {string} url - Article URL
     * @returns {Array} Images array
     */
    extractImages($, url) {
        // COST OPTIMIZATION: Skip expensive image validation if configured
        if (CONFIG.IMAGE?.SKIP_VALIDATION) {
            const images = [];
            $('img').slice(0, 3).each((_, img) => { // Limit to first 3 images
                const src = $(img).attr('src');
                if (src && src.startsWith('http')) {
                    images.push({
                        url: src,
                        type: 'content',
                        alt: $(img).attr('alt') || '',
                        caption: '',
                        width: null,
                        height: null
                    });
                }
            });
            return images;
        }
        
        // Original image extraction logic would go here
        return [];
    }

    /**
     * Create empty result object
     * @returns {object} Empty result
     */
    createEmptyResult() {
        return {
            title: '',
            text: '',
            content: '',
            author: '',
            date: null,
            description: '',
            images: [],
            tags: [],
            lang: 'en',
            success: false,
            extractionMethod: 'failed'
        };
    }

    /**
     * Pre-clean HTML before passing to Readability
     * This removes JavaScript, ads, and other unwanted content that might pollute the text extraction
     * @param {string} html - Raw HTML content
     * @returns {string} Cleaned HTML
     */
    preCleanHtml(html) {
        // STEP 1: Remove JavaScript blocks from raw HTML before parsing
        html = this.removeJavaScriptFromHtml(html);

        const $ = cheerio.load(html);

        // STEP 2: Remove script and style tags
        $('script').remove();
        $('style').remove();
        $('noscript').remove();

        // STEP 3: Remove common unwanted elements
        const unwantedSelectors = [
            'nav', 'header', 'footer', 'aside',
            '.advertisement', '.ad', '.ads', '.social', '.share',
            '.comments', '.comment', '.related', '.sidebar',
            '.newsletter', '.subscribe', '.popup', '.modal',
            '.cookie', '.gdpr', '.consent', '.privacy',
            '[class*="ad-"]', '[id*="ad-"]', '[class*="ads-"]',
            '[class*="advertisement"]', '[class*="sponsored"]',
            '.tracking', '.analytics', '.gtm', '.facebook-pixel',
            // Sky Sports specific unwanted elements
            '.sdc-site-au', '.oddschecker', '.teads', '.mpu',
            '[data-module*="ad"]', '[data-module*="Ad"]',
            '[data-testid*="ad"]', '[data-testid*="Ad"]'
        ];

        unwantedSelectors.forEach(selector => {
            $(selector).remove();
        });

        // STEP 4: Remove elements with suspicious content patterns
        $('*').each((_, element) => {
            const $el = $(element);
            const text = $el.text();

            // Remove elements containing JavaScript-like patterns
            if (text.includes('document.currentScript') ||
                text.includes('window.') ||
                text.includes('var ') ||
                text.includes('function(') ||
                text.includes('oddscheckerJs') ||
                text.includes('sdc.checkConsent') ||
                text.includes('Enable Cookies') ||
                text.includes('This content is provided by')) {
                $el.remove();
            }
        });

        // STEP 5: Remove elements with suspicious attributes
        $('[onclick], [onload], [data-track], [data-analytics]').remove();

        return $.html();
    }

    /**
     * Remove JavaScript blocks from raw HTML string before parsing
     * @param {string} html - Raw HTML content
     * @returns {string} HTML with JavaScript removed
     */
    removeJavaScriptFromHtml(html) {
        // Remove script tags and their entire content
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // Remove inline JavaScript event handlers
        html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

        // Remove JavaScript: URLs
        html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '');

        // Remove style tags that might contain CSS with JavaScript
        html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

        return html;
    }

    /**
     * Post-process extracted text to remove any remaining unwanted content
     * @param {string} text - Raw extracted text
     * @returns {string} Cleaned text
     */
    postProcessText(text) {
        if (!text) return '';

        // STEP 1: Remove large JavaScript blocks first (most aggressive cleaning)
        let cleanedText = this.removeJavaScriptBlocks(text);

        // STEP 2: Remove specific JavaScript patterns
        cleanedText = this.removeJavaScriptPatterns(cleanedText);

        // STEP 3: Remove cookie consent and privacy messages
        cleanedText = this.removeCookieConsentMessages(cleanedText);

        // STEP 4: Remove ad-related boilerplate
        cleanedText = this.removeAdBoilerplate(cleanedText);

        // STEP 5: Final cleanup
        cleanedText = this.finalTextCleanup(cleanedText);

        return cleanText(cleanedText);
    }

    /**
     * Remove large JavaScript code blocks using advanced pattern matching
     * @param {string} text - Input text
     * @returns {string} Text with JavaScript blocks removed
     */
    removeJavaScriptBlocks(text) {
        // Remove document.currentScript blocks with nested objects (most common issue)
        // This handles complex nested JSON objects within the config
        text = text.replace(/document\.currentScript\.parentNode\.config\s*=\s*\{[\s\S]*?\}\s*(?=[A-Z]|$)/g, '');

        // Remove complete JavaScript function blocks
        text = text.replace(/var\s+\w+\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?\};\s*(?:\([^)]*\)\s*\(\s*\)\s*;)?/g, '');

        // Remove window object assignments with complex objects
        text = text.replace(/window\.\w+\s*=\s*\{[\s\S]*?\};\s*/g, '');

        // Remove document.write blocks with CSS
        text = text.replace(/document\.write\([^)]*\)[\s\S]*?(?=\s[A-Z]|$)/g, '');

        // Remove CSS class definitions that appear in text
        text = text.replace(/\.\w+\[data-\w+="[^"]*"\]\[data-\w+="[^"]*"\]\{[^}]*\}/g, '');

        return text;
    }

    /**
     * Remove specific JavaScript patterns and code snippets
     * @param {string} text - Input text
     * @returns {string} Text with JavaScript patterns removed
     */
    removeJavaScriptPatterns(text) {
        const jsPatterns = [
            // Remove any remaining document.currentScript patterns
            /document\.currentScript[^}]*\}/g,

            // Remove var declarations
            /var\s+\w+\s*=\s*[^;]*;/g,

            // Remove function calls and definitions
            /function\s*\([^)]*\)\s*\{[^}]*\}/g,
            /\(\s*function\s*\([^)]*\)\s*\{[^}]*\}\s*\)\s*\([^)]*\)\s*;/g,

            // Remove window object references
            /window\.\w+[^;]*;/g,

            // Remove specific tracking and analytics code
            /oddscheckerJs[^;]*;/g,
            /window\.sdc\.checkConsent[^;]*;/g,
            /window\.ocEnv[^;]*;/g,

            // Remove document method calls
            /document\.\w+\([^)]*\)/g,

            // Remove JavaScript object notation that appears in text
            /\{\s*"[^"]*":\s*"[^"]*"[^}]*\}/g,

            // Remove CSS injection patterns
            /\.[\w-]+\{[^}]*\}/g,
        ];

        jsPatterns.forEach(pattern => {
            text = text.replace(pattern, '');
        });

        return text;
    }

    /**
     * Remove cookie consent and privacy messages
     * @param {string} text - Input text
     * @returns {string} Text with cookie messages removed
     */
    removeCookieConsentMessages(text) {
        const cookiePatterns = [
            // YouTube cookie consent
            /This content is provided by YouTube, which may be using cookies and other technologies\.[^.]*\./g,
            /To show you this content, we need your permission to use cookies\.[^.]*\./g,
            /You can use the buttons below to amend your preferences to enable YouTube cookies[^.]*\./g,
            /You can change your settings at any time via the Privacy Options\.[^.]*\./g,
            /Unfortunately we have been unable to verify if you have consented to YouTube cookies\.[^.]*\./g,
            /To view this content you can use the button below to allow YouTube cookies for this session only\./g,
            /Enable Cookies Allow Cookies Once/g,

            // Twitter cookie consent
            /This content is provided by Twitter, which may be using cookies and other technologies\.[^.]*\./g,
            /Unfortunately we have been unable to verify if you have consented to Twitter cookies\.[^.]*\./g,
            /To view this content you can use the button below to allow Twitter cookies for this session only\./g,

            // Generic cookie consent patterns
            /This content is provided by [^,]*, which may be using cookies[^.]*\./g,
            /Unfortunately we have been unable to verify if you have consented to [^.]* cookies[^.]*\./g,
        ];

        cookiePatterns.forEach(pattern => {
            text = text.replace(pattern, '');
        });

        return text;
    }

    /**
     * Remove ad-related boilerplate text
     * @param {string} text - Input text
     * @returns {string} Text with ad boilerplate removed
     */
    removeAdBoilerplate(text) {
        const boilerplatePatterns = [
            // Sky Sports specific boilerplate
            /Please use Chrome browser for a more accessible video player/g,
            /Got Sky\? Watch your EFL team on the Sky Sports app/g,
            /Not got Sky\? Stream your EFL team with no contract/g,
            /Watch your EFL team at least \d+ times in \d+\/\d+ with Sky Sports\+/g,
            /Watch EVERY SINGLE Championship fixture[^.]*\./g,
            /SUPER 6 RETURNS[^.]*\./g,
            /Around Sky Other Sports[^.]*$/g,
            /Upgrade to Sky Sports[^.]*$/g,
            /Get instant access to Sky Sports with NOW/g,

            // Betting and odds related
            /ACCAFREEZE WITH SKY BET[^.]*\./g,
            /AccaFreeze lets you lock in one winning leg[^.]*\./g,

            // Generic ad content
            /Ad content \|[^|]*\|/g,
            /All you need to know - Streaming[^|]*\|/g,
            /Download the Sky Sports App \| Get Sky Sports/g,
        ];

        boilerplatePatterns.forEach(pattern => {
            text = text.replace(pattern, '');
        });

        return text;
    }

    /**
     * Final text cleanup - whitespace, formatting, and remaining artifacts
     * @param {string} text - Input text
     * @returns {string} Final cleaned text
     */
    finalTextCleanup(text) {
        // Remove remaining JavaScript-like artifacts
        text = text.replace(/\s*\{\s*"[^"]*":\s*"[^"]*"[^}]*\}\s*/g, ' ');

        // Remove CSS-like patterns that might remain
        text = text.replace(/[.#][\w-]+\s*\{[^}]*\}\s*/g, '');

        // Remove standalone numbers that might be artifacts
        text = text.replace(/^\s*\d+\s*$/gm, '');

        // Clean up whitespace and formatting
        text = text
            .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
            .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
            .replace(/\s*\n\s*/g, '\n') // Clean up newlines
            .trim();

        // Remove empty lines and lines with only punctuation
        text = text
            .split('\n')
            .filter(line => line.trim().length > 0 && !/^[^\w]*$/.test(line.trim()))
            .join('\n');

        return text;
    }
}
