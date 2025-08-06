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
            // Use Readability for main content (most reliable)
            const dom = new JSDOM(html, { url });
            const document = dom.window.document;
            const reader = new Readability(document);
            const article = reader.parse();

            if (!article) {
                // Quick fallback to Cheerio if Readability fails
                return this.quickCheerioExtraction(html, url);
            }

            // Extract additional metadata with Cheerio (faster than DOM)
            const $ = cheerio.load(html);
            
            return {
                title: cleanText(article.title || this.extractTitle($)),
                text: cleanText(article.textContent || ''),
                content: article.content || '',
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(article.excerpt || this.extractDescription($)),
                images: this.extractImages($, url),
                tags: [],
                lang: document.documentElement.lang || 'en',
                success: !!(article.title && article.textContent && article.textContent.length > 300),
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

            return {
                title: cleanText(this.extractTitle($)),
                text: cleanText(content),
                content: content,
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(this.extractDescription($)),
                images: this.extractImages($, url),
                tags: [],
                lang: $('html').attr('lang') || 'en',
                success: !!(content.length > 300),
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
}
