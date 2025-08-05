/**
 * Development Configuration
 * Enhanced configuration for local development and testing
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

export const DEV_CONFIG = {
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development',
    DEBUG: process.env.DEBUG === 'true',
    
    // Logging
    LOGGING: {
        LEVEL: process.env.LOG_LEVEL || 'DEBUG',
        TO_FILE: process.env.LOG_TO_FILE === 'true',
        FILE_PATH: process.env.LOG_FILE_PATH || './logs/scraper.log',
        ENABLE_COLORS: true,
        TIMESTAMP_FORMAT: 'YYYY-MM-DD HH:mm:ss',
    },
    
    // Local Storage
    STORAGE: {
        DIR: process.env.LOCAL_STORAGE_DIR || './storage',
        ENABLED: process.env.ENABLE_LOCAL_STORAGE === 'true',
        AUTO_CLEANUP: true,
        MAX_SIZE_MB: 100,
    },
    
    // Development Server
    SERVER: {
        PORT: parseInt(process.env.DEV_SERVER_PORT) || 3000,
        HOST: process.env.DEV_SERVER_HOST || 'localhost',
        ENABLE_CORS: true,
        ENABLE_COMPRESSION: true,
    },
    
    // Mock Data
    MOCK: {
        ENABLED: process.env.USE_MOCK_DATA === 'true',
        DATA_DIR: process.env.MOCK_DATA_DIR || './dev/mock-data',
        RSS_FEEDS: true,
        ARTICLES: true,
        IMAGES: true,
    },
    
    // Testing
    TESTING: {
        MODE: process.env.TEST_MODE === 'true',
        DATA_DIR: process.env.TEST_DATA_DIR || './dev/test-data',
        ENABLE_LOGGING: process.env.ENABLE_TEST_LOGGING === 'true',
        TIMEOUT: 30000,
        PARALLEL: false,
    },
    
    // Performance Monitoring
    PERFORMANCE: {
        ENABLED: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',
        LOG_INTERVAL: parseInt(process.env.PERFORMANCE_LOG_INTERVAL) || 30000,
        MEMORY_THRESHOLD: 80, // Percentage
        CPU_THRESHOLD: 80, // Percentage
    },
    
    // Error Handling
    ERROR_HANDLING: {
        RECOVERY_ENABLED: process.env.ENABLE_ERROR_RECOVERY === 'true',
        SAVE_LOGS: process.env.SAVE_ERROR_LOGS === 'true',
        LOG_DIR: process.env.ERROR_LOG_DIR || './logs/errors',
        MAX_LOG_FILES: 50,
    },
    
    // Browser Configuration
    BROWSER: {
        HEADLESS: process.env.BROWSER_HEADLESS !== 'false',
        DEVTOOLS: process.env.BROWSER_DEVTOOLS === 'true',
        SLOW_MO: parseInt(process.env.BROWSER_SLOW_MO) || 0,
        VIEWPORT: { width: 1920, height: 1080 },
        USER_DATA_DIR: './dev/browser-data',
    },
    
    // Proxy Configuration
    PROXY: {
        HTTP: process.env.HTTP_PROXY,
        HTTPS: process.env.HTTPS_PROXY,
        ENABLED: !!(process.env.HTTP_PROXY || process.env.HTTPS_PROXY),
    },
    
    // Rate Limiting
    RATE_LIMITING: {
        ENABLED: process.env.ENABLE_RATE_LIMITING === 'true',
        REQUEST_DELAY: parseInt(process.env.DEV_REQUEST_DELAY) || 1000,
        MAX_CONCURRENT: 3,
    },
    
    // Cache Configuration
    CACHE: {
        ENABLED: process.env.ENABLE_CACHE === 'true',
        TTL: parseInt(process.env.CACHE_TTL) || 3600000, // 1 hour
        DIR: process.env.CACHE_DIR || './cache',
        MAX_SIZE_MB: 50,
    },
    
    // Development Features
    FEATURES: {
        HOT_RELOAD: process.env.ENABLE_HOT_RELOAD === 'true',
        DEBUG_UI: process.env.ENABLE_DEBUG_UI === 'true',
        METRICS_DASHBOARD: process.env.ENABLE_METRICS_DASHBOARD === 'true',
        AUTO_RESTART: true,
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
        MAX_MEMORY_MB: parseInt(process.env.MAX_MEMORY_USAGE) || 512,
        MAX_CONCURRENT_REQUESTS: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 5,
        REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
    },
    
    // Security
    SECURITY: {
        DISABLE_SSL_VERIFICATION: process.env.DISABLE_SSL_VERIFICATION === 'true',
        ALLOW_INSECURE_CONNECTIONS: process.env.ALLOW_INSECURE_CONNECTIONS === 'true',
    },
    
    // Paths
    PATHS: {
        ROOT: path.resolve(__dirname, '..'),
        SRC: path.resolve(__dirname),
        LOGS: path.resolve(__dirname, '../logs'),
        STORAGE: path.resolve(__dirname, '../storage'),
        CACHE: path.resolve(__dirname, '../cache'),
        DEV: path.resolve(__dirname, '../dev'),
        TESTS: path.resolve(__dirname, '../tests'),
    },
};

/**
 * Get development configuration
 * @returns {object} Development configuration
 */
export function getDevConfig() {
    return DEV_CONFIG;
}

/**
 * Check if running in development mode
 * @returns {boolean} Whether in development mode
 */
export function isDevelopment() {
    return DEV_CONFIG.NODE_ENV === 'development';
}

/**
 * Check if debug mode is enabled
 * @returns {boolean} Whether debug mode is enabled
 */
export function isDebugMode() {
    return DEV_CONFIG.DEBUG;
}

/**
 * Get configuration for specific feature
 * @param {string} feature - Feature name
 * @returns {object} Feature configuration
 */
export function getFeatureConfig(feature) {
    return DEV_CONFIG[feature.toUpperCase()] || {};
}

/**
 * Create directory if it doesn't exist
 * @param {string} dirPath - Directory path
 */
export async function ensureDirectory(dirPath) {
    try {
        const { mkdir } = await import('fs/promises');
        await mkdir(dirPath, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * Initialize development directories
 */
export async function initializeDevelopmentDirectories() {
    const directories = [
        DEV_CONFIG.PATHS.LOGS,
        DEV_CONFIG.PATHS.STORAGE,
        DEV_CONFIG.PATHS.CACHE,
        DEV_CONFIG.PATHS.DEV,
        DEV_CONFIG.STORAGE.DIR,
        DEV_CONFIG.ERROR_HANDLING.LOG_DIR,
        DEV_CONFIG.MOCK.DATA_DIR,
        DEV_CONFIG.TESTING.DATA_DIR,
        path.dirname(DEV_CONFIG.DATABASE.PATH),
    ];
    
    for (const dir of directories) {
        await ensureDirectory(dir);
    }
}

/**
 * Validate development configuration
 * @returns {Array} Array of validation errors
 */
export function validateDevConfig() {
    const errors = [];
    
    // Check required directories
    const requiredDirs = [
        DEV_CONFIG.STORAGE.DIR,
        DEV_CONFIG.MOCK.DATA_DIR,
        DEV_CONFIG.TESTING.DATA_DIR,
    ];
    
    for (const dir of requiredDirs) {
        if (!dir) {
            errors.push(`Missing required directory configuration: ${dir}`);
        }
    }
    
    // Check port availability
    if (DEV_CONFIG.SERVER.PORT < 1024 || DEV_CONFIG.SERVER.PORT > 65535) {
        errors.push(`Invalid server port: ${DEV_CONFIG.SERVER.PORT}`);
    }
    
    // Check memory limits
    if (DEV_CONFIG.LIMITS.MAX_MEMORY_MB < 128) {
        errors.push(`Memory limit too low: ${DEV_CONFIG.LIMITS.MAX_MEMORY_MB}MB`);
    }
    
    return errors;
}

export default DEV_CONFIG;
