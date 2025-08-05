/**
 * Enhanced content extraction with multiple fallback strategies
 */

import { log } from 'crawlee';
import { cleanText, cleanHtmlContent } from './utils.js';
import * as cheerio from 'cheerio';

/**
 * Content Extractor class with multiple extraction strategies
 */
export class ContentExtractor {
    constructor() {
        this.extractionStrategies = [
            this.extractWithMetaTags.bind(this),
            this.extractWithHtmlCleaning.bind(this),
            this.extractWithSelectors.bind(this),
            this.extractWithHeuristics.bind(this),
        ];
    }

    /**
     * Extract content using meta tags and structured data
     * @param {string} html - HTML content
     * @param {object} $ - Cheerio instance
     * @returns {object} Extracted content
     */
    extractWithMetaTags(html, $) {
        try {
            // Extract title from various sources
            const title = $('title').text() ||
                         $('meta[property="og:title"]').attr('content') ||
                         $('meta[name="twitter:title"]').attr('content') ||
                         $('h1').first().text();

            // Extract description
            const description = $('meta[name="description"]').attr('content') ||
                              $('meta[property="og:description"]').attr('content') ||
                              $('meta[name="twitter:description"]').attr('content');

            // Extract author
            const author = $('meta[name="author"]').attr('content') ||
                          $('meta[property="article:author"]').attr('content') ||
                          $('[rel="author"]').text() ||
                          $('.author').text();

            // Extract publish date
            const date = $('meta[property="article:published_time"]').attr('content') ||
                        $('meta[name="date"]').attr('content') ||
                        $('time[datetime]').attr('datetime') ||
                        $('time').attr('datetime');

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

            // Extract image
            const image = $('meta[property="og:image"]').attr('content') ||
                         $('meta[name="twitter:image"]').attr('content') ||
                         $('img').first().attr('src');

            // Extract language
            const lang = $('html').attr('lang') ||
                        $('meta[http-equiv="content-language"]').attr('content') ||
                        'unknown';

            return {
                title: cleanText(title || ''),
                text: cleanText(text || ''),
                author: cleanText(author || ''),
                date: date || '',
                description: cleanText(description || ''),
                image: image || '',
                tags: [],
                lang: lang,
                success: !!(title && text && text.length > 100),
                extractionMethod: 'meta-tags'
            };
        } catch (error) {
            log.debug('Meta tags extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract content using HTML cleaning and structure analysis
     * @param {string} html - HTML content
     * @param {object} $ - Cheerio instance
     * @returns {object} Extracted content
     */
    extractWithHtmlCleaning(html, $) {
        try {
            if (!$) return { success: false };

            // Use the HTML cleaning function to get clean content
            const cleanedContent = cleanHtmlContent($);

            // Extract additional metadata
            const author = this.extractAuthor($);
            const date = this.extractDate($);
            const tags = this.extractTags($);
            const lang = $('html').attr('lang') || 'unknown';

            return {
                title: cleanedContent.title,
                text: cleanedContent.text,
                author: author,
                date: date,
                description: cleanedContent.description,
                image: null, // Will be handled by image extraction
                tags: tags,
                lang: lang,
                success: !!(cleanedContent.title || cleanedContent.text),
            };
        } catch (error) {
            log.debug('HTML cleaning extraction failed:', error.message);
            return { success: false };
        }
    }

    /**
     * Extract author information from various sources
     * @param {object} $ - Cheerio instance
     * @returns {string} Author name
     */
    extractAuthor($) {
        const authorSelectors = [
            '.author',
            '.byline',
            '.article-author',
            '.post-author',
            '[data-testid="author"]',
            '.writer',
            '[rel="author"]',
            '.by-author',
            '.author-name',
            'meta[name="author"]',
            'meta[property="article:author"]'
        ];

        for (const selector of authorSelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                const text = element.attr('content') || element.text().trim();
                if (text && text.length > 0 && text.length < 100) {
                    return cleanText(text);
                }
            }
        }

        return '';
    }

    /**
     * Extract publication date from various sources
     * @param {object} $ - Cheerio instance
     * @returns {string|null} Date string
     */
    extractDate($) {
        const dateSelectors = [
            'time[datetime]',
            'time[pubdate]',
            '.date',
            '.publish-date',
            '.article-date',
            '.post-date',
            '[data-testid="timestamp"]',
            'meta[property="article:published_time"]',
            'meta[name="publish-date"]'
        ];

        for (const selector of dateSelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                const dateValue = element.attr('datetime') ||
                                element.attr('content') ||
                                element.text().trim();

                if (dateValue) {
                    // Try to parse the date
                    const parsedDate = new Date(dateValue);
                    if (!isNaN(parsedDate.getTime())) {
                        return parsedDate.toISOString();
                    }
                }
            }
        }

        return null;
    }

    /**
     * Extract tags from various sources
     * @param {object} $ - Cheerio instance
     * @returns {Array<string>} Array of tags
     */
    extractTags($) {
        const tags = new Set();

        // Extract from meta keywords
        const keywords = $('meta[name="keywords"]').attr('content');
        if (keywords) {
            keywords.split(',').forEach(tag => {
                const cleanTag = tag.trim();
                if (cleanTag.length > 0 && cleanTag.length < 50) {
                    tags.add(cleanTag);
                }
            });
        }

        // Extract from article tags
        $('.tag, .tags a, .category, .categories a').each((_, element) => {
            const tagText = $(element).text().trim();
            if (tagText.length > 0 && tagText.length < 50) {
                tags.add(tagText);
            }
        });

        return Array.from(tags);
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
