/**
 * Advanced Content Extractor using multiple proven libraries
 * This replaces the failing content extraction with working solutions
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { log } from 'crawlee';
import { cleanText } from './utils.js';
import * as cheerio from 'cheerio';

/**
 * Advanced Content Extractor class with multiple proven extraction strategies
 */
export class AdvancedContentExtractor {
    constructor() {
        this.extractionStrategies = [
            this.extractWithReadability.bind(this),
            this.extractWithCustomSelectors.bind(this),
            this.extractWithTextDensity.bind(this),
        ];
    }

    /**
     * Extract content using Mozilla Readability (most reliable)
     * @param {string} html - HTML content
     * @param {string} url - Article URL for context
     * @returns {object} Extracted content
     */
    extractWithReadability(html, url = '') {
        try {
            log.debug('Attempting extraction with Mozilla Readability');
            
            // Create a JSDOM instance
            const dom = new JSDOM(html, { url });
            const document = dom.window.document;
            
            // Use Readability to extract content
            const reader = new Readability(document, {
                debug: false,
                maxElemsToParse: 0, // No limit
                nbTopCandidates: 5,
                charThreshold: 500,
                classesToPreserve: ['caption', 'credit']
            });
            
            const article = reader.parse();
            
            if (!article) {
                log.debug('Readability failed to parse article');
                return { success: false };
            }
            
            // Extract additional metadata
            const $ = cheerio.load(html);
            const author = this.extractAuthor($);
            const publishDate = this.extractPublishDate($);
            const images = this.extractImagesFromContent(article.content, url);
            
            return {
                title: cleanText(article.title || ''),
                text: cleanText(article.textContent || ''),
                content: article.content || '', // HTML content for image extraction
                author: author,
                date: publishDate,
                description: cleanText(article.excerpt || ''),
                images: images,
                tags: [],
                lang: document.documentElement.lang || 'unknown',
                success: !!(article.title && article.textContent && article.textContent.length > 300),
                extractionMethod: 'readability'
            };
        } catch (error) {
            log.debug('Readability extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract content using custom selectors for news sites
     * @param {string} html - HTML content
     * @param {string} url - Article URL for context
     * @returns {object} Extracted content
     */
    extractWithCustomSelectors(html, url = '') {
        try {
            log.debug('Attempting extraction with custom selectors');
            
            const $ = cheerio.load(html);
            
            // Remove unwanted elements first
            this.removeUnwantedElements($);
            
            // Extract title
            const title = this.extractTitle($);
            
            // Extract main content using news-specific selectors
            const contentSelectors = [
                'article .article-body',
                'article .story-body',
                'article .post-content',
                'article .entry-content',
                '.article-content',
                '.story-content',
                '.post-body',
                '.content-body',
                '[data-module="ArticleBody"]',
                '.RichTextStoryBody',
                '.ArticleBody-articleBody',
                '.story-body__inner',
                '.article-wrap .article-body'
            ];
            
            let mainContent = '';
            let contentElement = null;
            
            for (const selector of contentSelectors) {
                const element = $(selector).first();
                if (element.length > 0) {
                    const text = element.text().trim();
                    if (text.length > mainContent.length) {
                        mainContent = text;
                        contentElement = element;
                    }
                }
            }
            
            // If no specific content found, try broader selectors
            if (mainContent.length < 300) {
                const broadSelectors = ['article', '.main-content', '#content', '.content'];
                for (const selector of broadSelectors) {
                    const element = $(selector).first();
                    if (element.length > 0) {
                        const text = element.text().trim();
                        if (text.length > mainContent.length) {
                            mainContent = text;
                            contentElement = element;
                        }
                    }
                }
            }
            
            // Extract images from content
            const images = contentElement ? this.extractImagesFromElement(contentElement, $, url) : [];
            
            // Extract metadata
            const author = this.extractAuthor($);
            const publishDate = this.extractPublishDate($);
            const description = this.extractDescription($);
            
            return {
                title: cleanText(title),
                text: cleanText(mainContent),
                content: contentElement ? contentElement.html() : '',
                author: author,
                date: publishDate,
                description: description,
                images: images,
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(title && mainContent.length > 300),
                extractionMethod: 'custom-selectors'
            };
        } catch (error) {
            log.debug('Custom selectors extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract content using text density analysis
     * @param {string} html - HTML content
     * @param {string} url - Article URL for context
     * @returns {object} Extracted content
     */
    extractWithTextDensity(html, url = '') {
        try {
            log.debug('Attempting extraction with text density analysis');
            
            const $ = cheerio.load(html);
            
            // Remove unwanted elements
            this.removeUnwantedElements($);
            
            // Find the element with highest text density
            let bestElement = null;
            let bestScore = 0;
            
            $('div, article, section, main').each((_, element) => {
                const $el = $(element);
                const text = $el.text().trim();
                const html = $el.html();
                
                if (text.length < 100) return; // Skip short content
                
                // Calculate text density (text length / HTML length)
                const density = text.length / (html ? html.length : 1);
                
                // Bonus for paragraph count
                const paragraphs = $el.find('p').length;
                const paragraphBonus = Math.min(paragraphs * 0.1, 1);
                
                const score = density + paragraphBonus;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestElement = $el;
                }
            });
            
            if (!bestElement || bestElement.text().trim().length < 300) {
                return { success: false };
            }
            
            const title = this.extractTitle($);
            const mainContent = bestElement.text().trim();
            const images = this.extractImagesFromElement(bestElement, $, url);
            const author = this.extractAuthor($);
            const publishDate = this.extractPublishDate($);
            const description = this.extractDescription($);
            
            return {
                title: cleanText(title),
                text: cleanText(mainContent),
                content: bestElement.html(),
                author: author,
                date: publishDate,
                description: description,
                images: images,
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(title && mainContent.length > 300),
                extractionMethod: 'text-density'
            };
        } catch (error) {
            log.debug('Text density extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Remove unwanted elements from the DOM
     * @param {object} $ - Cheerio instance
     */
    removeUnwantedElements($) {
        const unwantedSelectors = [
            'script', 'style', 'nav', 'header', 'footer', 'aside',
            '.advertisement', '.ad', '.ads', '.social', '.share',
            '.comments', '.comment', '.related', '.sidebar',
            '.newsletter', '.subscribe', '.popup', '.modal',
            '.cookie', '.gdpr', '[class*="ad-"]', '[id*="ad-"]'
        ];
        
        unwantedSelectors.forEach(selector => {
            $(selector).remove();
        });
    }

    /**
     * Extract title from various sources
     * @param {object} $ - Cheerio instance
     * @returns {string} Title
     */
    extractTitle($) {
        const titleSelectors = [
            'h1.headline',
            'h1.title',
            'h1.article-title',
            'h1.post-title',
            'h1.entry-title',
            'h1',
            '.headline',
            '.article-headline',
            'title'
        ];
        
        for (const selector of titleSelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                const text = element.text().trim();
                if (text.length > 0 && text.length < 200) {
                    return text;
                }
            }
        }
        
        // Fallback to meta tags
        return $('meta[property="og:title"]').attr('content') ||
               $('meta[name="twitter:title"]').attr('content') ||
               $('title').text() || '';
    }

    /**
     * Extract author information
     * @param {object} $ - Cheerio instance
     * @returns {string} Author name
     */
    extractAuthor($) {
        const authorSelectors = [
            '.author-name',
            '.byline-author',
            '.article-author',
            '.post-author',
            '[rel="author"]',
            '.author',
            '.byline'
        ];
        
        for (const selector of authorSelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                const text = element.text().trim();
                if (text.length > 0 && text.length < 100) {
                    return text;
                }
            }
        }
        
        // Fallback to meta tags
        return $('meta[name="author"]').attr('content') ||
               $('meta[property="article:author"]').attr('content') || '';
    }

    /**
     * Extract publish date
     * @param {object} $ - Cheerio instance
     * @returns {string|null} ISO date string
     */
    extractPublishDate($) {
        const dateSelectors = [
            'time[datetime]',
            '.publish-date',
            '.article-date',
            '.post-date',
            '.date'
        ];
        
        for (const selector of dateSelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                const dateValue = element.attr('datetime') || element.text().trim();
                if (dateValue) {
                    const parsedDate = new Date(dateValue);
                    if (!isNaN(parsedDate.getTime())) {
                        return parsedDate.toISOString();
                    }
                }
            }
        }
        
        // Fallback to meta tags
        const metaDate = $('meta[property="article:published_time"]').attr('content') ||
                        $('meta[name="publish-date"]').attr('content');
        
        if (metaDate) {
            const parsedDate = new Date(metaDate);
            if (!isNaN(parsedDate.getTime())) {
                return parsedDate.toISOString();
            }
        }
        
        return null;
    }

    /**
     * Extract description
     * @param {object} $ - Cheerio instance
     * @returns {string} Description
     */
    extractDescription($) {
        return $('meta[name="description"]').attr('content') ||
               $('meta[property="og:description"]').attr('content') ||
               $('meta[name="twitter:description"]').attr('content') || '';
    }

    /**
     * Extract images from content HTML
     * @param {string} contentHtml - HTML content
     * @param {string} baseUrl - Base URL for resolving relative URLs
     * @returns {Array} Array of image objects
     */
    extractImagesFromContent(contentHtml, baseUrl) {
        if (!contentHtml) return [];
        
        const $ = cheerio.load(contentHtml);
        return this.extractImagesFromElement($('body'), $, baseUrl);
    }

    /**
     * Extract images from a specific element
     * @param {object} element - Cheerio element
     * @param {object} $ - Cheerio instance
     * @param {string} baseUrl - Base URL for resolving relative URLs
     * @returns {Array} Array of image objects
     */
    extractImagesFromElement(element, $, baseUrl) {
        const images = [];
        
        element.find('img').each((_, img) => {
            const $img = $(img);
            const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
            
            if (!src) return;
            
            try {
                // Resolve relative URLs
                let absoluteUrl;
                if (src.startsWith('http')) {
                    absoluteUrl = src;
                } else if (baseUrl) {
                    absoluteUrl = new URL(src, baseUrl).href;
                } else {
                    return; // Skip relative URLs without base
                }
                
                // Skip tiny images and data URLs
                if (absoluteUrl.startsWith('data:') || 
                    absoluteUrl.includes('1x1') || 
                    absoluteUrl.includes('pixel')) {
                    return;
                }
                
                const alt = $img.attr('alt') || '';
                const caption = $img.closest('figure').find('figcaption').text().trim() ||
                               $img.parent().find('.caption').text().trim() || '';
                
                images.push({
                    url: absoluteUrl,
                    alt: alt,
                    caption: caption,
                    type: 'content'
                });
            } catch (error) {
                log.debug(`Failed to process image: ${src}`, error.message);
            }
        });
        
        return images;
    }

    /**
     * Extract content with fallback strategies
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Best extracted content
     */
    extractContent(html, url = '') {
        let bestResult = { success: false };
        let bestScore = 0;
        
        // Try each extraction strategy
        for (const strategy of this.extractionStrategies) {
            try {
                const result = strategy(html, url);
                
                if (result.success) {
                    // Score the result based on content quality
                    const score = this.scoreExtraction(result);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestResult = result;
                    }
                }
            } catch (error) {
                log.debug('Extraction strategy failed:', error.message);
            }
        }
        
        return bestResult;
    }

    /**
     * Score extraction result quality
     * @param {object} result - Extraction result
     * @returns {number} Quality score
     */
    scoreExtraction(result) {
        let score = 0;
        
        // Text content quality
        if (result.text && result.text.length > 300) {
            score += 40;
            if (result.text.length > 1000) score += 20;
            if (result.text.length > 2000) score += 10;
        }
        
        // Title quality
        if (result.title && result.title.length > 10) {
            score += 15;
        }
        
        // Author and date
        if (result.author) score += 5;
        if (result.date) score += 5;
        
        // Images
        if (result.images && result.images.length > 0) {
            score += 10;
            if (result.images.length > 2) score += 5;
        }
        
        // Description
        if (result.description && result.description.length > 50) {
            score += 5;
        }
        
        return score;
    }
}
