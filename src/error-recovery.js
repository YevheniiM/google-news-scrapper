/**
 * Error Recovery System
 * Handles automatic recovery, state persistence, and failure recovery
 */

import { log } from 'crawlee';
import { Actor } from 'apify';
import { CONFIG } from './config.js';

export class ErrorRecoveryManager {
    constructor() {
        this.recoveryStrategies = new Map();
        this.persistentState = new Map();
        this.recoveryAttempts = new Map();
        this.checkpoints = [];
        this.maxCheckpoints = 10;
        this.recoveryInProgress = false;
        
        // Recovery configuration
        this.config = {
            maxRecoveryAttempts: 3,
            recoveryDelay: CONFIG.ERROR_HANDLING.RECOVERY_DELAY,
            checkpointInterval: 60000, // 1 minute
            stateBackupInterval: 300000, // 5 minutes
        };
        
        this.initializeRecoveryStrategies();
        this.startPeriodicBackup();
    }

    /**
     * Initialize recovery strategies
     */
    initializeRecoveryStrategies() {
        // RSS recovery strategy
        this.registerRecoveryStrategy('rss_failure', {
            detect: (error, context) => {
                return error.message?.includes('RSS') || 
                       context.operation === 'rss' ||
                       error.statusCode === 404;
            },
            recover: async (error, context) => {
                log.info('Attempting RSS recovery');
                
                // Try alternative RSS endpoints
                const alternatives = this.generateAlternativeRssUrls(context.url);
                for (const altUrl of alternatives) {
                    try {
                        context.url = altUrl;
                        return await context.retryOperation(context);
                    } catch (altError) {
                        log.debug(`Alternative RSS URL failed: ${altUrl}`);
                    }
                }
                
                // Use cached RSS data if available
                const cached = await this.getCachedData('rss', context.query);
                if (cached) {
                    log.info('Using cached RSS data for recovery');
                    return cached;
                }
                
                throw new Error('RSS recovery failed - no alternatives available');
            },
        });

        // Network recovery strategy
        this.registerRecoveryStrategy('network_failure', {
            detect: (error, context) => {
                const networkErrors = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
                return networkErrors.includes(error.code) ||
                       error.message?.toLowerCase().includes('network');
            },
            recover: async (error, context) => {
                log.info('Attempting network recovery');
                
                // Wait for network to stabilize
                await this.exponentialBackoff(1000, 3);
                
                // Try with different proxy or session
                if (context.session) {
                    context.session.markBad();
                }
                
                // Retry with reduced concurrency
                if (context.crawler) {
                    const originalConcurrency = context.crawler.maxConcurrency;
                    context.crawler.maxConcurrency = Math.max(1, Math.floor(originalConcurrency / 2));
                    
                    try {
                        return await context.retryOperation(context);
                    } finally {
                        context.crawler.maxConcurrency = originalConcurrency;
                    }
                }
                
                return await context.retryOperation(context);
            },
        });

        // Rate limit recovery strategy
        this.registerRecoveryStrategy('rate_limit', {
            detect: (error, context) => {
                return error.statusCode === 429 ||
                       error.message?.toLowerCase().includes('rate limit') ||
                       error.message?.toLowerCase().includes('too many requests');
            },
            recover: async (error, context) => {
                log.info('Attempting rate limit recovery');
                
                // Extract retry-after header if available
                const retryAfter = error.response?.headers['retry-after'];
                const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default 1 minute
                
                log.info(`Waiting ${delay}ms for rate limit recovery`);
                await this.sleep(delay);
                
                // Reduce request rate for future requests
                if (context.crawler) {
                    context.crawler.requestHandlerTimeoutMillis *= 2;
                }
                
                return await context.retryOperation(context);
            },
        });

        // Content extraction recovery strategy
        this.registerRecoveryStrategy('extraction_failure', {
            detect: (error, context) => {
                return error.message?.includes('extraction') ||
                       error.message?.includes('parsing') ||
                       context.operation === 'content_extraction';
            },
            recover: async (error, context) => {
                log.info('Attempting content extraction recovery');
                
                // Try with browser mode if not already using it
                if (!context.useBrowser) {
                    log.info('Switching to browser mode for recovery');
                    context.useBrowser = true;
                    return await context.retryOperation(context);
                }
                
                // Use simplified extraction
                if (context.html) {
                    return this.performSimplifiedExtraction(context.html, context.userData);
                }
                
                // Use RSS content as fallback
                if (context.userData) {
                    return this.createFallbackContent(context.userData);
                }
                
                throw new Error('Content extraction recovery failed');
            },
        });
    }

    /**
     * Register recovery strategy
     * @param {string} name - Strategy name
     * @param {object} strategy - Strategy implementation
     */
    registerRecoveryStrategy(name, strategy) {
        this.recoveryStrategies.set(name, strategy);
    }

    /**
     * Attempt error recovery
     * @param {Error} error - Error to recover from
     * @param {object} context - Error context
     * @returns {Promise<any>} Recovery result
     */
    async attemptRecovery(error, context) {
        if (this.recoveryInProgress) {
            log.warning('Recovery already in progress, skipping');
            throw error;
        }

        const recoveryKey = this.generateRecoveryKey(error, context);
        const attempts = this.recoveryAttempts.get(recoveryKey) || 0;
        
        if (attempts >= this.config.maxRecoveryAttempts) {
            log.error(`Max recovery attempts (${this.config.maxRecoveryAttempts}) exceeded for ${recoveryKey}`);
            throw error;
        }

        this.recoveryInProgress = true;
        this.recoveryAttempts.set(recoveryKey, attempts + 1);

        try {
            // Find applicable recovery strategy
            const strategy = this.findRecoveryStrategy(error, context);
            
            if (!strategy) {
                log.warning('No recovery strategy found for error:', error.message);
                throw error;
            }

            log.info(`Attempting recovery with strategy: ${strategy.name}`);
            
            // Wait before recovery attempt
            if (attempts > 0) {
                const delay = this.config.recoveryDelay * Math.pow(2, attempts);
                await this.sleep(delay);
            }

            const result = await strategy.recover(error, context);
            
            // Recovery successful
            log.info(`Recovery successful with strategy: ${strategy.name}`);
            this.recoveryAttempts.delete(recoveryKey);
            
            return result;
            
        } catch (recoveryError) {
            log.error(`Recovery failed: ${recoveryError.message}`);
            throw recoveryError;
        } finally {
            this.recoveryInProgress = false;
        }
    }

    /**
     * Find applicable recovery strategy
     * @param {Error} error - Error to recover from
     * @param {object} context - Error context
     * @returns {object|null} Recovery strategy
     */
    findRecoveryStrategy(error, context) {
        for (const [name, strategy] of this.recoveryStrategies) {
            if (strategy.detect(error, context)) {
                return { name, ...strategy };
            }
        }
        return null;
    }

    /**
     * Generate recovery key for tracking attempts
     * @param {Error} error - Error
     * @param {object} context - Context
     * @returns {string} Recovery key
     */
    generateRecoveryKey(error, context) {
        const errorType = error.constructor.name;
        const operation = context.operation || 'unknown';
        const url = context.url ? new URL(context.url).hostname : 'unknown';
        
        return `${errorType}_${operation}_${url}`;
    }

    /**
     * Create checkpoint of current state
     * @param {string} operation - Current operation
     * @param {object} state - State to checkpoint
     */
    async createCheckpoint(operation, state) {
        const checkpoint = {
            id: `checkpoint_${Date.now()}`,
            timestamp: new Date().toISOString(),
            operation,
            state: JSON.parse(JSON.stringify(state)), // Deep copy
        };

        this.checkpoints.push(checkpoint);
        
        // Keep only recent checkpoints
        if (this.checkpoints.length > this.maxCheckpoints) {
            this.checkpoints = this.checkpoints.slice(-this.maxCheckpoints);
        }

        // Save to persistent storage
        try {
            await Actor.setValue('RECOVERY_CHECKPOINTS', this.checkpoints);
        } catch (error) {
            log.debug('Failed to save checkpoint:', error.message);
        }

        log.debug(`Created checkpoint: ${checkpoint.id}`);
    }

    /**
     * Restore from checkpoint
     * @param {string} checkpointId - Checkpoint ID to restore
     * @returns {object|null} Restored state
     */
    async restoreFromCheckpoint(checkpointId) {
        const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
        
        if (!checkpoint) {
            log.warning(`Checkpoint ${checkpointId} not found`);
            return null;
        }

        log.info(`Restoring from checkpoint: ${checkpointId}`);
        return checkpoint.state;
    }

    /**
     * Get latest checkpoint for operation
     * @param {string} operation - Operation name
     * @returns {object|null} Latest checkpoint
     */
    getLatestCheckpoint(operation) {
        const operationCheckpoints = this.checkpoints
            .filter(cp => cp.operation === operation)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return operationCheckpoints[0] || null;
    }

    /**
     * Store persistent state
     * @param {string} key - State key
     * @param {any} value - State value
     */
    async storePersistentState(key, value) {
        this.persistentState.set(key, {
            value,
            timestamp: Date.now(),
        });

        // Save to Apify storage
        try {
            const stateData = Object.fromEntries(
                Array.from(this.persistentState.entries()).map(([k, v]) => [k, v])
            );
            await Actor.setValue('PERSISTENT_STATE', stateData);
        } catch (error) {
            log.debug('Failed to save persistent state:', error.message);
        }
    }

    /**
     * Get persistent state
     * @param {string} key - State key
     * @returns {any} State value
     */
    getPersistentState(key) {
        const stateData = this.persistentState.get(key);
        return stateData ? stateData.value : null;
    }

    /**
     * Load persistent state from storage
     */
    async loadPersistentState() {
        try {
            const stateData = await Actor.getValue('PERSISTENT_STATE');
            if (stateData) {
                for (const [key, value] of Object.entries(stateData)) {
                    this.persistentState.set(key, value);
                }
                log.info('Loaded persistent state from storage');
            }

            const checkpoints = await Actor.getValue('RECOVERY_CHECKPOINTS');
            if (checkpoints) {
                this.checkpoints = checkpoints;
                log.info(`Loaded ${checkpoints.length} checkpoints from storage`);
            }
        } catch (error) {
            log.debug('Failed to load persistent state:', error.message);
        }
    }

    /**
     * Start periodic backup
     */
    startPeriodicBackup() {
        setInterval(async () => {
            try {
                await this.backupState();
            } catch (error) {
                log.debug('Periodic backup failed:', error.message);
            }
        }, this.config.stateBackupInterval);
    }

    /**
     * Backup current state
     */
    async backupState() {
        const backup = {
            timestamp: new Date().toISOString(),
            persistentState: Object.fromEntries(this.persistentState),
            checkpoints: this.checkpoints,
            recoveryAttempts: Object.fromEntries(this.recoveryAttempts),
        };

        await Actor.setValue('STATE_BACKUP', backup);
        log.debug('State backup completed');
    }

    /**
     * Generate alternative RSS URLs
     * @param {string} originalUrl - Original RSS URL
     * @returns {Array} Alternative URLs
     */
    generateAlternativeRssUrls(originalUrl) {
        if (!originalUrl) return [];
        
        const alternatives = [];
        
        try {
            const url = new URL(originalUrl);
            
            // Try different RSS formats
            alternatives.push(originalUrl.replace('/rss/', '/atom/'));
            alternatives.push(originalUrl.replace('/rss/', '/feed/'));
            alternatives.push(originalUrl.replace('rss/search', 'atom/search'));
            
            // Try different parameters
            const params = new URLSearchParams(url.search);
            
            // Reduce num parameter if present
            if (params.has('num')) {
                const newParams = new URLSearchParams(params);
                newParams.set('num', '10');
                alternatives.push(`${url.origin}${url.pathname}?${newParams.toString()}`);
            }
            
        } catch (error) {
            log.debug('Failed to generate alternative URLs:', error.message);
        }
        
        return alternatives;
    }

    /**
     * Get cached data
     * @param {string} type - Data type
     * @param {string} key - Cache key
     * @returns {any} Cached data
     */
    async getCachedData(type, key) {
        try {
            const cacheKey = `CACHE_${type}_${key}`;
            return await Actor.getValue(cacheKey);
        } catch (error) {
            log.debug('Failed to get cached data:', error.message);
            return null;
        }
    }

    /**
     * Perform simplified content extraction
     * @param {string} html - HTML content
     * @param {object} userData - User data
     * @returns {object} Simplified content
     */
    performSimplifiedExtraction(html, userData) {
        // Basic extraction using simple regex patterns
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : userData.title || 'No title';
        
        // Extract meta description
        const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
        const description = descMatch ? descMatch[1].trim() : userData.description || '';
        
        return {
            title,
            text: description,
            description,
            success: false,
            simplified: true,
            extractionSuccess: false,
        };
    }

    /**
     * Create fallback content from RSS data
     * @param {object} userData - RSS user data
     * @returns {object} Fallback content
     */
    createFallbackContent(userData) {
        return {
            title: userData.title || 'No title',
            text: userData.description || 'No content available',
            description: userData.description || '',
            author: userData.source || '',
            url: userData.link || '',
            success: false,
            fallback: true,
            extractionSuccess: false,
        };
    }

    /**
     * Exponential backoff delay
     * @param {number} baseDelay - Base delay in ms
     * @param {number} attempt - Attempt number
     * @returns {Promise<void>}
     */
    async exponentialBackoff(baseDelay, attempt) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
    }

    /**
     * Sleep for specified duration
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get recovery statistics
     * @returns {object} Recovery statistics
     */
    getRecoveryStats() {
        return {
            strategies: Array.from(this.recoveryStrategies.keys()),
            recoveryAttempts: Object.fromEntries(this.recoveryAttempts),
            checkpoints: this.checkpoints.length,
            persistentStateKeys: Array.from(this.persistentState.keys()),
            recoveryInProgress: this.recoveryInProgress,
        };
    }

    /**
     * Reset recovery state
     */
    reset() {
        this.recoveryAttempts.clear();
        this.checkpoints = [];
        this.persistentState.clear();
        this.recoveryInProgress = false;
    }
}

// Global error recovery manager
export const errorRecovery = new ErrorRecoveryManager();
