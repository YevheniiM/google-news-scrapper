/**
 * Unified Content Extractor - Combines best strategies from all extractors
 * Optimized for production use with cost-efficient extraction methods
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { log } from 'crawlee';
import { cleanText, cleanHtmlContent, extractImages, validateImageUrl } from './utils.js';
import { CONFIG } from './config.js';
import * as cheerio from 'cheerio';

/**
 * Unified Content Extractor class with optimized extraction strategies
 */
export class ContentExtractor {
    constructor() {
        // Prioritized extraction strategies - most reliable first
        this.extractionStrategies = CONFIG.COST_OPTIMIZATION?.SINGLE_EXTRACTION_STRATEGY 
            ? [this.extractWithReadability.bind(this)]
            : [
                this.extractWithReadability.bind(this),
                this.extractWithCustomSelectors.bind(this),
                this.extractWithMetaTags.bind(this),
                this.extractWithHeuristics.bind(this),
            ];

        // Optimized selectors based on analysis of all three extractors
        this.contentSelectors = [
            // News-specific selectors (most reliable)
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
            '.article-wrap .article-body',
            
            // Generic content selectors
            '.content',
            '.main-content',
            '#content',
            '#main-content',
            '.entry',
            '.post',
            'main article',
            '[role="main"] article'
        ];

        this.titleSelectors = [
            'h1.headline',
            'h1.title',
            'h1.article-title',
            'h1.entry-title',
            'h1.post-title',
            '.headline h1',
            '.title h1',
            'h1',
            'h2.title',
            'title'
        ];
    }

    /**
     * Extract content using Mozilla Readability (most reliable method)
     * @param {string} html - HTML content
     * @param {string} url - Article URL for context
     * @returns {object} Extracted content
     */
    extractWithReadability(html, url = '') {
        try {
            log.debug('Attempting extraction with Mozilla Readability');

            // Pre-clean HTML before Readability processing
            const cleanedHtml = this.preCleanHtml(html);

            // Create JSDOM instance with cleaned HTML
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
                return { success: false };
            }

            // Post-process the extracted text
            const cleanedText = this.postProcessText(article.textContent || '');

            // Extract additional metadata from original HTML
            const $ = cheerio.load(html);
            const author = this.extractAuthor($);
            const publishDate = this.extractPublishDate($);
            const images = this.extractAllImages($, article.content, url);

            return {
                title: cleanText(article.title || ''),
                text: cleanedText,
                content: article.content || '',
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
     * Extract content using custom news-specific selectors
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Extracted content
     */
    extractWithCustomSelectors(html, url = '') {
        try {
            const $ = cheerio.load(html);
            
            // Extract main content using news-specific selectors
            let mainContent = '';
            let contentElement = null;

            for (const selector of this.contentSelectors) {
                const element = $(selector).first();
                if (element.length > 0) {
                    const text = element.text().trim();
                    if (text.length > mainContent.length) {
                        mainContent = text;
                        contentElement = element;
                    }
                }
            }

            // If no content found, try paragraph aggregation
            if (mainContent.length < 300) {
                const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
                mainContent = paragraphs.filter(p => p.length > 50).join('\n\n');
            }

            // Post-process the extracted text
            const cleanedText = this.postProcessText(mainContent);

            return {
                title: cleanText(this.extractTitle($)),
                text: cleanedText,
                content: mainContent,
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(this.extractDescription($)),
                images: this.extractAllImages($, null, url),
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(cleanedText.length > 300),
                extractionMethod: 'custom-selectors'
            };
        } catch (error) {
            log.debug('Custom selectors extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract content using meta tags and structured data
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Extracted content
     */
    extractWithMetaTags(html, url = '') {
        try {
            const $ = cheerio.load(html);

            // Extract title from various sources
            const title = $('title').text() ||
                         $('meta[property="og:title"]').attr('content') ||
                         $('meta[name="twitter:title"]').attr('content') ||
                         $('h1').first().text();

            // Extract description
            const description = $('meta[name="description"]').attr('content') ||
                              $('meta[property="og:description"]').attr('content') ||
                              $('meta[name="twitter:description"]').attr('content');

            // Extract main content from common selectors
            const contentSelectors = [
                'article', '.article', '#article',
                '.content', '#content', '.post-content',
                '.entry-content', '.main-content', 'main'
            ];

            let text = '';
            for (const selector of contentSelectors) {
                const element = $(selector);
                if (element.length && element.text().trim().length > 100) {
                    text = element.text().trim();
                    break;
                }
            }

            // Post-process the extracted text
            const cleanedText = this.postProcessText(text);

            return {
                title: cleanText(title || ''),
                text: cleanedText,
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(description || ''),
                images: this.extractAllImages($, null, url),
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(title && cleanedText.length > 100),
                extractionMethod: 'meta-tags'
            };
        } catch (error) {
            log.debug('Meta tags extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract content using heuristic methods (fallback)
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Extracted content
     */
    extractWithHeuristics(html, url = '') {
        try {
            const $ = cheerio.load(html);
            
            // Find the largest text block as potential content
            let largestTextBlock = '';
            let largestTextLength = 0;

            $('p, div').each((_, element) => {
                const text = $(element).text().trim();
                if (text.length > largestTextLength && text.length > 100) {
                    largestTextLength = text.length;
                    largestTextBlock = text;
                }
            });

            // Find potential title (largest heading or first h1/h2)
            let title = $('h1').first().text().trim();
            if (!title) {
                title = $('h2').first().text().trim();
            }
            if (!title) {
                title = $('title').text().trim();
            }

            // Extract meta description as fallback
            const description = $('meta[name="description"]').attr('content') || 
                              $('meta[property="og:description"]').attr('content') || '';

            // Post-process the extracted text
            const cleanedText = this.postProcessText(largestTextBlock);

            return {
                title: cleanText(title),
                text: cleanedText,
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(description),
                images: this.extractAllImages($, null, url),
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(title || cleanedText.length > 200),
                extractionMethod: 'heuristics'
            };
        } catch (error) {
            log.debug('Heuristic extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Pre-clean HTML before processing
     * @param {string} html - Raw HTML content
     * @returns {string} Cleaned HTML
     */
    preCleanHtml(html) {
        const $ = cheerio.load(html);

        // Remove unwanted elements
        $('script, style, noscript, iframe, embed, object').remove();
        $('.advertisement, .ads, .social-share, .comments').remove();
        $('[class*="ad-"], [id*="ad-"], [class*="social"], [class*="share"]').remove();

        // Remove elements with suspicious content patterns
        $('*').each((_, element) => {
            const $el = $(element);
            const text = $el.text();

            if (text.includes('document.currentScript') ||
                text.includes('window.') ||
                text.includes('var ') ||
                text.includes('function(') ||
                text.includes('Enable Cookies') ||
                text.includes('This content is provided by')) {
                $el.remove();
            }
        });

        return $.html();
    }

    /**
     * Post-process extracted text to remove unwanted content
     * @param {string} text - Raw extracted text
     * @returns {string} Cleaned text
     */
    postProcessText(text) {
        if (!text) return '';

        // Remove common unwanted patterns
        const unwantedPatterns = [
            /Enable Cookies.*?$/gm,
            /This content is provided by.*?$/gm,
            /document\.currentScript.*?$/gm,
            /window\..*?$/gm,
            /var\s+\w+.*?$/gm,
            /function\s*\(.*?\).*?$/gm,
            /\s*\n\s*\n\s*/g, // Multiple newlines
            /^\s+|\s+$/g // Leading/trailing whitespace
        ];

        let cleanedText = text;
        for (const pattern of unwantedPatterns) {
            cleanedText = cleanedText.replace(pattern, '');
        }

        return cleanedText.trim();
    }

    /**
     * Extract title using multiple strategies
     * @param {object} $ - Cheerio instance
     * @returns {string} Extracted title
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
     * Extract author information
     * @param {object} $ - Cheerio instance
     * @returns {string} Author name
     */
    extractAuthor($) {
        const authorSelectors = [
            'meta[name="author"]',
            'meta[property="article:author"]',
            '[rel="author"]',
            '.author',
            '.byline',
            '.article-author',
            '.post-author',
            '[data-testid="author"]',
            '.writer'
        ];

        for (const selector of authorSelectors) {
            const author = $(selector).attr('content') || $(selector).text().trim();
            if (author && author.length > 2) {
                return cleanText(author);
            }
        }
        return '';
    }

    /**
     * Extract publish date
     * @param {object} $ - Cheerio instance
     * @returns {string} Publish date
     */
    extractPublishDate($) {
        const dateSelectors = [
            'meta[property="article:published_time"]',
            'meta[name="date"]',
            'time[datetime]',
            'time',
            '.date',
            '.publish-date',
            '.article-date',
            '.post-date',
            '[data-testid="timestamp"]'
        ];

        for (const selector of dateSelectors) {
            const date = $(selector).attr('content') ||
                        $(selector).attr('datetime') ||
                        $(selector).text().trim();
            if (date) {
                return date;
            }
        }
        return '';
    }

    /**
     * Extract description
     * @param {object} $ - Cheerio instance
     * @returns {string} Description
     */
    extractDescription($) {
        const description = $('meta[name="description"]').attr('content') ||
                          $('meta[property="og:description"]').attr('content') ||
                          $('meta[name="twitter:description"]').attr('content') ||
                          $('.excerpt').text().trim() ||
                          $('.summary').text().trim();

        return description || '';
    }

    /**
     * Extract all images from content
     * @param {object} $ - Cheerio instance
     * @param {string} content - HTML content
     * @param {string} url - Base URL
     * @returns {Array} Array of image objects
     */
    extractAllImages($, content, url) {
        const images = [];

        // Extract featured image from meta tags
        const featuredImage = $('meta[property="og:image"]').attr('content') ||
                             $('meta[name="twitter:image"]').attr('content');

        if (featuredImage) {
            images.push({
                src: featuredImage,
                alt: 'Featured image',
                type: 'featured'
            });
        }

        // Extract images from content
        if (content) {
            const $content = cheerio.load(content);
            $content('img').each((_, img) => {
                const src = $(img).attr('src');
                const alt = $(img).attr('alt') || '';

                if (src && !images.some(i => i.src === src)) {
                    images.push({
                        src,
                        alt,
                        type: 'content'
                    });
                }
            });
        }

        return images.slice(0, 5); // Limit to 5 images for cost optimization
    }

    /**
     * Score extraction result based on content quality
     * @param {object} result - Extraction result
     * @returns {number} Quality score
     */
    scoreExtraction(result) {
        let score = 0;

        // Title scoring
        if (result.title) {
            score += result.title.length > 10 ? 20 : 10;
        }

        // Text content scoring
        if (result.text) {
            if (result.text.length > 1000) score += 40;
            else if (result.text.length > 500) score += 30;
            else if (result.text.length > 200) score += 20;
            else score += 10;
        }

        // Author scoring
        if (result.author) score += 10;

        // Date scoring
        if (result.date) score += 10;

        // Description scoring
        if (result.description && result.description.length > 50) score += 10;

        // Images scoring
        if (result.images && result.images.length > 0) score += 10;

        return score;
    }

    /**
     * Extract content with fallback strategies
     * @param {string} html - HTML content
     * @param {string} url - Article URL
     * @returns {object} Best extracted content
     */
    extractContent(html, url = '') {
        let bestResult = this.createEmptyResult();
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

                    // If using single strategy mode, return first successful result
                    if (CONFIG.COST_OPTIMIZATION?.SINGLE_EXTRACTION_STRATEGY) {
                        return result;
                    }
                }
            } catch (error) {
                log.debug('Extraction strategy failed:', error.message);
            }
        }

        return bestResult;
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
            date: '',
            description: '',
            images: [],
            tags: [],
            lang: 'unknown',
            success: false,
            extractionMethod: 'none'
        };
    }
}
