/**
 * Debug Logger
 * Enhanced logging and debugging capabilities for local development
 */

import fs from 'fs/promises';
import path from 'path';
import { log } from 'crawlee';
import { DEV_CONFIG } from './dev-config.js';

export class DebugLogger {
    constructor() {
        this.logLevel = DEV_CONFIG.LOGGING.LEVEL;
        this.logToFile = DEV_CONFIG.LOGGING.TO_FILE;
        this.logFilePath = DEV_CONFIG.LOGGING.FILE_PATH;
        this.enableColors = DEV_CONFIG.LOGGING.ENABLE_COLORS;
        this.debugMode = DEV_CONFIG.DEBUG;
        
        this.logBuffer = [];
        this.maxBufferSize = 1000;
        this.flushInterval = 5000; // 5 seconds
        
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3,
            TRACE: 4,
        };
        
        this.colors = {
            ERROR: '\x1b[31m', // Red
            WARN: '\x1b[33m',  // Yellow
            INFO: '\x1b[36m',  // Cyan
            DEBUG: '\x1b[35m', // Magenta
            TRACE: '\x1b[37m', // White
            RESET: '\x1b[0m',
        };
        
        this.startFlushTimer();
    }

    /**
     * Initialize debug logger
     */
    async initialize() {
        if (this.logToFile) {
            await this.ensureLogDirectory();
        }
        
        // Override crawlee logger if in debug mode
        if (this.debugMode) {
            this.overrideCrawleeLogger();
        }
        
        this.info('Debug logger initialized', {
            logLevel: this.logLevel,
            logToFile: this.logToFile,
            debugMode: this.debugMode,
        });
    }

    /**
     * Ensure log directory exists
     */
    async ensureLogDirectory() {
        const logDir = path.dirname(this.logFilePath);
        try {
            await fs.mkdir(logDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.error('Failed to create log directory:', error.message);
            }
        }
    }

    /**
     * Override crawlee logger for enhanced debugging
     */
    overrideCrawleeLogger() {
        const originalLog = log;
        
        // Enhance existing log methods
        ['error', 'warning', 'info', 'debug'].forEach(level => {
            const originalMethod = originalLog[level];
            originalLog[level] = (message, data = {}) => {
                // Call original method
                originalMethod.call(originalLog, message, data);
                
                // Add our enhanced logging
                this.log(level.toUpperCase(), message, data, {
                    source: 'crawlee',
                    stack: new Error().stack,
                });
            };
        });
    }

    /**
     * Log message with specified level
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {object} data - Additional data
     * @param {object} options - Logging options
     */
    log(level, message, data = {}, options = {}) {
        const levelNum = this.logLevels[level] || this.logLevels.INFO;
        const currentLevelNum = this.logLevels[this.logLevel] || this.logLevels.INFO;
        
        if (levelNum > currentLevelNum) {
            return; // Skip if level is too verbose
        }

        const logEntry = this.createLogEntry(level, message, data, options);
        
        // Console output
        this.outputToConsole(logEntry);
        
        // File output
        if (this.logToFile) {
            this.addToBuffer(logEntry);
        }
    }

    /**
     * Create log entry object
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {object} data - Additional data
     * @param {object} options - Logging options
     * @returns {object} Log entry
     */
    createLogEntry(level, message, data, options) {
        const timestamp = new Date().toISOString();
        const caller = this.getCallerInfo(options.stack);
        
        return {
            timestamp,
            level,
            message,
            data: this.sanitizeData(data),
            caller,
            source: options.source || 'app',
            pid: process.pid,
            memory: this.getMemoryUsage(),
        };
    }

    /**
     * Output log entry to console
     * @param {object} logEntry - Log entry
     */
    outputToConsole(logEntry) {
        const color = this.enableColors ? this.colors[logEntry.level] : '';
        const reset = this.enableColors ? this.colors.RESET : '';
        const timestamp = logEntry.timestamp.substring(11, 23); // HH:mm:ss.SSS
        
        let output = `${color}[${timestamp}] ${logEntry.level}${reset} ${logEntry.message}`;
        
        if (this.debugMode && logEntry.caller) {
            output += ` ${color}(${logEntry.caller})${reset}`;
        }
        
        console.log(output);
        
        // Output data if present and in debug mode
        if (this.debugMode && Object.keys(logEntry.data).length > 0) {
            console.log(`${color}Data:${reset}`, logEntry.data);
        }
        
        // Output memory usage if in trace mode
        if (this.logLevel === 'TRACE') {
            console.log(`${color}Memory:${reset}`, logEntry.memory);
        }
    }

    /**
     * Add log entry to buffer for file writing
     * @param {object} logEntry - Log entry
     */
    addToBuffer(logEntry) {
        this.logBuffer.push(logEntry);
        
        if (this.logBuffer.length >= this.maxBufferSize) {
            this.flushBuffer();
        }
    }

    /**
     * Flush log buffer to file
     */
    async flushBuffer() {
        if (this.logBuffer.length === 0) return;
        
        try {
            const logLines = this.logBuffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await fs.appendFile(this.logFilePath, logLines);
            this.logBuffer = [];
        } catch (error) {
            console.error('Failed to write log file:', error.message);
        }
    }

    /**
     * Start flush timer
     */
    startFlushTimer() {
        setInterval(() => {
            this.flushBuffer();
        }, this.flushInterval);
    }

    /**
     * Get caller information from stack trace
     * @param {string} stack - Stack trace
     * @returns {string} Caller info
     */
    getCallerInfo(stack) {
        if (!stack || !this.debugMode) return null;
        
        const lines = stack.split('\n');
        // Skip first 3 lines (Error, this function, log function)
        const callerLine = lines[3];
        
        if (callerLine) {
            const match = callerLine.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);
            if (match) {
                const [, func, file, line] = match;
                const fileName = path.basename(file);
                return `${func} ${fileName}:${line}`;
            }
        }
        
        return null;
    }

    /**
     * Sanitize data for logging
     * @param {any} data - Data to sanitize
     * @returns {any} Sanitized data
     */
    sanitizeData(data) {
        if (typeof data !== 'object' || data === null) {
            return data;
        }
        
        const sanitized = {};
        
        for (const [key, value] of Object.entries(data)) {
            // Skip sensitive data
            if (this.isSensitiveKey(key)) {
                sanitized[key] = '[REDACTED]';
                continue;
            }
            
            // Truncate long strings
            if (typeof value === 'string' && value.length > 500) {
                sanitized[key] = value.substring(0, 500) + '... [TRUNCATED]';
                continue;
            }
            
            // Handle nested objects
            if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeData(value);
                continue;
            }
            
            sanitized[key] = value;
        }
        
        return sanitized;
    }

    /**
     * Check if key contains sensitive information
     * @param {string} key - Key to check
     * @returns {boolean} Whether key is sensitive
     */
    isSensitiveKey(key) {
        const sensitiveKeys = [
            'password', 'token', 'key', 'secret', 'auth',
            'cookie', 'session', 'credential', 'api_key',
        ];
        
        const lowerKey = key.toLowerCase();
        return sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
    }

    /**
     * Get current memory usage
     * @returns {object} Memory usage info
     */
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
        };
    }

    // Convenience methods
    error(message, data = {}) {
        this.log('ERROR', message, data);
    }

    warn(message, data = {}) {
        this.log('WARN', message, data);
    }

    info(message, data = {}) {
        this.log('INFO', message, data);
    }

    debug(message, data = {}) {
        this.log('DEBUG', message, data);
    }

    trace(message, data = {}) {
        this.log('TRACE', message, data);
    }

    /**
     * Log performance timing
     * @param {string} operation - Operation name
     * @param {number} startTime - Start time
     * @param {object} data - Additional data
     */
    timing(operation, startTime, data = {}) {
        const duration = Date.now() - startTime;
        this.debug(`Performance: ${operation}`, {
            duration: `${duration}ms`,
            ...data,
        });
    }

    /**
     * Log HTTP request/response
     * @param {object} request - Request info
     * @param {object} response - Response info
     * @param {number} duration - Request duration
     */
    httpLog(request, response, duration) {
        const level = response.statusCode >= 400 ? 'WARN' : 'DEBUG';
        this.log(level, `HTTP ${request.method} ${request.url}`, {
            statusCode: response.statusCode,
            duration: `${duration}ms`,
            requestHeaders: request.headers,
            responseHeaders: response.headers,
        });
    }

    /**
     * Create a debug session for tracking related operations
     * @param {string} sessionId - Session identifier
     * @returns {object} Debug session
     */
    createSession(sessionId) {
        return {
            id: sessionId,
            startTime: Date.now(),
            
            log: (level, message, data = {}) => {
                this.log(level, `[${sessionId}] ${message}`, data);
            },
            
            error: (message, data = {}) => {
                this.error(`[${sessionId}] ${message}`, data);
            },
            
            warn: (message, data = {}) => {
                this.warn(`[${sessionId}] ${message}`, data);
            },
            
            info: (message, data = {}) => {
                this.info(`[${sessionId}] ${message}`, data);
            },
            
            debug: (message, data = {}) => {
                this.debug(`[${sessionId}] ${message}`, data);
            },
            
            end: () => {
                const duration = Date.now() - this.startTime;
                this.info(`[${sessionId}] Session ended`, { duration: `${duration}ms` });
            },
        };
    }

    /**
     * Get log statistics
     * @returns {object} Log statistics
     */
    getStats() {
        return {
            bufferSize: this.logBuffer.length,
            maxBufferSize: this.maxBufferSize,
            logLevel: this.logLevel,
            logToFile: this.logToFile,
            debugMode: this.debugMode,
        };
    }

    /**
     * Shutdown logger gracefully
     */
    async shutdown() {
        await this.flushBuffer();
        this.info('Debug logger shutdown');
    }
}

// Global debug logger instance
export const debugLogger = new DebugLogger();
