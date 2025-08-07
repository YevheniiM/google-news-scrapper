/**
 * Utility functions for the Google News scraper
 */

import { log } from 'crawlee';
import { CONFIG } from './config.js';

/**
 * Build Google News RSS feed URL
 * @param {string} query - Search query
 * @param {string} language - Language code (e.g., 'en-US')
 * @param {string} region - Region code (e.g., 'US')
 * @param {string} dateFrom - Start date (YYYY-MM-DD)
 * @param {string} dateTo - End date (YYYY-MM-DD)
 * @returns {string} RSS feed URL
 */
export function buildFeedUrl(query, language = CONFIG.RSS.DEFAULT_LANGUAGE, region = CONFIG.RSS.DEFAULT_REGION, dateFrom = null, dateTo = null) {
    let searchQuery = query;

    // Add date filters to the search query
    if (dateFrom && dateTo) {
        searchQuery += ` after:${dateFrom} before:${dateTo}`;
    } else if (dateFrom) {
        searchQuery += ` after:${dateFrom}`;
    } else if (dateTo) {
        searchQuery += ` before:${dateTo}`;
    }

    const params = new URLSearchParams({
        q: searchQuery,
        hl: language,
        gl: region,
        ceid: `${region}:${language.split('-')[0]}`,
    });

    return `${CONFIG.RSS.BASE_URL}?${params.toString()}`;
}

/**
 * Extract real URL from Google News redirect link
 * @param {string} googleNewsUrl - Google News URL
 * @returns {string} Real article URL or modified Google News URL
 */
export function extractRealUrl(googleNewsUrl) {
    try {
        const url = new URL(googleNewsUrl);

        // If it's already a direct URL, return it
        if (url.hostname !== 'news.google.com') {
            return googleNewsUrl;
        }

        // Extract URL from Google News redirect (old format)
        if (url.searchParams.has('url')) {
            return decodeURIComponent(url.searchParams.get('url'));
        }

        // Handle RSS article URLs - convert to web format for better handling
        if (url.pathname.includes('/rss/articles/')) {
            const webUrl = googleNewsUrl.replace('/rss/articles/', '/articles/');
            log.debug(`Converted RSS URL to web format: ${webUrl}`);
            return webUrl;
        }

        // Handle other Google News URL formats
        const pathMatch = url.pathname.match(/\/articles\/(.+)/);
        if (pathMatch) {
            // Try to decode the Google News URL to get the actual article URL
            const decodedUrl = decodeGoogleNewsUrl(googleNewsUrl);
            if (decodedUrl !== googleNewsUrl) {
                log.debug(`Successfully decoded Google News URL: ${decodedUrl}`);
                return decodedUrl;
            }

            // If decoding fails, return the Google News URL for browser handling
            log.debug(`Complex Google News URL format, will need browser resolution: ${googleNewsUrl}`);
            return googleNewsUrl;
        }

        return googleNewsUrl;
    } catch (error) {
        log.error(`Error extracting real URL from ${googleNewsUrl}:`, error.message || error);
        return googleNewsUrl;
    }
}

/**
 * Validate if an image URL is accessible - COST OPTIMIZED VERSION
 * @param {string} imageUrl - Image URL to validate
 * @param {object} gotScraping - Got scraping instance (optional, for backward compatibility)
 * @returns {Promise<boolean>} True if image is valid
 */
export async function validateImageUrl(imageUrl, gotScraping = null) {
    try {
        // COST OPTIMIZATION: Skip expensive HTTP validation if configured
        if (CONFIG.IMAGE?.SKIP_VALIDATION) {
            return validateImageUrlByPattern(imageUrl);
        }

        // Original HTTP validation for non-optimized mode
        if (!gotScraping) {
            return validateImageUrlByPattern(imageUrl);
        }

        const response = await gotScraping({
            url: imageUrl,
            method: 'HEAD',
            timeout: { request: CONFIG.IMAGE.VALIDATION_TIMEOUT },
            followRedirect: true,
            retry: { limit: 0 },
        });

        return response.statusCode >= 200 && response.statusCode < 400;
    } catch (error) {
        log.debug(`Image validation failed for ${imageUrl}:`, error.message);
        return validateImageUrlByPattern(imageUrl); // Fallback to pattern validation
    }
}



/**
 * Extract and deduplicate images from various sources
 * @param {object} extractedContent - Content extracted from article
 * @param {object} $ - Cheerio instance
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {Array<object>} Array of image objects with metadata
 */
export function extractImages(extractedContent, $ = null, baseUrl = null) {
    const images = new Map(); // Use Map to store image objects with metadata

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
                // Skip relative URLs if no base URL provided
                return;
            }

            // Skip data URLs and very small images (likely icons)
            if (absoluteUrl.startsWith('data:') ||
                absoluteUrl.includes('1x1') ||
                absoluteUrl.includes('pixel') ||
                absoluteUrl.includes('spacer')) {
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
            log.debug(`Failed to process image URL: ${src}`, error.message);
        }
    };

    // Add image from extracted content (unfluff or other extractors)
    if (extractedContent.image) {
        addImage(extractedContent.image, 'featured');
    }

    // Only extract from DOM if Cheerio instance is available
    if ($) {
        // Extract base URL from the page if not provided
        if (!baseUrl) {
            const canonicalUrl = $('link[rel="canonical"]').attr('href') ||
                                $('meta[property="og:url"]').attr('content');
            if (canonicalUrl) {
                try {
                    baseUrl = new URL(canonicalUrl).origin;
                } catch (e) {
                    // Ignore invalid URLs
                }
            }
        }

        // Add Open Graph images (usually featured images)
        $('meta[property="og:image"], meta[property="og:image:url"]').each((_, element) => {
            const content = $(element).attr('content');
            if (content) {
                addImage(content, 'og-featured');
            }
        });

        // Add Twitter card images
        $('meta[name="twitter:image"], meta[name="twitter:image:src"]').each((_, element) => {
            const content = $(element).attr('content');
            if (content) {
                addImage(content, 'twitter-featured');
            }
        });

        // Add schema.org images
        $('meta[itemprop="image"]').each((_, element) => {
            const content = $(element).attr('content');
            if (content) {
                addImage(content, 'schema-featured');
            }
        });

        // Extract images from article content with priority order
        const contentSelectors = [
            'article img',
            '.article img',
            '.content img',
            '.post img',
            '.entry-content img',
            '.story-body img',
            '.article-body img',
            '.post-content img',
            'main img',
            '.main img'
        ];

        for (const selector of contentSelectors) {
            $(selector).each((index, element) => {
                const $img = $(element);
                const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
                const alt = $img.attr('alt') || '';
                const width = $img.attr('width');
                const height = $img.attr('height');

                if (src) {
                    const imageObj = {
                        url: null, // Will be set by addImage
                        type: 'content',
                        alt: alt,
                        caption: $img.closest('figure').find('figcaption').text() ||
                                $img.parent().find('.caption').text() || '',
                        width: width ? parseInt(width) : null,
                        height: height ? parseInt(height) : null
                    };

                    addImage(src, 'content', alt, imageObj.caption);

                    // Update the stored image with additional metadata
                    try {
                        const absoluteUrl = src.startsWith('http') ? src :
                                          baseUrl ? new URL(src, baseUrl).href : null;
                        if (absoluteUrl && images.has(absoluteUrl)) {
                            const existing = images.get(absoluteUrl);
                            existing.width = imageObj.width;
                            existing.height = imageObj.height;
                            existing.caption = imageObj.caption;
                        }
                    } catch (e) {
                        // Ignore URL errors
                    }
                }
            });

            // If we found images with this selector, break to avoid duplicates
            if ($(selector).length > 0) {
                break;
            }
        }

        // Look for gallery images
        $('.gallery img, .image-gallery img, .photo-gallery img, [class*="gallery"] img').each((_, element) => {
            const $img = $(element);
            const src = $img.attr('src') || $img.attr('data-src');
            const alt = $img.attr('alt') || '';
            const caption = $img.closest('.gallery-item').find('.caption').text() ||
                           $img.parent().find('.caption').text() || '';

            if (src) {
                addImage(src, 'gallery', alt, caption);
            }
        });

        // Look for hero/banner images
        $('.hero img, .banner img, .featured-image img, .post-thumbnail img').each((_, element) => {
            const $img = $(element);
            const src = $img.attr('src') || $img.attr('data-src');
            const alt = $img.attr('alt') || '';

            if (src) {
                addImage(src, 'hero', alt);
            }
        });
    }

    // Convert Map to Array and sort by priority
    const imageArray = Array.from(images.values());

    // Sort images by type priority (featured images first)
    const typePriority = {
        'featured': 1,
        'og-featured': 2,
        'twitter-featured': 3,
        'schema-featured': 4,
        'hero': 5,
        'content': 6,
        'gallery': 7
    };

    imageArray.sort((a, b) => {
        const priorityA = typePriority[a.type] || 10;
        const priorityB = typePriority[b.type] || 10;
        return priorityA - priorityB;
    });

    log.debug(`Extracted ${imageArray.length} images from article`);
    return imageArray;
}

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format date to YYYY-MM-DD format
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    // Handle string dates by converting to Date object
    const dateObj = date instanceof Date ? date : new Date(date);

    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date');
    }

    return dateObj.toISOString().split('T')[0];
}

/**
 * Validate image URL using pattern matching (no HTTP requests)
 * @param {string} imageUrl - Image URL to validate
 * @returns {boolean} True if image URL looks valid
 */
export function validateImageUrlByPattern(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
        return false;
    }

    // Must be HTTP/HTTPS URL
    if (!imageUrl.startsWith('http')) {
        return false;
    }

    // Check for valid image extensions
    const validExtensions = CONFIG.IMAGE.ALLOWED_EXTENSIONS;
    const hasValidExtension = validExtensions.some(ext =>
        imageUrl.toLowerCase().includes(ext)
    );

    // Skip obvious non-images
    const invalidPatterns = [
        '1x1', 'pixel', 'spacer', 'blank', 'transparent',
        'tracking', 'analytics', 'beacon', 'counter'
    ];

    const hasInvalidPattern = invalidPatterns.some(pattern =>
        imageUrl.toLowerCase().includes(pattern)
    );

    // Check for common image hosting domains (likely to be valid)
    const trustedDomains = [
        'imgur.com', 'cloudinary.com', 'amazonaws.com', 'googleusercontent.com',
        'fbcdn.net', 'twimg.com', 'ytimg.com', 'staticflickr.com',
        'unsplash.com', 'pexels.com'
    ];

    const isTrustedDomain = trustedDomains.some(domain =>
        imageUrl.includes(domain)
    );

    // Return true if has valid extension OR is from trusted domain AND doesn't have invalid patterns
    return (hasValidExtension || isTrustedDomain) && !hasInvalidPattern;
}



/**
 * Get date range for slicing large queries
 * @param {string} dateFrom - Start date
 * @param {string} dateTo - End date
 * @param {number} maxDays - Maximum days to go back
 * @returns {Array<{from: string, to: string}>} Array of date ranges
 */
export function getDateRanges(dateFrom, dateTo, maxDays = CONFIG.DATE.MAX_DAYS_BACK) {
    const ranges = [];
    // Use current date if no dateTo provided
    const currentDate = new Date();
    const endDate = dateTo ? new Date(dateTo) : currentDate;
    const startDate = dateFrom ? new Date(dateFrom) : new Date(endDate.getTime() - (maxDays * 24 * 60 * 60 * 1000));

    // Calculate the number of days between start and end (inclusive)
    const daysDiff = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1;

    // Limit the number of ranges to maxDays
    const actualDays = Math.min(daysDiff, maxDays);

    // Generate ranges for each day
    for (let i = 0; i < actualDays; i++) {
        const rangeEnd = new Date(endDate.getTime() - (i * 24 * 60 * 60 * 1000));
        const rangeStart = new Date(rangeEnd.getTime() - (24 * 60 * 60 * 1000));

        ranges.push({
            from: formatDate(rangeStart),
            to: formatDate(rangeEnd),
        });
    }

    return ranges;
}

/**
 * Clean and normalize text content
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export function cleanText(text) {
    if (!text) return '';

    // Ensure text is a string
    const textStr = typeof text === 'string' ? text : String(text);

    return textStr
        .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
        .replace(/\n+/g, '\n') // Replace multiple newlines with single newline
        .trim();
}

/**
 * Clean HTML content by removing unwanted elements and converting to readable text
 * @param {object} $ - Cheerio instance
 * @param {string} baseUrl - Base URL for the page
 * @returns {object} Cleaned content with text and metadata
 */
export function cleanHtmlContent($, baseUrl = '') {
    if (!$) return { text: '', title: '', description: '' };

    // Remove unwanted elements that don't contribute to article content
    const unwantedSelectors = [
        // Navigation and menus
        'nav', '.nav', '.navigation', '.menu', '.navbar',

        // Headers and footers
        'header', '.header', 'footer', '.footer',

        // Sidebars and widgets
        '.sidebar', '.widget', '.aside', 'aside',

        // Advertisements
        '.ad', '.ads', '.advertisement', '.advert', '.sponsored',
        '[class*="ad-"]', '[id*="ad-"]', '[class*="ads-"]',

        // Social media and sharing
        '.social', '.share', '.sharing', '.social-media',
        '.facebook', '.twitter', '.instagram', '.linkedin',

        // Comments
        '.comments', '.comment', '#comments', '.disqus',

        // Related articles and recommendations
        '.related', '.recommended', '.more-stories', '.you-might-like',

        // Newsletter and subscription
        '.newsletter', '.subscribe', '.subscription',

        // Cookie notices and popups
        '.cookie', '.popup', '.modal', '.overlay',

        // Scripts and styles
        'script', 'style', 'noscript',

        // Forms (usually not part of article content)
        'form', '.form',

        // Breadcrumbs
        '.breadcrumb', '.breadcrumbs',

        // Tags and categories (usually not main content)
        '.tags', '.categories', '.tag-list',

        // Author bio boxes (separate from byline)
        '.author-bio', '.about-author',

        // Video players and embeds (keep the content but remove controls)
        '.video-controls', '.player-controls'
    ];

    // Remove unwanted elements
    unwantedSelectors.forEach(selector => {
        $(selector).remove();
    });

    // Clean up specific attributes that might contain tracking or ads
    $('*').each((_, element) => {
        const $el = $(element);

        // Remove tracking attributes
        $el.removeAttr('data-track')
           .removeAttr('data-analytics')
           .removeAttr('onclick')
           .removeAttr('onload');

        // Remove elements with ad-related classes or IDs
        const className = $el.attr('class') || '';
        const id = $el.attr('id') || '';

        if (className.match(/\b(ad|ads|advertisement|sponsored|promo)\b/i) ||
            id.match(/\b(ad|ads|advertisement|sponsored|promo)\b/i)) {
            $el.remove();
        }
    });

    // Extract title from various sources
    const title = $('h1').first().text() ||
                  $('title').text() ||
                  $('meta[property="og:title"]').attr('content') ||
                  $('meta[name="twitter:title"]').attr('content') ||
                  '';

    // Extract description
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') ||
                       $('meta[name="twitter:description"]').attr('content') ||
                       '';

    // Find the main content area
    const contentSelectors = [
        'article',
        '.article',
        '.content',
        '.post',
        '.entry-content',
        '.story-body',
        '.article-body',
        '.post-content',
        'main',
        '.main',
        '#content',
        '.page-content'
    ];

    let mainContent = null;
    for (const selector of contentSelectors) {
        const element = $(selector).first();
        if (element.length > 0 && element.text().trim().length > 100) {
            mainContent = element;
            break;
        }
    }

    // If no main content found, use body but filter out likely non-content
    if (!mainContent) {
        mainContent = $('body');
    }

    // Convert HTML to readable text while preserving some structure
    let text = '';
    if (mainContent) {
        // Process paragraphs and headings
        mainContent.find('p, h1, h2, h3, h4, h5, h6, li').each((_, element) => {
            const $el = $(element);
            const elementText = $el.text().trim();

            if (elementText.length > 0) {
                // Add extra spacing for headings
                if ($el.is('h1, h2, h3, h4, h5, h6')) {
                    text += '\n\n' + elementText + '\n';
                } else {
                    text += elementText + '\n';
                }
            }
        });

        // If no structured content found, get all text
        if (text.trim().length === 0) {
            text = mainContent.text();
        }
    }

    // Clean the extracted text
    text = cleanText(text);

    // Remove common footer text patterns
    const footerPatterns = [
        /©\s*\d{4}.*$/gm,
        /All rights reserved\.?.*$/gm,
        /Terms of use.*$/gm,
        /Privacy policy.*$/gm,
        /Subscribe to.*$/gm,
        /Follow us on.*$/gm
    ];

    footerPatterns.forEach(pattern => {
        text = text.replace(pattern, '');
    });

    return {
        text: cleanText(text),
        title: cleanText(title),
        description: cleanText(description)
    };
}

/**
 * Validate content quality and relevance
 * @param {object} extractedContent - Extracted content to validate
 * @param {object} userData - Original request data for context
 * @param {Array} images - Extracted images
 * @returns {object} Validation result with quality score and issues
 */
export function validateContentQuality(extractedContent, userData, images = []) {
    const validation = {
        isValid: true,
        qualityScore: 0,
        issues: [],
        warnings: []
    };

    // Check title quality
    if (!extractedContent.title || extractedContent.title.length < 10) {
        validation.issues.push('Title is missing or too short');
        validation.qualityScore -= 20;
    } else if (extractedContent.title.length > 200) {
        validation.warnings.push('Title is unusually long');
        validation.qualityScore -= 5;
    } else {
        validation.qualityScore += 15;
    }

    // Check text content quality (RELAXED)
    if (!extractedContent.text || extractedContent.text.length < 50) {
        validation.issues.push('Article text is missing or too short (minimum 50 characters)');
        validation.qualityScore -= 30;
        validation.isValid = false;
    } else if (extractedContent.text.length < 100) {
        validation.warnings.push('Article text is quite short (less than 100 characters)');
        validation.qualityScore -= 5;
    } else {
        validation.qualityScore += 25;
    }

    // Check for meaningful content (not just boilerplate)
    if (extractedContent.text) {
        const boilerplatePatterns = [
            /please enable javascript/i,
            /this site requires javascript/i,
            /javascript is disabled/i,
            /cookies are disabled/i,
            /access denied/i,
            /403 forbidden/i,
            /404 not found/i,
            /page not found/i,
            /subscription required/i,
            /paywall/i,
            /sign up to continue/i,
            /register to read/i
        ];

        const hasBoilerplate = boilerplatePatterns.some(pattern =>
            pattern.test(extractedContent.text)
        );

        if (hasBoilerplate) {
            validation.issues.push('Content appears to contain error messages or paywalls');
            validation.qualityScore -= 25;
            validation.isValid = false;
        }
    }

    // Check content relevance to query
    if (userData.query && extractedContent.text) {
        const queryWords = userData.query.toLowerCase().split(/\s+/);
        const contentWords = extractedContent.text.toLowerCase();

        const relevantWords = queryWords.filter(word =>
            word.length > 3 && contentWords.includes(word)
        );

        const relevanceRatio = relevantWords.length / queryWords.length;

        if (relevanceRatio < 0.2) {
            validation.warnings.push('Content may not be relevant to the search query');
            validation.qualityScore -= 10;
        } else if (relevanceRatio > 0.5) {
            validation.qualityScore += 10;
        }
    }

    // Check description quality
    if (extractedContent.description && extractedContent.description.length > 50) {
        validation.qualityScore += 5;
    }

    // Check author information
    if (extractedContent.author && extractedContent.author.length > 0) {
        validation.qualityScore += 5;
    }

    // Check date information
    if (extractedContent.date) {
        try {
            const date = new Date(extractedContent.date);
            const now = new Date();
            const daysDiff = (now - date) / (1000 * 60 * 60 * 24);

            if (daysDiff > 365) {
                validation.warnings.push('Article is more than a year old');
            } else if (daysDiff < 0) {
                validation.warnings.push('Article date is in the future');
            } else {
                validation.qualityScore += 5;
            }
        } catch (error) {
            validation.warnings.push('Invalid date format');
        }
    }

    // Check image quality
    if (images && images.length > 0) {
        const validImages = images.filter(img =>
            img.url && img.url.startsWith('http') && !img.url.includes('1x1')
        );

        if (validImages.length > 0) {
            validation.qualityScore += 10;

            // Bonus for images with alt text or captions
            const imagesWithMetadata = validImages.filter(img =>
                img.alt || img.caption
            );

            if (imagesWithMetadata.length > 0) {
                validation.qualityScore += 5;
            }
        }
    }

    // Check for duplicate or repetitive content
    if (extractedContent.text) {
        const sentences = extractedContent.text.split(/[.!?]+/);
        const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));

        const duplicateRatio = 1 - (uniqueSentences.size / sentences.length);

        if (duplicateRatio > 0.3) {
            validation.warnings.push('Content contains significant repetition');
            validation.qualityScore -= 10;
        }
    }

    // Check language consistency
    if (extractedContent.lang && extractedContent.lang !== 'unknown') {
        validation.qualityScore += 5;
    }

    // Final quality assessment (RELAXED)
    validation.qualityScore = Math.max(0, Math.min(100, validation.qualityScore));

    if (validation.qualityScore < 10) {
        validation.isValid = false;
        validation.issues.push('Overall content quality is too low');
    }

    // Determine quality level
    if (validation.qualityScore >= 80) {
        validation.qualityLevel = 'excellent';
    } else if (validation.qualityScore >= 60) {
        validation.qualityLevel = 'good';
    } else if (validation.qualityScore >= 40) {
        validation.qualityLevel = 'fair';
    } else {
        validation.qualityLevel = 'poor';
    }

    return validation;
}

/**
 * Decode Google News URL to get the actual article URL
 * @param {string} googleNewsUrl - Google News article URL
 * @returns {string} Decoded article URL or original URL if decoding fails
 */
export function decodeGoogleNewsUrl(googleNewsUrl) {
    try {
        // Extract the article ID from the URL
        const match = googleNewsUrl.match(/articles\/([^?]+)/);
        if (!match) return googleNewsUrl;

        const articleId = match[1];
        log.debug(`Attempting to decode Google News article ID: ${articleId.substring(0, 50)}...`);

        // Google News uses a specific encoding format
        // Try multiple decoding approaches

        // Approach 1: Direct base64 decode
        try {
            const decoded = Buffer.from(articleId, 'base64').toString('utf-8');
            const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\x00-\x1f]+/);
            if (urlMatch && !urlMatch[0].includes('google.com')) {
                log.debug(`Successfully decoded with direct base64: ${urlMatch[0]}`);
                return urlMatch[0];
            }
        } catch (e) {
            log.debug('Direct base64 decode failed:', e.message);
        }

        // Approach 2: Try to decode as URL-safe base64
        try {
            const urlSafeDecoded = articleId.replace(/-/g, '+').replace(/_/g, '/');
            // Add padding if needed
            const paddedDecoded = urlSafeDecoded + '='.repeat((4 - urlSafeDecoded.length % 4) % 4);
            const decoded = Buffer.from(paddedDecoded, 'base64').toString('utf-8');
            const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\x00-\x1f]+/);
            if (urlMatch && !urlMatch[0].includes('google.com')) {
                log.debug(`Successfully decoded with URL-safe base64: ${urlMatch[0]}`);
                return urlMatch[0];
            }
        } catch (e) {
            log.debug('URL-safe base64 decode failed:', e.message);
        }

        // Approach 3: Try to extract from the encoded string using patterns
        try {
            // Look for common URL patterns in the encoded string
            const patterns = [
                /CBM[a-zA-Z0-9+\/=]*([a-zA-Z0-9+\/=]*)(https?:\/\/[^\s"'<>]+)/,
                /(https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s"'<>]*)/,
                // Additional patterns for different encoding formats
                /AU_yqL[a-zA-Z0-9+\/=]*?(https?:\/\/[^\s"'<>]+)/,
                /0x[a-fA-F0-9]*?(https?:\/\/[^\s"'<>]+)/
            ];

            for (const pattern of patterns) {
                const patternMatch = articleId.match(pattern);
                if (patternMatch && patternMatch[1] && !patternMatch[1].includes('google.com')) {
                    log.debug(`Successfully extracted with pattern: ${patternMatch[1]}`);
                    return patternMatch[1];
                }
            }
        } catch (e) {
            log.debug('Pattern extraction failed:', e.message);
        }

        // Approach 4: Try hex decoding if the string looks like hex
        try {
            if (/^[0-9a-fA-F]+$/.test(articleId)) {
                const decoded = Buffer.from(articleId, 'hex').toString('utf-8');
                const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\x00-\x1f]+/);
                if (urlMatch && !urlMatch[0].includes('google.com')) {
                    log.debug(`Successfully decoded with hex: ${urlMatch[0]}`);
                    return urlMatch[0];
                }
            }
        } catch (e) {
            log.debug('Hex decode failed:', e.message);
        }

        log.debug('All decoding approaches failed, returning original URL');
        return googleNewsUrl;
    } catch (error) {
        log.debug('Error in decodeGoogleNewsUrl:', error.message);
        return googleNewsUrl;
    }
}

/**
 * Resolve Google News URL using browser automation to follow redirects
 * @param {string} googleNewsUrl - Google News article URL
 * @param {object} page - Playwright page instance
 * @returns {Promise<string>} Resolved article URL or original URL if resolution fails
 */
export async function resolveGoogleNewsUrlWithBrowser(googleNewsUrl, page) {
    try {
        log.debug(`Attempting browser resolution for: ${googleNewsUrl}`);

        // Navigate to the Google News URL
        const response = await page.goto(googleNewsUrl, {
            waitUntil: 'networkidle',
            timeout: 15000
        });

        if (!response) {
            log.debug('No response received from Google News URL');
            return googleNewsUrl;
        }

        // Wait a bit for any redirects to complete
        await page.waitForTimeout(2000);

        // Get the final URL after redirects
        const finalUrl = page.url();

        // Check if we were redirected to the actual article
        if (finalUrl !== googleNewsUrl && !finalUrl.includes('news.google.com')) {
            log.debug(`Successfully resolved to: ${finalUrl}`);
            return finalUrl;
        }

        // Try to find and click on the article link if we're still on Google News
        if (finalUrl.includes('news.google.com')) {
            try {
                // Look for article links on the page
                const articleLink = await page.$('a[href*="http"]:not([href*="google.com"])');
                if (articleLink) {
                    const href = await articleLink.getAttribute('href');
                    if (href && !href.includes('google.com')) {
                        log.debug(`Found article link on page: ${href}`);
                        return href;
                    }
                }
            } catch (e) {
                log.debug('Failed to find article link on Google News page:', e.message);
            }
        }

        log.debug('Browser resolution did not find a different URL');
        return googleNewsUrl;
    } catch (error) {
        log.debug('Error in browser URL resolution:', error.message);
        return googleNewsUrl;
    }
}

export default {
    buildFeedUrl,
    extractRealUrl,
    validateImageUrl,
    extractImages,
    sleep,
    formatDate,
    getDateRanges,
    cleanText,
    cleanHtmlContent,
    validateContentQuality,
    decodeGoogleNewsUrl,
    resolveGoogleNewsUrlWithBrowser,
};
