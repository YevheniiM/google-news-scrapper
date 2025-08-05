#!/usr/bin/env node
/**
 * Development Monitor
 * Real-time monitoring of development environment
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEV_CONFIG } from '../src/dev-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class DevelopmentMonitor {
    constructor() {
        this.isRunning = false;
        this.metrics = {
            memory: [],
            disk: [],
            files: [],
            errors: [],
        };
        this.maxMetrics = 100; // Keep last 100 measurements
        this.interval = 5000; // 5 seconds
    }

    async start() {
        console.log('📊 Development Environment Monitor');
        console.log('=================================');
        console.log('Press Ctrl+C to stop monitoring\n');

        this.isRunning = true;
        
        // Set up graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Stopping monitor...');
            this.stop();
        });

        // Start monitoring loop
        while (this.isRunning) {
            try {
                await this.collectMetrics();
                this.displayMetrics();
                await this.sleep(this.interval);
            } catch (error) {
                console.error('Monitor error:', error.message);
                await this.sleep(this.interval);
            }
        }
    }

    stop() {
        this.isRunning = false;
        console.log('Monitor stopped.');
        process.exit(0);
    }

    async collectMetrics() {
        const timestamp = new Date().toISOString();

        // Memory metrics
        const memory = process.memoryUsage();
        this.metrics.memory.push({
            timestamp,
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memory.heapTotal / 1024 / 1024), // MB
            rss: Math.round(memory.rss / 1024 / 1024), // MB
            external: Math.round(memory.external / 1024 / 1024), // MB
        });

        // Disk usage metrics
        const diskUsage = await this.getDiskUsage();
        this.metrics.disk.push({
            timestamp,
            ...diskUsage,
        });

        // File count metrics
        const fileCounts = await this.getFileCounts();
        this.metrics.files.push({
            timestamp,
            ...fileCounts,
        });

        // Error metrics (from log files)
        const errorCounts = await this.getErrorCounts();
        this.metrics.errors.push({
            timestamp,
            ...errorCounts,
        });

        // Keep only recent metrics
        for (const metricType of Object.keys(this.metrics)) {
            if (this.metrics[metricType].length > this.maxMetrics) {
                this.metrics[metricType] = this.metrics[metricType].slice(-this.maxMetrics);
            }
        }
    }

    async getDiskUsage() {
        const directories = {
            storage: DEV_CONFIG.STORAGE.DIR,
            cache: DEV_CONFIG.CACHE.DIR,
            logs: DEV_CONFIG.PATHS.LOGS,
            mockData: DEV_CONFIG.MOCK.DATA_DIR,
        };

        const usage = {};
        let totalSize = 0;

        for (const [name, dir] of Object.entries(directories)) {
            try {
                const size = await this.getDirectorySize(dir);
                const sizeMB = Math.round(size / 1024 / 1024);
                usage[name] = sizeMB;
                totalSize += sizeMB;
            } catch {
                usage[name] = 0;
            }
        }

        usage.total = totalSize;
        return usage;
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
            // Directory might not exist
        }
        
        return totalSize;
    }

    async getFileCounts() {
        const directories = {
            storage: DEV_CONFIG.STORAGE.DIR,
            cache: DEV_CONFIG.CACHE.DIR,
            logs: DEV_CONFIG.PATHS.LOGS,
            mockData: DEV_CONFIG.MOCK.DATA_DIR,
        };

        const counts = {};
        let totalFiles = 0;

        for (const [name, dir] of Object.entries(directories)) {
            try {
                const fileCount = await this.countFiles(dir);
                counts[name] = fileCount;
                totalFiles += fileCount;
            } catch {
                counts[name] = 0;
            }
        }

        counts.total = totalFiles;
        return counts;
    }

    async countFiles(dirPath) {
        let fileCount = 0;
        
        try {
            const files = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const file of files) {
                if (file.isDirectory()) {
                    fileCount += await this.countFiles(path.join(dirPath, file.name));
                } else {
                    fileCount++;
                }
            }
        } catch {
            // Directory might not exist
        }
        
        return fileCount;
    }

    async getErrorCounts() {
        const logsDir = DEV_CONFIG.PATHS.LOGS;
        let errorCount = 0;
        let warningCount = 0;

        try {
            const files = await fs.readdir(logsDir, { recursive: true });
            const logFiles = files.filter(f => f.endsWith('.log'));

            for (const file of logFiles) {
                try {
                    const filePath = path.join(logsDir, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    
                    // Count errors and warnings (simple text search)
                    const errorMatches = content.match(/ERROR|error/g);
                    const warningMatches = content.match(/WARN|warning/g);
                    
                    errorCount += errorMatches ? errorMatches.length : 0;
                    warningCount += warningMatches ? warningMatches.length : 0;
                } catch {
                    // Ignore files that can't be read
                }
            }
        } catch {
            // Logs directory might not exist
        }

        return {
            errors: errorCount,
            warnings: warningCount,
            total: errorCount + warningCount,
        };
    }

    displayMetrics() {
        // Clear screen
        console.clear();
        
        console.log('📊 Development Environment Monitor');
        console.log('=================================');
        console.log(`Last updated: ${new Date().toLocaleTimeString()}\n`);

        // Memory metrics
        const latestMemory = this.metrics.memory[this.metrics.memory.length - 1];
        if (latestMemory) {
            console.log('💾 Memory Usage:');
            console.log(`   Heap Used:  ${latestMemory.heapUsed}MB`);
            console.log(`   Heap Total: ${latestMemory.heapTotal}MB`);
            console.log(`   RSS:        ${latestMemory.rss}MB`);
            console.log(`   External:   ${latestMemory.external}MB`);
            
            // Memory trend
            if (this.metrics.memory.length > 1) {
                const previous = this.metrics.memory[this.metrics.memory.length - 2];
                const trend = latestMemory.heapUsed - previous.heapUsed;
                const trendIcon = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';
                console.log(`   Trend:      ${trendIcon} ${trend > 0 ? '+' : ''}${trend}MB`);
            }
        }

        // Disk usage
        const latestDisk = this.metrics.disk[this.metrics.disk.length - 1];
        if (latestDisk) {
            console.log('\n💽 Disk Usage:');
            console.log(`   Storage:    ${latestDisk.storage}MB`);
            console.log(`   Cache:      ${latestDisk.cache}MB`);
            console.log(`   Logs:       ${latestDisk.logs}MB`);
            console.log(`   Mock Data:  ${latestDisk.mockData}MB`);
            console.log(`   Total:      ${latestDisk.total}MB`);
        }

        // File counts
        const latestFiles = this.metrics.files[this.metrics.files.length - 1];
        if (latestFiles) {
            console.log('\n📁 File Counts:');
            console.log(`   Storage:    ${latestFiles.storage} files`);
            console.log(`   Cache:      ${latestFiles.cache} files`);
            console.log(`   Logs:       ${latestFiles.logs} files`);
            console.log(`   Mock Data:  ${latestFiles.mockData} files`);
            console.log(`   Total:      ${latestFiles.total} files`);
        }

        // Error counts
        const latestErrors = this.metrics.errors[this.metrics.errors.length - 1];
        if (latestErrors) {
            console.log('\n⚠️  Error Counts:');
            console.log(`   Errors:     ${latestErrors.errors}`);
            console.log(`   Warnings:   ${latestErrors.warnings}`);
            console.log(`   Total:      ${latestErrors.total}`);
        }

        // Health indicators
        console.log('\n🏥 Health Status:');
        const healthStatus = this.calculateHealthStatus();
        console.log(`   Overall:    ${healthStatus.overall} ${healthStatus.icon}`);
        console.log(`   Memory:     ${healthStatus.memory} ${healthStatus.memoryIcon}`);
        console.log(`   Disk:       ${healthStatus.disk} ${healthStatus.diskIcon}`);
        console.log(`   Errors:     ${healthStatus.errors} ${healthStatus.errorsIcon}`);

        console.log('\n📈 Monitoring... (Press Ctrl+C to stop)');
    }

    calculateHealthStatus() {
        const latestMemory = this.metrics.memory[this.metrics.memory.length - 1];
        const latestDisk = this.metrics.disk[this.metrics.disk.length - 1];
        const latestErrors = this.metrics.errors[this.metrics.errors.length - 1];

        let healthScore = 100;
        let issues = [];

        // Memory health
        let memoryStatus = 'GOOD';
        let memoryIcon = '✅';
        if (latestMemory) {
            const memoryUsage = latestMemory.heapUsed;
            const memoryLimit = DEV_CONFIG.LIMITS.MAX_MEMORY_MB;
            
            if (memoryUsage > memoryLimit * 0.9) {
                memoryStatus = 'CRITICAL';
                memoryIcon = '🔴';
                healthScore -= 30;
                issues.push('High memory usage');
            } else if (memoryUsage > memoryLimit * 0.7) {
                memoryStatus = 'WARNING';
                memoryIcon = '🟡';
                healthScore -= 15;
                issues.push('Elevated memory usage');
            }
        }

        // Disk health
        let diskStatus = 'GOOD';
        let diskIcon = '✅';
        if (latestDisk && latestDisk.total > 1000) { // > 1GB
            diskStatus = 'WARNING';
            diskIcon = '🟡';
            healthScore -= 10;
            issues.push('High disk usage');
        }

        // Error health
        let errorsStatus = 'GOOD';
        let errorsIcon = '✅';
        if (latestErrors) {
            if (latestErrors.errors > 10) {
                errorsStatus = 'CRITICAL';
                errorsIcon = '🔴';
                healthScore -= 25;
                issues.push('High error count');
            } else if (latestErrors.errors > 5) {
                errorsStatus = 'WARNING';
                errorsIcon = '🟡';
                healthScore -= 10;
                issues.push('Elevated error count');
            }
        }

        // Overall health
        let overall = 'EXCELLENT';
        let overallIcon = '🟢';
        if (healthScore < 50) {
            overall = 'CRITICAL';
            overallIcon = '🔴';
        } else if (healthScore < 70) {
            overall = 'POOR';
            overallIcon = '🟡';
        } else if (healthScore < 90) {
            overall = 'GOOD';
            overallIcon = '🟢';
        }

        return {
            overall,
            icon: overallIcon,
            memory: memoryStatus,
            memoryIcon,
            disk: diskStatus,
            diskIcon,
            errors: errorsStatus,
            errorsIcon,
            score: healthScore,
            issues,
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run monitor if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const monitor = new DevelopmentMonitor();
    
    try {
        await monitor.start();
    } catch (error) {
        console.error('\n💥 Monitor failed:', error.message);
        process.exit(1);
    }
}
