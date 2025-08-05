/**
 * Enhanced content extraction with multiple fallback strategies
 */

import unfluff from 'unfluff';
import { log } from 'crawlee';
import { cleanText } from './utils.js';

/**
 * Content Extractor class with multiple extraction strategies
 */
export class ContentExtractor {
    constructor() {
        this.extractionStrategies = [
            this.extractWithUnfluff.bind(this),
            this.extractWithSelectors.bind(this),
            this.extractWithHeuristics.bind(this),
        ];
    }

    /**
     * Extract content using Unfluff library
     * @param {string} html - HTML content
     * @param {object} $ - Cheerio instance
     * @returns {object} Extracted content
     */
    extractWithUnfluff(html, $) {
        try {
            const data = unfluff(html);
            return {
                title: data.title,
                text: data.text,
                author: data.author,
                date: data.date,
                description: data.description,
                image: data.image,
                tags: data.tags || [],
                lang: data.lang,
                success: !!(data.title || data.text),
            };
        } catch (error) {
            log.debug('Unfluff extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract content using common CSS selectors
     * @param {string} html - HTML content
     * @param {object} $ - Cheerio instance
     * @returns {object} Extracted content
     */
    extractWithSelectors(html, $) {
        try {
            // Skip if no Cheerio instance available (browser mode)
            if (!$) {
                return { success: false };
            }
            // Common title selectors
            const titleSelectors = [
                'h1',
                '.article-title',
                '.post-title',
                '.entry-title',
                '[data-testid="headline"]',
                '.headline',
                'title',
            ];

            // Common content selectors
            const contentSelectors = [
                '.article-content',
                '.post-content',
                '.entry-content',
                '.content',
                'article',
                '.story-body',
                '.article-body',
                '[data-testid="article-body"]',
                '.post-body',
            ];

            // Common author selectors
            const authorSelectors = [
                '.author',
                '.byline',
                '.article-author',
                '.post-author',
                '[data-testid="author"]',
                '.writer',
            ];

            // Common date selectors
            const dateSelectors = [
                'time',
                '.date',
                '.publish-date',
                '.article-date',
                '.post-date',
                '[data-testid="timestamp"]',
            ];

            const title = this.extractBySelectors($, titleSelectors);
            const text = this.extractBySelectors($, contentSelectors);
            const author = this.extractBySelectors($, authorSelectors);
            const dateText = this.extractBySelectors($, dateSelectors);

            return {
                title: cleanText(title),
                text: cleanText(text),
                author: cleanText(author),
                date: dateText,
                description: '',
                image: null,
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(title || text),
            };
        } catch (error) {
            log.debug('Selector extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract content using heuristic methods
     * @param {string} html - HTML content
     * @param {object} $ - Cheerio instance
     * @returns {object} Extracted content
     */
    extractWithHeuristics(html, $) {
        try {
            // Skip if no Cheerio instance available (browser mode)
            if (!$) {
                return { success: false };
            }
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

            return {
                title: cleanText(title),
                text: cleanText(largestTextBlock),
                author: '',
                date: null,
                description: cleanText(description),
                image: null,
                tags: [],
                lang: $('html').attr('lang') || 'unknown',
                success: !!(title || largestTextBlock),
            };
        } catch (error) {
            log.debug('Heuristic extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract text using multiple selectors
     * @param {object} $ - Cheerio instance
     * @param {Array<string>} selectors - CSS selectors to try
     * @returns {string} Extracted text
     */
    extractBySelectors($, selectors) {
        for (const selector of selectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                const text = element.text().trim();
                if (text.length > 0) {
                    return text;
                }
            }
        }
        return '';
    }

    /**
     * Extract content with fallback strategies
     * @param {string} html - HTML content
     * @param {object} $ - Cheerio instance
     * @returns {object} Best extracted content
     */
    extractContent(html, $ = null) {
        let bestResult = { success: false };
        let bestScore = 0;

        // Try each extraction strategy
        for (const strategy of this.extractionStrategies) {
            try {
                const result = strategy(html, $);
                
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

        // If no strategy succeeded, return empty result
        if (!bestResult.success) {
            log.warning('All content extraction strategies failed');
            return {
                title: '',
                text: '',
                author: '',
                date: null,
                description: '',
                image: null,
                tags: [],
                lang: 'unknown',
                success: false,
            };
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

        // Title scoring
        if (result.title && result.title.length > 10) {
            score += 30;
        } else if (result.title) {
            score += 10;
        }

        // Text content scoring
        if (result.text && result.text.length > 500) {
            score += 50;
        } else if (result.text && result.text.length > 100) {
            score += 30;
        } else if (result.text) {
            score += 10;
        }

        // Author scoring
        if (result.author && result.author.length > 2) {
            score += 10;
        }

        // Date scoring
        if (result.date) {
            score += 5;
        }

        // Description scoring
        if (result.description && result.description.length > 20) {
            score += 5;
        }

        return score;
    }
}

export default ContentExtractor;
