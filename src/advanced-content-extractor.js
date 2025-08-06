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

            // STEP 1: Pre-clean HTML before Readability processing
            const cleanedHtml = this.preCleanHtml(html);

            // Create a JSDOM instance with cleaned HTML
            const dom = new JSDOM(cleanedHtml, { url });
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

            // STEP 2: Post-process the extracted text to remove any remaining unwanted content
            const cleanedText = this.postProcessText(article.textContent || '');

            // Extract additional metadata from original HTML
            const $ = cheerio.load(html);
            const author = this.extractAuthor($);
            const publishDate = this.extractPublishDate($);
            const images = this.extractAllImages($, null, url);

            return {
                title: cleanText(article.title || ''),
                text: cleanedText,
                content: article.content || '', // HTML content for image extraction
                author: author,
                date: publishDate,
                description: cleanText(article.excerpt || ''),
                images: images,
                tags: [],
                lang: document.documentElement.lang || 'unknown',
                success: !!(article.title && cleanedText.length > 300),
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

            // Pre-clean HTML first
            const cleanedHtml = this.preCleanHtml(html);
            const $ = cheerio.load(cleanedHtml);

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

            // Post-process the extracted text
            const cleanedText = this.postProcessText(mainContent);

            // Extract images from original HTML (not cleaned) for better image detection
            const $original = cheerio.load(html);
            const images = this.extractAllImages($original, null, url);

            // Extract metadata from original HTML
            const author = this.extractAuthor($original);
            const publishDate = this.extractPublishDate($original);
            const description = this.extractDescription($original);

            return {
                title: cleanText(title),
                text: cleanedText,
                content: contentElement ? contentElement.html() : '',
                author: author,
                date: publishDate,
                description: description,
                images: images,
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(title && cleanedText.length > 300),
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

            // Pre-clean HTML first
            const cleanedHtml = this.preCleanHtml(html);
            const $ = cheerio.load(cleanedHtml);

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

            // Post-process the extracted text
            const cleanedText = this.postProcessText(mainContent);

            // Extract metadata from original HTML for better accuracy
            const $original = cheerio.load(html);
            const images = this.extractAllImages($original, null, url);
            const author = this.extractAuthor($original);
            const publishDate = this.extractPublishDate($original);
            const description = this.extractDescription($original);

            return {
                title: cleanText(title),
                text: cleanedText,
                content: bestElement.html(),
                author: author,
                date: publishDate,
                description: description,
                images: images,
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(title && cleanedText.length > 300),
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
    /**
     * Pre-clean HTML before passing to Readability
     * This removes JavaScript, ads, and other unwanted content that might pollute the text extraction
     * @param {string} html - Raw HTML content
     * @returns {string} Cleaned HTML
     */
    preCleanHtml(html) {
        const $ = cheerio.load(html);

        // Remove script tags and their content (this is the main culprit)
        $('script').remove();

        // Remove style tags and their content
        $('style').remove();

        // Remove common unwanted elements
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
            '[data-module*="ad"]', '[data-module*="Ad"]'
        ];

        unwantedSelectors.forEach(selector => {
            $(selector).remove();
        });

        // Remove elements with suspicious content patterns
        $('*').each((_, element) => {
            const $el = $(element);
            const text = $el.text();

            // Remove elements containing JavaScript-like patterns
            if (text.includes('document.currentScript') ||
                text.includes('window.') ||
                text.includes('var ') ||
                text.includes('function(') ||
                text.includes('oddscheckerJs') ||
                text.includes('sdc.checkConsent')) {
                $el.remove();
            }
        });

        return $.html();
    }

    /**
     * Post-process extracted text to remove any remaining unwanted content
     * @param {string} text - Raw extracted text
     * @returns {string} Cleaned text
     */
    postProcessText(text) {
        if (!text) return '';

        // Remove JavaScript code patterns that might have slipped through
        const jsPatterns = [
            // Remove document.currentScript patterns
            /document\.currentScript\.parentNode\.config\s*=\s*\{[^}]*\}[^}]*\}/g,

            // Remove var declarations and function definitions
            /var\s+\w+\s*=\s*function\s*\([^)]*\)\s*\{[^}]*\}/g,
            /function\s*\([^)]*\)\s*\{[^}]*\}/g,

            // Remove window object assignments
            /window\.\w+\s*=\s*\{[^}]*\}/g,

            // Remove oddschecker and analytics code
            /oddscheckerJs[^;]*;/g,
            /window\.sdc\.checkConsent[^;]*;/g,
            /window\.ocEnv\s*=\s*\{[^}]*\}/g,

            // Remove document.write calls
            /document\.write\([^)]*\)/g,

            // Remove CSS-in-JS patterns
            /\.sdc-[^{]*\{[^}]*\}/g,

            // Remove cookie consent messages
            /This content is provided by [^.]*\. To show you this content[^.]*\./g,
            /You can use the buttons below to amend your preferences[^.]*\./g,
            /Enable Cookies Allow Cookies Once/g,
            /Unfortunately we have been unable to verify if you have consented[^.]*\./g,
        ];

        let cleanedText = text;
        jsPatterns.forEach(pattern => {
            cleanedText = cleanedText.replace(pattern, '');
        });

        // Remove common boilerplate patterns
        const boilerplatePatterns = [
            /Please use Chrome browser for a more accessible video player/g,
            /Got Sky\? Watch your EFL team on the Sky Sports app/g,
            /Not got Sky\? Stream your EFL team with no contract/g,
            /Watch EVERY SINGLE Championship fixture[^.]*\./g,
            /SUPER 6 RETURNS[^.]*\./g,
            /Around Sky Other Sports[^.]*$/g,
            /Upgrade to Sky Sports[^.]*$/g,
        ];

        boilerplatePatterns.forEach(pattern => {
            cleanedText = cleanedText.replace(pattern, '');
        });

        // Clean up whitespace and formatting
        cleanedText = cleanedText
            .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
            .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
            .trim();

        return cleanText(cleanedText);
    }

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
     * Extract all images from both content and meta tags
     * @param {object} $ - Cheerio instance
     * @param {object} contentElement - Content element (optional)
     * @param {string} baseUrl - Base URL for resolving relative URLs
     * @returns {Array} Array of image objects
     */
    extractAllImages($, contentElement = null, baseUrl) {
        const images = new Map(); // Use Map to avoid duplicates

        // Helper function to add image with metadata
        const addImage = (src, type, alt = '', caption = '') => {
            if (!src) return;

            try {
                // Convert relative URLs to absolute
                let absoluteUrl;
                if (src.startsWith('http')) {
                    absoluteUrl = src;
                } else if (baseUrl) {
                    absoluteUrl = new URL(src, baseUrl).href;
                } else {
                    return; // Skip relative URLs if no base URL provided
                }

                // Skip data URLs and very small images (likely icons)
                if (absoluteUrl.startsWith('data:') ||
                    absoluteUrl.includes('1x1') ||
                    absoluteUrl.includes('pixel') ||
                    absoluteUrl.includes('spacer') ||
                    absoluteUrl.includes('logo') ||
                    absoluteUrl.includes('icon')) {
                    return;
                }

                // Create image object with metadata
                const imageObj = {
                    url: absoluteUrl,
                    type: type,
                    alt: alt || '',
                    caption: caption || '',
                    width: null,
                    height: null
                };

                images.set(absoluteUrl, imageObj);
            } catch (error) {
                // Ignore URL parsing errors
            }
        };

        // 1. Extract meta tag images (often the main article images)
        // OpenGraph images
        $('meta[property="og:image"], meta[property="og:image:url"]').each((_, element) => {
            const content = $(element).attr('content');
            if (content) {
                addImage(content, 'featured-og');
            }
        });

        // Twitter card images
        $('meta[name="twitter:image"], meta[name="twitter:image:src"]').each((_, element) => {
            const content = $(element).attr('content');
            if (content) {
                addImage(content, 'featured-twitter');
            }
        });

        // Schema.org images
        $('meta[itemprop="image"]').each((_, element) => {
            const content = $(element).attr('content');
            if (content) {
                addImage(content, 'featured-schema');
            }
        });

        // 2. Extract images from content element (if provided)
        if (contentElement) {
            contentElement.find('img').each((_, img) => {
                const $img = $(img);
                const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
                const alt = $img.attr('alt') || '';
                const caption = $img.closest('figure').find('figcaption').text().trim() ||
                               $img.parent().find('.caption').text().trim() || '';

                if (src) {
                    addImage(src, 'content', alt, caption);
                }
            });
        }

        // 3. Extract images from common article selectors (fallback)
        const articleSelectors = [
            'article img',
            '.article img',
            '.content img',
            '.post img',
            '.entry-content img',
            '.story-body img',
            '.article-body img',
            '.post-content img',
            '.ArticleBody img',
            '.ArticleBody-articleBody img',
            '[data-module="ArticleBody"] img',
            'main img'
        ];

        for (const selector of articleSelectors) {
            $(selector).each((_, img) => {
                const $img = $(img);
                const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
                const alt = $img.attr('alt') || '';
                const caption = $img.closest('figure').find('figcaption').text().trim() ||
                               $img.parent().find('.caption').text().trim() || '';

                if (src) {
                    addImage(src, 'content', alt, caption);
                }
            });
        }

        // 4. Extract from picture elements
        $('picture').each((_, picture) => {
            const $picture = $(picture);
            const img = $picture.find('img').first();
            if (img.length > 0) {
                const src = img.attr('src') || img.attr('data-src');
                const alt = img.attr('alt') || '';
                if (src) {
                    addImage(src, 'content', alt);
                }
            }
        });

        return Array.from(images.values());
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
