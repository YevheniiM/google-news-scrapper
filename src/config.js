/**
 * Configuration constants for the Google News scraper
 */

export const CONFIG = {
    // Google News RSS configuration
    RSS: {
        BASE_URL: 'https://news.google.com/rss/search',
        DEFAULT_LANGUAGE: 'en-US',
        DEFAULT_REGION: 'US',
        MAX_ITEMS_PER_FEED: 100, // Google's typical limit
        REQUEST_TIMEOUT: 30000,
        RATE_LIMIT_DELAY: 200, // ms between RSS requests
    },

    // Article crawling configuration
    CRAWLER: {
        MAX_CONCURRENCY: 10,
        REQUEST_TIMEOUT: 60000,
        MAX_RETRIES: 2,
        RATE_LIMIT_DELAY: 100, // ms between article requests
        USER_AGENTS: [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        ],
        DEFAULT_USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },

    // Proxy configuration
    PROXY: {
        GOOGLE_SERP_GROUP: 'GOOGLE_SERP',
        RESIDENTIAL_GROUP: 'RESIDENTIAL',
        DATACENTER_GROUP: 'DATACENTER',
        SESSION_MAX_USAGE: 5,
        SESSION_MAX_ERROR_SCORE: 3,
        // Residential proxy settings for bypassing anti-bot measures
        RESIDENTIAL_ENABLED: true,
        RESIDENTIAL_COUNTRIES: ['US', 'GB', 'CA', 'AU'],
        RESIDENTIAL_STICKY_SESSION: true,
        RESIDENTIAL_ROTATION_INTERVAL: 300000, // 5 minutes
        // Fallback proxy settings
        DATACENTER_FALLBACK: true,
        PROXY_TIMEOUT: 30000,
        MAX_PROXY_RETRIES: 3,
    },

    // Session management configuration
    SESSION: {
        MAX_POOL_SIZE: 50,
        MAX_USAGE_COUNT: 10,
        MAX_ERROR_SCORE: 5,
        SESSION_ROTATION_RATIO: 0.2, // 20% of requests use new sessions
        COOKIE_PERSISTENCE: true,
        BLOCKED_STATUS_CODES: [403, 429, 503],
        CONSENT_PAGE_INDICATORS: [
            'Before you continue',
            'consent',
            'privacy policy',
            'accept cookies',
            'cookie consent',
        ],
    },

    // Image validation configuration
    IMAGE: {
        VALIDATION_TIMEOUT: 15000,
        MAX_CONCURRENT_VALIDATIONS: 5,
        ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
        MIN_SIZE: 100, // minimum width/height in pixels
    },

    // Date range configuration
    DATE: {
        MAX_DAYS_BACK: 30,
        DATE_FORMAT: 'YYYY-MM-DD',
    },

    // Storage configuration
    STORAGE: {
        RSS_ITEMS_KEY: 'RSS_ITEMS',
        FAILED_URLS_KEY: 'FAILED_URLS',
        PROGRESS_KEY: 'PROGRESS',
        LAST_DATE_KEY: 'LAST_DATE_CHECKED',
    },

    // Logging configuration
    LOGGING: {
        LEVEL: 'INFO',
        STATISTICS_INTERVAL: 60, // seconds
        PROGRESS_INTERVAL: 100, // items
    },

    // Retry configuration
    RETRY: {
        MAX_RETRIES: 3,
        BASE_DELAY: 1000, // 1 second
        MAX_DELAY: 30000, // 30 seconds
        BACKOFF_MULTIPLIER: 2,
        JITTER_FACTOR: 0.1,
    },

    // Circuit breaker configuration
    CIRCUIT_BREAKER: {
        FAILURE_THRESHOLD: 5,
        SUCCESS_THRESHOLD: 3,
        TIMEOUT: 60000, // 1 minute
        MONITOR_WINDOW: 300000, // 5 minutes
    },

    // Error handling configuration
    ERROR_HANDLING: {
        MAX_CONSECUTIVE_FAILURES: 10,
        FAILURE_RATE_THRESHOLD: 0.5, // 50%
        RECOVERY_DELAY: 30000, // 30 seconds
        LOG_ERRORS: true,
        SAVE_FAILED_REQUESTS: true,
    },
};

export default CONFIG;
