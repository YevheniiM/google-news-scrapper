/**
 * Local Storage Manager
 * Handles local data persistence for development and testing
 */

import fs from 'fs/promises';
import path from 'path';
import { log } from 'crawlee';
import { DEV_CONFIG } from './dev-config.js';

export class LocalStorageManager {
    constructor() {
        this.storageDir = DEV_CONFIG.STORAGE.DIR;
        this.enabled = DEV_CONFIG.STORAGE.ENABLED;
        this.maxSizeMB = DEV_CONFIG.STORAGE.MAX_SIZE_MB;
        this.autoCleanup = DEV_CONFIG.STORAGE.AUTO_CLEANUP;
        
        this.cache = new Map();
        this.metadata = new Map();
    }

    /**
     * Initialize local storage
     */
    async initialize() {
        if (!this.enabled) {
            log.info('Local storage disabled');
            return;
        }

        try {
            await fs.mkdir(this.storageDir, { recursive: true });
            await this.loadMetadata();
            
            if (this.autoCleanup) {
                await this.cleanup();
            }
            
            log.info(`Local storage initialized: ${this.storageDir}`);
        } catch (error) {
            log.error('Failed to initialize local storage:', error.message);
            this.enabled = false;
        }
    }

    /**
     * Store data locally
     * @param {string} key - Storage key
     * @param {any} data - Data to store
     * @param {object} options - Storage options
     */
    async setValue(key, data, options = {}) {
        if (!this.enabled) return;

        try {
            const {
                ttl = 3600000, // 1 hour default
                compress = false,
                category = 'general',
            } = options;

            const filePath = this.getFilePath(key, category);
            const serializedData = JSON.stringify(data, null, 2);
            
            // Create directory if needed
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            
            // Write data
            await fs.writeFile(filePath, serializedData);
            
            // Update metadata
            const metadata = {
                key,
                category,
                size: Buffer.byteLength(serializedData),
                created: Date.now(),
                expires: ttl > 0 ? Date.now() + ttl : null,
                compressed: compress,
            };
            
            this.metadata.set(key, metadata);
            this.cache.set(key, data);
            
            await this.saveMetadata();
            
            log.debug(`Stored data locally: ${key}`, { size: metadata.size, category });
            
        } catch (error) {
            log.error(`Failed to store data locally: ${key}`, error.message);
        }
    }

    /**
     * Retrieve data from local storage
     * @param {string} key - Storage key
     * @param {any} defaultValue - Default value if not found
     * @returns {any} Retrieved data
     */
    async getValue(key, defaultValue = null) {
        if (!this.enabled) return defaultValue;

        try {
            // Check cache first
            if (this.cache.has(key)) {
                const metadata = this.metadata.get(key);
                
                // Check if expired
                if (metadata?.expires && Date.now() > metadata.expires) {
                    await this.deleteValue(key);
                    return defaultValue;
                }
                
                return this.cache.get(key);
            }

            // Load from file
            const metadata = this.metadata.get(key);
            if (!metadata) return defaultValue;

            // Check if expired
            if (metadata.expires && Date.now() > metadata.expires) {
                await this.deleteValue(key);
                return defaultValue;
            }

            const filePath = this.getFilePath(key, metadata.category);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            
            // Cache for future use
            this.cache.set(key, data);
            
            return data;
            
        } catch (error) {
            log.debug(`Failed to retrieve data locally: ${key}`, error.message);
            return defaultValue;
        }
    }

    /**
     * Delete data from local storage
     * @param {string} key - Storage key
     */
    async deleteValue(key) {
        if (!this.enabled) return;

        try {
            const metadata = this.metadata.get(key);
            if (metadata) {
                const filePath = this.getFilePath(key, metadata.category);
                await fs.unlink(filePath).catch(() => {}); // Ignore if file doesn't exist
            }
            
            this.metadata.delete(key);
            this.cache.delete(key);
            
            await this.saveMetadata();
            
            log.debug(`Deleted data locally: ${key}`);
            
        } catch (error) {
            log.error(`Failed to delete data locally: ${key}`, error.message);
        }
    }

    /**
     * List all stored keys
     * @param {string} category - Filter by category
     * @returns {Array} Array of keys
     */
    async listKeys(category = null) {
        if (!this.enabled) return [];

        const keys = Array.from(this.metadata.keys());
        
        if (category) {
            return keys.filter(key => {
                const metadata = this.metadata.get(key);
                return metadata?.category === category;
            });
        }
        
        return keys;
    }

    /**
     * Get storage statistics
     * @returns {object} Storage statistics
     */
    async getStats() {
        if (!this.enabled) {
            return { enabled: false };
        }

        const stats = {
            enabled: true,
            totalKeys: this.metadata.size,
            totalSize: 0,
            categories: {},
            expired: 0,
        };

        for (const [key, metadata] of this.metadata) {
            stats.totalSize += metadata.size;
            
            if (!stats.categories[metadata.category]) {
                stats.categories[metadata.category] = { count: 0, size: 0 };
            }
            
            stats.categories[metadata.category].count++;
            stats.categories[metadata.category].size += metadata.size;
            
            if (metadata.expires && Date.now() > metadata.expires) {
                stats.expired++;
            }
        }

        stats.totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
        
        return stats;
    }

    /**
     * Clean up expired and old data
     */
    async cleanup() {
        if (!this.enabled) return;

        try {
            const now = Date.now();
            const keysToDelete = [];
            
            // Find expired keys
            for (const [key, metadata] of this.metadata) {
                if (metadata.expires && now > metadata.expires) {
                    keysToDelete.push(key);
                }
            }
            
            // Delete expired keys
            for (const key of keysToDelete) {
                await this.deleteValue(key);
            }
            
            // Check total size and clean up if needed
            const stats = await this.getStats();
            const currentSizeMB = parseFloat(stats.totalSizeMB);
            
            if (currentSizeMB > this.maxSizeMB) {
                await this.cleanupBySize();
            }
            
            log.info(`Storage cleanup completed: removed ${keysToDelete.length} expired items`);
            
        } catch (error) {
            log.error('Storage cleanup failed:', error.message);
        }
    }

    /**
     * Clean up by size (remove oldest items)
     */
    async cleanupBySize() {
        const targetSizeMB = this.maxSizeMB * 0.8; // Clean to 80% of max
        const items = Array.from(this.metadata.entries())
            .map(([key, metadata]) => ({ key, ...metadata }))
            .sort((a, b) => a.created - b.created); // Oldest first

        let currentSize = 0;
        const keysToDelete = [];
        
        // Calculate current size
        for (const item of items) {
            currentSize += item.size;
        }
        
        // Remove oldest items until under target size
        for (const item of items) {
            if (currentSize / 1024 / 1024 <= targetSizeMB) break;
            
            keysToDelete.push(item.key);
            currentSize -= item.size;
        }
        
        // Delete selected keys
        for (const key of keysToDelete) {
            await this.deleteValue(key);
        }
        
        log.info(`Size-based cleanup: removed ${keysToDelete.length} items`);
    }

    /**
     * Get file path for key
     * @param {string} key - Storage key
     * @param {string} category - Category
     * @returns {string} File path
     */
    getFilePath(key, category = 'general') {
        const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '_');
        return path.join(this.storageDir, category, `${safeKey}.json`);
    }

    /**
     * Load metadata from file
     */
    async loadMetadata() {
        try {
            const metadataPath = path.join(this.storageDir, 'metadata.json');
            const content = await fs.readFile(metadataPath, 'utf8');
            const data = JSON.parse(content);
            
            this.metadata = new Map(Object.entries(data));
            
        } catch (error) {
            // Metadata file doesn't exist or is corrupted, start fresh
            this.metadata = new Map();
        }
    }

    /**
     * Save metadata to file
     */
    async saveMetadata() {
        try {
            const metadataPath = path.join(this.storageDir, 'metadata.json');
            const data = Object.fromEntries(this.metadata);
            
            await fs.writeFile(metadataPath, JSON.stringify(data, null, 2));
            
        } catch (error) {
            log.error('Failed to save metadata:', error.message);
        }
    }

    /**
     * Export all data
     * @param {string} exportPath - Export file path
     */
    async exportData(exportPath) {
        if (!this.enabled) return;

        try {
            const exportData = {
                timestamp: new Date().toISOString(),
                metadata: Object.fromEntries(this.metadata),
                data: {},
            };

            // Load all data
            for (const key of this.metadata.keys()) {
                exportData.data[key] = await this.getValue(key);
            }

            await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
            
            log.info(`Data exported to: ${exportPath}`);
            
        } catch (error) {
            log.error('Data export failed:', error.message);
        }
    }

    /**
     * Import data
     * @param {string} importPath - Import file path
     */
    async importData(importPath) {
        if (!this.enabled) return;

        try {
            const content = await fs.readFile(importPath, 'utf8');
            const importData = JSON.parse(content);

            // Import metadata
            this.metadata = new Map(Object.entries(importData.metadata));

            // Import data
            for (const [key, data] of Object.entries(importData.data)) {
                this.cache.set(key, data);
                
                // Write to file
                const metadata = this.metadata.get(key);
                if (metadata) {
                    const filePath = this.getFilePath(key, metadata.category);
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                }
            }

            await this.saveMetadata();
            
            log.info(`Data imported from: ${importPath}`);
            
        } catch (error) {
            log.error('Data import failed:', error.message);
        }
    }

    /**
     * Clear all data
     */
    async clear() {
        if (!this.enabled) return;

        try {
            // Remove all files
            await fs.rm(this.storageDir, { recursive: true, force: true });
            await fs.mkdir(this.storageDir, { recursive: true });
            
            // Clear memory
            this.metadata.clear();
            this.cache.clear();
            
            log.info('Local storage cleared');
            
        } catch (error) {
            log.error('Failed to clear local storage:', error.message);
        }
    }

    /**
     * Shutdown storage manager
     */
    async shutdown() {
        if (this.enabled) {
            await this.saveMetadata();
            log.info('Local storage shutdown');
        }
    }
}

// Global local storage instance
export const localStorage = new LocalStorageManager();
