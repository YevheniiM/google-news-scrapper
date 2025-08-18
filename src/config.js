/**
 * Unified Configuration for Google News Scraper
 * Environment-aware configuration that works for both production and development
 */

import { config } from 'dotenv';

// Load environment variables
config();

// Environment detection
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DEVELOPMENT = NODE_ENV === 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const DEBUG = process.env.DEBUG === 'true' || IS_DEVELOPMENT;

export const CONFIG = {
    // Environment settings
    ENVIRONMENT: {
        NODE_ENV,
        IS_DEVELOPMENT,
        IS_PRODUCTION,
        DEBUG,
    },

    // Google News RSS configuration
    RSS: {
        BASE_URL: 'https://news.google.com/rss/search',
        DEFAULT_LANGUAGE: 'en-US',
        DEFAULT_REGION: 'US',
        MAX_ITEMS_PER_FEED: IS_DEVELOPMENT ? 20 : 100, // Smaller limit for dev
        REQUEST_TIMEOUT: 30000,
        RATE_LIMIT_DELAY: IS_DEVELOPMENT ? 100 : 200, // Faster for dev
    },

    // Article crawling configuration - Environment-aware
    CRAWLER: {
        MAX_CONCURRENCY: IS_DEVELOPMENT ? 1 : 3, // Single thread for dev
        REQUEST_TIMEOUT: 30000,
        MAX_RETRIES: IS_DEVELOPMENT ? 0 : 1, // No retries in dev
        RATE_LIMIT_DELAY: IS_DEVELOPMENT ? 100 : 300,
        USER_AGENTS: [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        ],
        DEFAULT_USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },

    // Proxy configuration - Environment-aware
    PROXY: {
        RESIDENTIAL_ENABLED: IS_PRODUCTION, // Only use residential in production
        DATACENTER_FALLBACK: true,
        PROXY_TIMEOUT: 30000,
        MAX_PROXY_RETRIES: IS_DEVELOPMENT ? 1 : 2,
        SESSION_MAX_USAGE: IS_DEVELOPMENT ? 5 : 10,
        SESSION_MAX_ERROR_SCORE: 3,
        RESIDENTIAL_ROTATION_INTERVAL: IS_DEVELOPMENT ? 30000 : 60000, // 30s dev, 1min prod
    },

    // Session management configuration
    SESSION: {
        MAX_POOL_SIZE: IS_DEVELOPMENT ? 10 : 50,
        MAX_USAGE_COUNT: IS_DEVELOPMENT ? 5 : 10,
        MAX_ERROR_SCORE: 5,
        SESSION_ROTATION_RATIO: 0.2,
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

    // Image validation configuration - Environment-aware
    IMAGE: {
        VALIDATION_TIMEOUT: IS_DEVELOPMENT ? 2000 : 5000,
        MAX_CONCURRENT_VALIDATIONS: IS_DEVELOPMENT ? 1 : 2,
        ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg'],
        MIN_SIZE: 100,
        SKIP_VALIDATION: IS_DEVELOPMENT, // Skip validation in dev for speed
    },

    // Date range configuration
    DATE: {
        MAX_DAYS_BACK: IS_DEVELOPMENT ? 7 : 30, // Shorter range for dev
        DATE_FORMAT: 'YYYY-MM-DD',
    },

    // Storage configuration - Environment-aware
    STORAGE: {
        RSS_ITEMS_KEY: 'RSS_ITEMS',
        FAILED_URLS_KEY: 'FAILED_URLS',
        PROGRESS_KEY: 'PROGRESS',
        LAST_DATE_KEY: 'LAST_DATE_CHECKED',
        // Development-specific storage
        LOCAL_STORAGE_DIR: process.env.LOCAL_STORAGE_DIR || './storage',
        ENABLE_LOCAL_STORAGE: IS_DEVELOPMENT,
        AUTO_CLEANUP: IS_DEVELOPMENT,
        MAX_SIZE_MB: IS_DEVELOPMENT ? 50 : 100,
    },

    // Logging configuration - Environment-aware
    LOGGING: {
        LEVEL: IS_DEVELOPMENT ? 'DEBUG' : (process.env.LOG_LEVEL || 'INFO'),
        STATISTICS_INTERVAL: IS_DEVELOPMENT ? 30 : 60, // More frequent in dev
        PROGRESS_INTERVAL: IS_DEVELOPMENT ? 10 : 100,
        TO_FILE: process.env.LOG_TO_FILE === 'true' || IS_PRODUCTION,
        FILE_PATH: process.env.LOG_FILE_PATH || './logs/scraper.log',
        ENABLE_COLORS: IS_DEVELOPMENT,
        TIMESTAMP_FORMAT: 'YYYY-MM-DD HH:mm:ss',
    },

    // Retry configuration
    RETRY: {
        MAX_RETRIES: IS_DEVELOPMENT ? 1 : 3,
        BASE_DELAY: 1000,
        MAX_DELAY: IS_DEVELOPMENT ? 10000 : 30000,
        BACKOFF_MULTIPLIER: 2,
        JITTER_FACTOR: 0.1,
    },

    // Circuit breaker configuration
    CIRCUIT_BREAKER: {
        FAILURE_THRESHOLD: IS_DEVELOPMENT ? 3 : 5,
        SUCCESS_THRESHOLD: 3,
        TIMEOUT: IS_DEVELOPMENT ? 30000 : 60000,
        MONITOR_WINDOW: IS_DEVELOPMENT ? 60000 : 300000,
    },

    // Error handling configuration
    ERROR_HANDLING: {
        MAX_CONSECUTIVE_FAILURES: IS_DEVELOPMENT ? 3 : 10,
        FAILURE_RATE_THRESHOLD: 0.5,
        SAVE_FAILED_REQUESTS: true,
        RECOVERY_DELAY: IS_DEVELOPMENT ? 1000 : 2000,
    },

    // COST OPTIMIZATION SETTINGS - Environment-aware
    COST_OPTIMIZATION: {
        // Browser usage - most expensive resource
        USE_BROWSER_BY_DEFAULT: false, // Never use by default
        BROWSER_DETECTION_ENABLED: !IS_DEVELOPMENT, // Disable in dev

        // Content extraction optimization
        SINGLE_EXTRACTION_STRATEGY: false, // Try all strategies to improve robustness
        SKIP_CONTENT_VALIDATION: false, // Always validate content quality

        // Resource limits
        MAX_MEMORY_USAGE_MB: IS_DEVELOPMENT ? 256 : 512,
        MAX_EXECUTION_TIME_MS: IS_DEVELOPMENT ? 60000 : 300000, // 1min dev, 5min prod

        // Cost tracking
        ENABLE_COST_TRACKING: IS_PRODUCTION,
        COST_ALERT_THRESHOLD: 0.50,
    },

	    // Consent handling configuration
	    CONSENT_HANDLING: {
	        WAIT_AFTER_CLICK_MS: 1000,
	        GENERIC_SELECTORS: [
	            '#onetrust-accept-btn-handler',
	            'button#onetrust-accept-btn-handler',
	            'button[aria-label*="accept" i]',
	            'button[aria-label*="agree" i]',
	            'button:has-text("Accept")',
	            'button:has-text("I agree")',
	            'button:has-text("Agree")',
	            'button:has-text("OK")',
	            '.fc-cta-consent',
	            '.js-consent-banner .accept',
	            'button[class*="accept"]',
	        ],
	        DOMAIN_SELECTORS: {
	            'www.malaymail.com': [
	                '#onetrust-accept-btn-handler',
	                'button:has-text("Accept")',
	                'button:has-text("I agree")'
	            ],
	            'www.bbc.com': [
	                'button#bbccookies-continue-button',
	                'button:has-text("Yes, I agree")'
	            ],
	            'www.reuters.com': [
	                'button#onetrust-accept-btn-handler'
	            ],
	            'edition.cnn.com': [
	                'button:has-text("I Agree")',
	                '#onetrust-accept-btn-handler'
	            ]
	        }
	    },

    // Development-specific settings
    DEVELOPMENT: IS_DEVELOPMENT ? {
        // Mock Data
        MOCK: {
            ENABLED: process.env.USE_MOCK_DATA === 'true',
            DATA_DIR: process.env.MOCK_DATA_DIR || './dev/mock-data',
            RSS_FEEDS: true,
            ARTICLES: true,
            IMAGES: true,
        },

        // Development Server
        SERVER: {
            PORT: parseInt(process.env.DEV_SERVER_PORT) || 3000,
            HOST: process.env.DEV_SERVER_HOST || 'localhost',
            ENABLE_CORS: true,
            ENABLE_COMPRESSION: true,
        },

        // Testing
        TESTING: {
            ENABLED: process.env.ENABLE_TESTING === 'true',
            SCENARIOS_DIR: process.env.SCENARIOS_DIR || './dev/scenarios',
            AUTO_RUN_TESTS: false,
            GENERATE_REPORTS: true,
        },

        // Monitoring
        MONITORING: {
            ENABLED: process.env.ENABLE_DEV_MONITORING === 'true',
            INTERVAL: 10000, // 10 seconds
            METRICS_ENDPOINT: process.env.METRICS_ENDPOINT,
            HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
        },

        // Local Database
        DATABASE: {
            PATH: process.env.LOCAL_DB_PATH || './dev/database.json',
            ENABLED: process.env.ENABLE_LOCAL_DB === 'true',
            AUTO_BACKUP: true,
            BACKUP_INTERVAL: 300000, // 5 minutes
        },

        // API Keys
        API_KEYS: {
            GOOGLE: process.env.GOOGLE_API_KEY,
            PROXY: process.env.PROXY_API_KEY,
        },

        // Notifications
        NOTIFICATIONS: {
            ENABLED: process.env.ENABLE_DESKTOP_NOTIFICATIONS === 'true',
            LEVEL: process.env.NOTIFICATION_LEVEL || 'INFO',
            SOUND: true,
        },

        // Resource Limits
        LIMITS: {
            MAX_MEMORY_MB: parseInt(process.env.MAX_MEMORY_USAGE) || 256,
            MAX_CONCURRENT_REQUESTS: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 2,
            REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 15000,
        },
    } : {},
};
