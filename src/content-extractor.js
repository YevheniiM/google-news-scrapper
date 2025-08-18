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
                this.extractWithJsonLd.bind(this),
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
                nbTopCandidates: 7,
                charThreshold: 300,
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

            // Slightly relax success threshold to improve extraction rate while keeping quality checks later
            const success = !!(article.title && cleanedText.length > 250 && this.isReadableText(cleanedText));

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
                success,
                extractionMethod: 'readability'
            };
        } catch (error) {
            log.debug('Readability extraction failed:', error.message);
            return { success: false };
        }
    }


	/**
	     * Extract content from JSON-LD (schema.org)
	     * @param {string} html
	     * @param {string} url
	     */
	    extractWithJsonLd(html, url = '') {
	        try {
	            const $ = cheerio.load(html);
	            const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).contents().text()).get();
	            let best = null;
	            for (const raw of scripts) {
	                try {
	                    const data = JSON.parse(raw);
	                    const items = Array.isArray(data) ? data : [data];
	                    for (const item of items) {
	                        const ctx = item['@context'] || '';
	                        const type = item['@type'] || item.type || '';
	                        if (!String(ctx).includes('schema.org')) continue;
	                        if (!/(Article|NewsArticle|BlogPosting)/i.test(String(type))) continue;
	                        const title = item.headline || item.name || '';
	                        const articleBody = item.articleBody || item.description || '';
	                        const cleanedText = this.postProcessText(articleBody);
	                        // images
	                        let images = [];
	                        const img = item.image;
	                        if (typeof img === 'string') images.push({ url: img, alt: 'Featured', type: 'featured' });
	                        else if (img && typeof img === 'object') {
	                            const src = img.url || img.contentUrl;
	                            if (src) images.push({ url: src, alt: img.name || 'Featured', type: 'featured' });
	                        } else if (Array.isArray(img)) {
	                            for (const ii of img) {
	                                const src = typeof ii === 'string' ? ii : (ii?.url || ii?.contentUrl);
	                                if (src) images.push({ url: src, alt: 'Featured', type: 'featured' });
	                            }
	                        }
	                        const author = (typeof item.author === 'string') ? item.author : (item.author?.name || '');
	                        const date = item.datePublished || item.dateModified || '';
	                        const success = !!(title && cleanedText.length > 300 && this.isReadableText(cleanedText));
	                        const result = {
	                            title: cleanText(title),
	                            text: cleanedText,
	                            content: '',
	                            author: cleanText(author),
	                            date,
	                            description: cleanText(item.description || ''),
	                            images,
	                            tags: [],
	                            lang: $('html').attr('lang') || 'unknown',
	                            success,
	                            extractionMethod: 'json-ld'
	                        };
	                        if (success) return result;
	                        if (!best || this.scoreExtraction(result) > this.scoreExtraction(best)) best = result;
	                    }
	                } catch (_) {}
	            }
	            return best || { success: false };
	        } catch (e) {
	            log.debug('JSON-LD extraction failed:', e.message);
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
            // Pre-clean to drop script/style/noscript and obvious noise
            const cleanedHtml = this.preCleanHtml(html);
            const $ = cheerio.load(cleanedHtml);

            // Extract main content using news-specific selectors
            let mainContentText = '';
            let contentElement = null;

            for (const selector of this.contentSelectors) {
                const element = $(selector).first();
                if (element.length > 0) {
                    const text = element.text().trim();
                    if (text.length > mainContentText.length) {
                        mainContentText = text;
                        contentElement = element;
                    }
                }
            }

            // If no content found, try paragraph aggregation
            if (mainContentText.length < 300) {
                const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
                mainContentText = paragraphs.filter(p => p.length > 50).join('\n\n');
            }

            // Post-process the extracted text
            const cleanedText = this.postProcessText(mainContentText);
            const success = !!(cleanedText.length > 250 && this.isReadableText(cleanedText));

            return {
                title: cleanText(this.extractTitle($)),
                text: cleanedText,
                content: contentElement ? contentElement.html() || '' : '',
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(this.extractDescription($)),
                images: this.extractAllImages($, contentElement ? contentElement.html() : null, url),
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success,
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
            const cleanedHtml = this.preCleanHtml(html);
            const $ = cheerio.load(cleanedHtml);

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
            let contentHtml = '';
            for (const selector of contentSelectors) {
                const element = $(selector).first();
                if (element.length && element.text().trim().length > 100) {
                    text = element.text().trim();
                    contentHtml = element.html() || '';
                    break;
                }
            }

            // Post-process the extracted text
            const cleanedText = this.postProcessText(text);
            const success = !!(title && cleanedText.length > 250 && this.isReadableText(cleanedText));

            return {
                title: cleanText(title || ''),
                text: cleanedText,
                content: contentHtml,
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(description || ''),
                images: this.extractAllImages($, contentHtml || null, url),
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success,
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
            const cleanedHtml = this.preCleanHtml(html);
            const $ = cheerio.load(cleanedHtml);

            // Find the largest text block as potential content
            let largestTextBlock = '';
            let largestTextElement = null;
            let largestTextLength = 0;

            $('p, div').each((_, element) => {
                const $el = $(element);
                const text = $el.text().trim();
                if (text.length > largestTextLength && text.length > 100) {
                    largestTextLength = text.length;
                    largestTextBlock = text;
                    largestTextElement = $el;
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
            const success = !!((title && cleanedText.length > 250) && this.isReadableText(cleanedText));

            return {
                title: cleanText(title),
                text: cleanedText,
                content: largestTextElement ? largestTextElement.html() || '' : '',
                author: this.extractAuthor($),
                date: this.extractPublishDate($),
                description: cleanText(description),
                images: this.extractAllImages($, largestTextElement ? largestTextElement.html() : null, url),
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success,
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
     * - Strips CSS/JS fragments and any leftover HTML
     * @param {string} text - Raw extracted text
     * @returns {string} Cleaned text
     */
    postProcessText(text) {
        if (!text) return '';

        let cleanedText = String(text);

        // If HTML tags slipped in, strip them by loading into Cheerio and taking .text()
        if (cleanedText.includes('<') && cleanedText.includes('>')) {
            try {
                const $tmp = cheerio.load(cleanedText);
                cleanedText = $tmp('body').text() || $tmp.root().text();
            } catch (_) {
                // best effort; continue with regex-based stripping below
            }
        }

        // Remove CSS blocks and declarations
        const cssPatterns = [
            /[.#][A-Za-z0-9_-]+\s*\{[^}]*\}/g,           // .class { ... } or #id { ... }
            /@[a-z-]+\s*[^{]*\{[^}]*\}/gi,                // @media, @font-face, etc.
            /[a-z-]+\s*:\s*[^;\n]+;\s*/gi                // property: value;
        ];
        cssPatterns.forEach((re) => { cleanedText = cleanedText.replace(re, ''); });

        // Remove typical JS fragments that sometimes leak into text
        const jsPatterns = [
            /function\s*\([^)]*\)\s*\{[^}]*\}/g,
            /var\s+\w+\s*=\s*[^;]+;/g,
            /const\s+\w+\s*=\s*[^;]+;/g,
            /let\s+\w+\s*=\s*[^;]+;/g,
            /window\.[A-Za-z0-9_.]+/g,
            /document\.[A-Za-z0-9_.]+/g
        ];
        jsPatterns.forEach((re) => { cleanedText = cleanedText.replace(re, ''); });

        // Remove common unwanted boilerplate and excessive newlines
        const unwantedPatterns = [
            /Enable Cookies.*?$/gim,
            /This content is provided by.*?$/gim,
            /cookie settings/i,
            /accept cookies/i,
            /subscribe to our newsletter/i,
            /\s*\n\s*\n\s*/g, // Multiple newlines
            /^\s+|\s+$/g // Leading/trailing whitespace
        ];
        for (const pattern of unwantedPatterns) {
            cleanedText = cleanedText.replace(pattern, '');
        }

        // Normalize whitespace
        cleanedText = cleanText(cleanedText);

        return cleanedText;
    }

    /**
     * Heuristic readability check to ensure text looks like an article
     * @param {string} text
     * @returns {boolean}
     */
    isReadableText(text) {
        if (!text) return false;
        const t = text.trim();
        if (t.length < 300) return false;

        // Reject if contains lots of braces/semicolons typical for CSS/JS
        const braceCount = (t.match(/[{};]/g) || []).length;
        if (braceCount > t.length * 0.02) return false; // >2% braces/semicolons

        // Reject if contains many < or > indicative of HTML
        const angleCount = (t.match(/[<>]/g) || []).length;
        if (angleCount > 0) return false;

        // Must contain multiple sentences
        const sentences = t.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 40);
        if (sentences.length < 2) return false;

        // Ratio of letters to total chars should be reasonable
        const letters = (t.match(/[A-Za-zÀ-ž]/g) || []).length;
        if (letters / t.length < 0.5) return false;

        // Average word length and vocabulary diversity
        const words = t.split(/\s+/).filter(w => w.length > 0);
        const avgWordLen = words.reduce((a, w) => a + w.length, 0) / words.length;
        if (avgWordLen < 3.5) return false;

        return true;
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
        const featuredImage = $('meta[property="og:image:secure_url"]').attr('content') ||
                             $('meta[property="og:image:url"]').attr('content') ||
                             $('meta[property="og:image"]').attr('content') ||
                             $('meta[name="twitter:image"]').attr('content');

        if (featuredImage) {
            images.push({
                url: featuredImage,
                alt: 'Featured image',
                type: 'featured'
            });
        }

        // Extract images from content
        if (content) {
            const $content = cheerio.load(content);
            $content('img').each((_, img) => {
                let src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src') || $(img).attr('srcset');
                const alt = $(img).attr('alt') || '';

                if (src) {
                    // If srcset, take the first URL
                    if (src.includes(',')) src = src.split(',')[0].trim().split(' ')[0];
                    if (!images.some(i => i.url === src)) {
                        images.push({
                            url: Array.isArray(src) ? src[0] : src,
                            alt,
                            type: 'content'
                        });
                    }
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
