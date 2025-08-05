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

    // Temporarily disable date filters as Google News RSS doesn't support them
    // TODO: Implement date filtering after RSS fetch by parsing article dates
    // if (dateFrom && dateTo) {
    //     searchQuery += ` after:${dateFrom} before:${dateTo}`;
    // } else if (dateFrom) {
    //     searchQuery += ` after:${dateFrom}`;
    // } else if (dateTo) {
    //     searchQuery += ` before:${dateTo}`;
    // }

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
            // This is a complex encoded URL that needs browser handling
            log.debug(`Complex Google News URL format: ${googleNewsUrl}`);
            return googleNewsUrl;
        }

        return googleNewsUrl;
    } catch (error) {
        log.error(`Error extracting real URL from ${googleNewsUrl}:`, error.message || error);
        return googleNewsUrl;
    }
}

/**
 * Validate if an image URL is accessible and returns valid dimensions
 * @param {string} imageUrl - Image URL to validate
 * @param {object} gotScraping - Got scraping instance
 * @returns {Promise<boolean>} True if image is valid
 */
export async function validateImageUrl(imageUrl, gotScraping) {
    try {
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
        return false;
    }
}

/**
 * Extract and deduplicate images from various sources
 * @param {object} unfluffData - Unfluff extracted data
 * @param {object} $ - Cheerio instance
 * @returns {Array<string>} Array of unique image URLs
 */
export function extractImages(unfluffData, $ = null) {
    const images = new Set();

    // Add image from unfluff
    if (unfluffData.image) {
        images.add(unfluffData.image);
    }

    // Only extract from DOM if Cheerio instance is available
    if ($) {
        // Add Open Graph images
        $('meta[property="og:image"]').each((_, element) => {
            const content = $(element).attr('content');
            if (content) {
                images.add(content);
            }
        });

        // Add Twitter card images
        $('meta[name="twitter:image"]').each((_, element) => {
            const content = $(element).attr('content');
            if (content) {
                images.add(content);
            }
        });

        // Add first image from article content
        const firstArticleImg = $('article img, .article img, .content img, .post img').first().attr('src');
        if (firstArticleImg) {
            images.add(firstArticleImg);
        }
    }

    // Convert relative URLs to absolute URLs
    const absoluteImages = Array.from(images).map(img => {
        try {
            return new URL(img).href;
        } catch {
            // If it's a relative URL, we'd need the base URL to convert it
            // For now, we'll skip relative URLs
            return null;
        }
    }).filter(Boolean);

    return absoluteImages;
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
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    return date.toISOString().split('T')[0];
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
    // Temporary fix: use 2024 dates instead of system date (which is set to 2025)
    const currentDate = new Date('2024-08-05');
    const endDate = dateTo ? new Date(dateTo) : currentDate;
    const startDate = dateFrom ? new Date(dateFrom) : new Date(endDate.getTime() - (maxDays * 24 * 60 * 60 * 1000));

    let iterDate = new Date(endDate);

    while (iterDate >= startDate) {
        const nextDate = new Date(iterDate.getTime() - (24 * 60 * 60 * 1000));
        ranges.push({
            from: formatDate(nextDate),
            to: formatDate(iterDate),
        });
        iterDate = nextDate;
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
        .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
        .replace(/\n+/g, '\n') // Replace multiple newlines with single newline
        .trim();
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

        // Google News uses a specific encoding format
        // Try multiple decoding approaches

        // Approach 1: Direct base64 decode
        try {
            const decoded = Buffer.from(articleId, 'base64').toString('utf-8');
            const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\x00-\x1f]+/);
            if (urlMatch && !urlMatch[0].includes('google.com')) {
                return urlMatch[0];
            }
        } catch (e) {
            // Continue to next approach
        }

        // Approach 2: Try to decode as URL-safe base64
        try {
            const urlSafeDecoded = articleId.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(urlSafeDecoded, 'base64').toString('utf-8');
            const urlMatch = decoded.match(/https?:\/\/[^\s"'<>\x00-\x1f]+/);
            if (urlMatch && !urlMatch[0].includes('google.com')) {
                return urlMatch[0];
            }
        } catch (e) {
            // Continue to next approach
        }

        // Approach 3: Try to extract from the encoded string using patterns
        try {
            // Look for common URL patterns in the encoded string
            const patterns = [
                /CBM[a-zA-Z0-9+\/=]*([a-zA-Z0-9+\/=]*)(https?:\/\/[^\s"'<>]+)/,
                /(https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s"'<>]*)/
            ];

            for (const pattern of patterns) {
                const match = articleId.match(pattern);
                if (match && match[1] && !match[1].includes('google.com')) {
                    return match[1];
                }
            }
        } catch (e) {
            // Continue
        }

        return googleNewsUrl;
    } catch (error) {
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
    decodeGoogleNewsUrl,
};
