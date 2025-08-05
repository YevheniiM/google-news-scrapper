#!/usr/bin/env node
/**
 * Development Cleanup Utility
 * Cleans up development files and data
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEV_CONFIG } from '../src/dev-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class DevelopmentCleaner {
    constructor() {
        this.cleanupTasks = [];
        this.results = [];
    }

    async runCleanup(options = {}) {
        const {
            logs = false,
            storage = false,
            cache = false,
            mockData = false,
            testData = false,
            all = false,
            force = false,
        } = options;

        console.log('🧹 Development Environment Cleanup');
        console.log('==================================');

        if (!force && !all && !logs && !storage && !cache && !mockData && !testData) {
            console.log('No cleanup options specified. Use --help for options.');
            return;
        }

        this.cleanupTasks = [
            {
                name: 'Log Files',
                enabled: all || logs,
                fn: () => this.cleanupLogs(),
            },
            {
                name: 'Storage Data',
                enabled: all || storage,
                fn: () => this.cleanupStorage(),
            },
            {
                name: 'Cache Files',
                enabled: all || cache,
                fn: () => this.cleanupCache(),
            },
            {
                name: 'Mock Data',
                enabled: all || mockData,
                fn: () => this.cleanupMockData(),
            },
            {
                name: 'Test Data',
                enabled: all || testData,
                fn: () => this.cleanupTestData(),
            },
        ];

        for (const task of this.cleanupTasks) {
            if (!task.enabled) continue;

            console.log(`\n🗑️  Cleaning: ${task.name}`);
            try {
                const result = await task.fn();
                this.results.push({
                    name: task.name,
                    success: true,
                    result,
                    timestamp: new Date().toISOString(),
                });
                console.log(`   ✅ ${task.name}: ${result.message}`);
            } catch (error) {
                this.results.push({
                    name: task.name,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString(),
                });
                console.log(`   ❌ ${task.name}: ${error.message}`);
            }
        }

        this.generateReport();
    }

    async cleanupLogs() {
        const logsDir = DEV_CONFIG.PATHS.LOGS;
        let filesRemoved = 0;
        let sizeFreed = 0;

        try {
            const files = await fs.readdir(logsDir, { recursive: true });
            
            for (const file of files) {
                const filePath = path.join(logsDir, file);
                
                try {
                    const stats = await fs.stat(filePath);
                    
                    if (stats.isFile() && file.endsWith('.log')) {
                        sizeFreed += stats.size;
                        await fs.unlink(filePath);
                        filesRemoved++;
                    }
                } catch {
                    // Ignore files that can't be accessed
                }
            }

            return {
                filesRemoved,
                sizeFreedMB: (sizeFreed / 1024 / 1024).toFixed(2),
                message: `Removed ${filesRemoved} log files (${(sizeFreed / 1024 / 1024).toFixed(2)}MB)`,
            };
        } catch (error) {
            throw new Error(`Log cleanup failed: ${error.message}`);
        }
    }

    async cleanupStorage() {
        const storageDir = DEV_CONFIG.STORAGE.DIR;
        let filesRemoved = 0;
        let sizeFreed = 0;

        try {
            // Remove all files except metadata
            const files = await fs.readdir(storageDir, { recursive: true });
            
            for (const file of files) {
                if (file === 'metadata.json') continue;
                
                const filePath = path.join(storageDir, file);
                
                try {
                    const stats = await fs.stat(filePath);
                    
                    if (stats.isFile()) {
                        sizeFreed += stats.size;
                        await fs.unlink(filePath);
                        filesRemoved++;
                    }
                } catch {
                    // Ignore files that can't be accessed
                }
            }

            // Clean up empty directories
            await this.removeEmptyDirectories(storageDir);

            return {
                filesRemoved,
                sizeFreedMB: (sizeFreed / 1024 / 1024).toFixed(2),
                message: `Removed ${filesRemoved} storage files (${(sizeFreed / 1024 / 1024).toFixed(2)}MB)`,
            };
        } catch (error) {
            throw new Error(`Storage cleanup failed: ${error.message}`);
        }
    }

    async cleanupCache() {
        const cacheDir = DEV_CONFIG.CACHE.DIR;
        let filesRemoved = 0;
        let sizeFreed = 0;

        try {
            await fs.rm(cacheDir, { recursive: true, force: true });
            await fs.mkdir(cacheDir, { recursive: true });

            return {
                filesRemoved: 'all',
                message: 'Cache directory cleared',
            };
        } catch (error) {
            throw new Error(`Cache cleanup failed: ${error.message}`);
        }
    }

    async cleanupMockData() {
        const mockDataDir = DEV_CONFIG.MOCK.DATA_DIR;
        let filesRemoved = 0;
        let sizeFreed = 0;

        try {
            const subdirs = ['rss', 'articles', 'images'];
            
            for (const subdir of subdirs) {
                const subdirPath = path.join(mockDataDir, subdir);
                
                try {
                    const files = await fs.readdir(subdirPath);
                    
                    for (const file of files) {
                        const filePath = path.join(subdirPath, file);
                        const stats = await fs.stat(filePath);
                        
                        if (stats.isFile()) {
                            sizeFreed += stats.size;
                            await fs.unlink(filePath);
                            filesRemoved++;
                        }
                    }
                } catch {
                    // Directory might not exist
                }
            }

            return {
                filesRemoved,
                sizeFreedMB: (sizeFreed / 1024 / 1024).toFixed(2),
                message: `Removed ${filesRemoved} mock data files (${(sizeFreed / 1024 / 1024).toFixed(2)}MB)`,
            };
        } catch (error) {
            throw new Error(`Mock data cleanup failed: ${error.message}`);
        }
    }

    async cleanupTestData() {
        const testDataDir = DEV_CONFIG.TESTING.DATA_DIR;
        let filesRemoved = 0;
        let sizeFreed = 0;

        try {
            const subdirs = ['scenarios', 'expected', 'results'];
            
            for (const subdir of subdirs) {
                const subdirPath = path.join(testDataDir, subdir);
                
                try {
                    const files = await fs.readdir(subdirPath);
                    
                    for (const file of files) {
                        const filePath = path.join(subdirPath, file);
                        const stats = await fs.stat(filePath);
                        
                        if (stats.isFile()) {
                            sizeFreed += stats.size;
                            await fs.unlink(filePath);
                            filesRemoved++;
                        }
                    }
                } catch {
                    // Directory might not exist
                }
            }

            return {
                filesRemoved,
                sizeFreedMB: (sizeFreed / 1024 / 1024).toFixed(2),
                message: `Removed ${filesRemoved} test data files (${(sizeFreed / 1024 / 1024).toFixed(2)}MB)`,
            };
        } catch (error) {
            throw new Error(`Test data cleanup failed: ${error.message}`);
        }
    }

    async removeEmptyDirectories(dirPath) {
        try {
            const files = await fs.readdir(dirPath);
            
            if (files.length === 0) {
                // Directory is empty, remove it
                await fs.rmdir(dirPath);
                return;
            }
            
            // Check subdirectories
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = await fs.stat(filePath);
                
                if (stats.isDirectory()) {
                    await this.removeEmptyDirectories(filePath);
                }
            }
            
            // Check again if directory is now empty
            const remainingFiles = await fs.readdir(dirPath);
            if (remainingFiles.length === 0) {
                await fs.rmdir(dirPath);
            }
        } catch {
            // Ignore errors (directory might not exist or not be empty)
        }
    }

    generateReport() {
        const completed = this.results.filter(r => r.success).length;
        const failed = this.results.filter(r => !r.success).length;
        const total = this.results.length;

        console.log('\n📊 Cleanup Summary');
        console.log('==================');
        console.log(`Total Tasks: ${total}`);
        console.log(`Completed: ${completed}`);
        console.log(`Failed: ${failed}`);

        if (failed > 0) {
            console.log('\n❌ Failed Tasks:');
            this.results
                .filter(r => !r.success)
                .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
        }

        if (completed > 0) {
            console.log('\n✅ Completed Tasks:');
            this.results
                .filter(r => r.success)
                .forEach(r => console.log(`  - ${r.name}: ${r.result.message}`));
        }

        console.log('\n🎉 Cleanup completed!');
        
        return {
            total,
            completed,
            failed,
            results: this.results,
        };
    }

    static showHelp() {
        console.log('🧹 Development Cleanup Utility');
        console.log('==============================');
        console.log('');
        console.log('Usage: npm run dev:clean [options]');
        console.log('');
        console.log('Options:');
        console.log('  --logs      Clean log files');
        console.log('  --storage   Clean storage data');
        console.log('  --cache     Clean cache files');
        console.log('  --mock      Clean mock data');
        console.log('  --test      Clean test data');
        console.log('  --all       Clean everything');
        console.log('  --force     Force cleanup without confirmation');
        console.log('  --help      Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  npm run dev:clean -- --logs');
        console.log('  npm run dev:clean -- --all');
        console.log('  npm run dev:clean -- --storage --cache');
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    logs: args.includes('--logs'),
    storage: args.includes('--storage'),
    cache: args.includes('--cache'),
    mockData: args.includes('--mock'),
    testData: args.includes('--test'),
    all: args.includes('--all'),
    force: args.includes('--force'),
    help: args.includes('--help'),
};

// Run cleanup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    if (options.help) {
        DevelopmentCleaner.showHelp();
        process.exit(0);
    }

    const cleaner = new DevelopmentCleaner();
    
    try {
        await cleaner.runCleanup(options);
    } catch (error) {
        console.error('\n💥 Cleanup failed:', error.message);
        process.exit(1);
    }
}
