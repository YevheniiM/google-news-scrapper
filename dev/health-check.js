#!/usr/bin/env node
/**
 * Health Check Utility
 * Checks the health of the development environment
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEV_CONFIG } from '../src/dev-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class HealthChecker {
    constructor() {
        this.checks = [];
        this.results = [];
    }

    async runAllChecks() {
        console.log('🏥 Development Environment Health Check');
        console.log('======================================');

        this.checks = [
            { name: 'Environment Configuration', fn: () => this.checkEnvironment() },
            { name: 'Required Directories', fn: () => this.checkDirectories() },
            { name: 'Dependencies', fn: () => this.checkDependencies() },
            { name: 'Storage System', fn: () => this.checkStorage() },
            { name: 'Mock Data', fn: () => this.checkMockData() },
            { name: 'Log Files', fn: () => this.checkLogFiles() },
            { name: 'Memory Usage', fn: () => this.checkMemoryUsage() },
            { name: 'Disk Space', fn: () => this.checkDiskSpace() },
        ];

        for (const check of this.checks) {
            console.log(`\n🔍 Checking: ${check.name}`);
            try {
                const result = await check.fn();
                this.results.push({
                    name: check.name,
                    success: true,
                    result,
                    timestamp: new Date().toISOString(),
                });
                console.log(`   ✅ ${check.name}: OK`);
                if (result.details) {
                    console.log(`      ${result.details}`);
                }
            } catch (error) {
                this.results.push({
                    name: check.name,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString(),
                });
                console.log(`   ❌ ${check.name}: ${error.message}`);
            }
        }

        this.generateReport();
    }

    async checkEnvironment() {
        const issues = [];
        
        // Check Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        if (majorVersion < 18) {
            issues.push(`Node.js version ${nodeVersion} is too old (requires 18+)`);
        }

        // Check environment variables
        const requiredEnvVars = ['NODE_ENV'];
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                issues.push(`Missing environment variable: ${envVar}`);
            }
        }

        // Check .env file
        try {
            await fs.access(path.join(rootDir, '.env'));
        } catch {
            issues.push('.env file not found');
        }

        if (issues.length > 0) {
            throw new Error(issues.join(', '));
        }

        return {
            nodeVersion,
            platform: process.platform,
            arch: process.arch,
            details: `Node.js ${nodeVersion} on ${process.platform}`,
        };
    }

    async checkDirectories() {
        const requiredDirs = [
            'logs',
            'storage',
            'cache',
            'dev/mock-data',
            'dev/test-data',
        ];

        const missing = [];
        const existing = [];

        for (const dir of requiredDirs) {
            const fullPath = path.join(rootDir, dir);
            try {
                const stats = await fs.stat(fullPath);
                if (stats.isDirectory()) {
                    existing.push(dir);
                } else {
                    missing.push(`${dir} exists but is not a directory`);
                }
            } catch {
                missing.push(dir);
            }
        }

        if (missing.length > 0) {
            throw new Error(`Missing directories: ${missing.join(', ')}`);
        }

        return {
            existing: existing.length,
            total: requiredDirs.length,
            details: `${existing.length}/${requiredDirs.length} directories exist`,
        };
    }

    async checkDependencies() {
        try {
            const packageJson = JSON.parse(
                await fs.readFile(path.join(rootDir, 'package.json'), 'utf8')
            );

            const dependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies,
            };

            // Check if node_modules exists
            try {
                await fs.access(path.join(rootDir, 'node_modules'));
            } catch {
                throw new Error('node_modules directory not found - run npm install');
            }

            return {
                totalDependencies: Object.keys(dependencies).length,
                details: `${Object.keys(dependencies).length} dependencies configured`,
            };
        } catch (error) {
            throw new Error(`Package.json check failed: ${error.message}`);
        }
    }

    async checkStorage() {
        const storageDir = DEV_CONFIG.STORAGE.DIR;
        
        try {
            await fs.access(storageDir);
            
            // Check if writable
            const testFile = path.join(storageDir, 'health-check-test.json');
            await fs.writeFile(testFile, JSON.stringify({ test: true }));
            await fs.unlink(testFile);

            // Get storage stats
            const files = await fs.readdir(storageDir, { recursive: true });
            
            return {
                directory: storageDir,
                files: files.length,
                writable: true,
                details: `Storage directory accessible with ${files.length} files`,
            };
        } catch (error) {
            throw new Error(`Storage check failed: ${error.message}`);
        }
    }

    async checkMockData() {
        const mockDataDir = DEV_CONFIG.MOCK.DATA_DIR;
        
        try {
            await fs.access(mockDataDir);
            
            const rssDir = path.join(mockDataDir, 'rss');
            const articlesDir = path.join(mockDataDir, 'articles');
            
            let rssFiles = 0;
            let articleFiles = 0;
            
            try {
                const rssFileList = await fs.readdir(rssDir);
                rssFiles = rssFileList.filter(f => f.endsWith('.xml')).length;
            } catch {
                // Directory might not exist
            }
            
            try {
                const articleFileList = await fs.readdir(articlesDir);
                articleFiles = articleFileList.filter(f => f.endsWith('.html')).length;
            } catch {
                // Directory might not exist
            }

            return {
                rssFiles,
                articleFiles,
                total: rssFiles + articleFiles,
                details: `${rssFiles} RSS files, ${articleFiles} article files`,
            };
        } catch (error) {
            throw new Error(`Mock data check failed: ${error.message}`);
        }
    }

    async checkLogFiles() {
        const logsDir = DEV_CONFIG.PATHS.LOGS;
        
        try {
            await fs.access(logsDir);
            
            const files = await fs.readdir(logsDir, { recursive: true });
            const logFiles = files.filter(f => f.endsWith('.log'));
            
            let totalSize = 0;
            for (const file of logFiles) {
                try {
                    const stats = await fs.stat(path.join(logsDir, file));
                    totalSize += stats.size;
                } catch {
                    // Ignore files that can't be accessed
                }
            }

            return {
                logFiles: logFiles.length,
                totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
                details: `${logFiles.length} log files (${(totalSize / 1024 / 1024).toFixed(2)}MB)`,
            };
        } catch (error) {
            throw new Error(`Log files check failed: ${error.message}`);
        }
    }

    async checkMemoryUsage() {
        const usage = process.memoryUsage();
        const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
        const rssMB = Math.round(usage.rss / 1024 / 1024);

        const maxMemoryMB = DEV_CONFIG.LIMITS.MAX_MEMORY_MB;
        
        if (heapUsedMB > maxMemoryMB) {
            throw new Error(`Memory usage ${heapUsedMB}MB exceeds limit ${maxMemoryMB}MB`);
        }

        return {
            heapUsedMB,
            heapTotalMB,
            rssMB,
            maxMemoryMB,
            details: `${heapUsedMB}MB used / ${maxMemoryMB}MB limit`,
        };
    }

    async checkDiskSpace() {
        try {
            // Get disk usage for key directories
            const directories = [
                DEV_CONFIG.STORAGE.DIR,
                DEV_CONFIG.CACHE.DIR,
                DEV_CONFIG.PATHS.LOGS,
            ];

            let totalSize = 0;
            const dirSizes = {};

            for (const dir of directories) {
                try {
                    const size = await this.getDirectorySize(dir);
                    dirSizes[dir] = (size / 1024 / 1024).toFixed(2); // MB
                    totalSize += size;
                } catch {
                    dirSizes[dir] = '0.00';
                }
            }

            const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

            return {
                totalSizeMB,
                directories: dirSizes,
                details: `${totalSizeMB}MB total disk usage`,
            };
        } catch (error) {
            throw new Error(`Disk space check failed: ${error.message}`);
        }
    }

    async getDirectorySize(dirPath) {
        let totalSize = 0;
        
        try {
            const files = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const file of files) {
                const filePath = path.join(dirPath, file.name);
                
                if (file.isDirectory()) {
                    totalSize += await this.getDirectorySize(filePath);
                } else {
                    const stats = await fs.stat(filePath);
                    totalSize += stats.size;
                }
            }
        } catch {
            // Directory might not exist or be accessible
        }
        
        return totalSize;
    }

    generateReport() {
        const passed = this.results.filter(r => r.success).length;
        const failed = this.results.filter(r => !r.success).length;
        const total = this.results.length;

        console.log('\n📊 Health Check Summary');
        console.log('=======================');
        console.log(`Total Checks: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Health Score: ${((passed / total) * 100).toFixed(1)}%`);

        if (failed > 0) {
            console.log('\n❌ Failed Checks:');
            this.results
                .filter(r => !r.success)
                .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
            
            console.log('\n💡 Recommendations:');
            console.log('  - Run: npm run dev:setup');
            console.log('  - Check .env configuration');
            console.log('  - Ensure all dependencies are installed');
        } else {
            console.log('\n🎉 All health checks passed!');
            console.log('   Development environment is ready.');
        }

        return {
            total,
            passed,
            failed,
            healthScore: ((passed / total) * 100).toFixed(1),
            results: this.results,
        };
    }
}

// Run health check if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const checker = new HealthChecker();
    
    try {
        await checker.runAllChecks();
    } catch (error) {
        console.error('\n💥 Health check failed:', error.message);
        process.exit(1);
    }
}
