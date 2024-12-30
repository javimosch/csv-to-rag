class LogEntry {
    constructor(message, level = 'info') {
        this.timestamp = Date.now();
        this.message = message;
        this.level = level;
    }
}

class LogService {
    constructor(retentionMs = 60000) { // Default retention: 1 minute
        this.logs = [];
        this.retentionMs = retentionMs;
        this.pruneInterval = setInterval(() => this.pruneOldLogs(), 10000); // Prune every 10 seconds
    }

    log(message, level = 'info') {
        const entry = new LogEntry(message, level);
        this.logs.push(entry);
        this.pruneOldLogs(); // Prune on each write to maintain memory
        return entry;
    }

    info(message) {
        return this.log(message, 'info');
    }

    error(message) {
        return this.log(message, 'error');
    }

    warn(message) {
        return this.log(message, 'warn');
    }

    debug(message) {
        return this.log(message, 'debug');
    }

    pruneOldLogs() {
        const cutoffTime = Date.now() - this.retentionMs;
        this.logs = this.logs.filter(log => log.timestamp >= cutoffTime);
    }

    getLogs(since = Date.now() - 10000) { // Default: last 10 seconds
        return this.logs.filter(log => log.timestamp >= since);
    }

    destroy() {
        if (this.pruneInterval) {
            clearInterval(this.pruneInterval);
        }
    }
}

// Create a singleton instance
const logService = new LogService();

// Handle cleanup on process exit
process.on('exit', () => {
    logService.destroy();
});

export { logService };
