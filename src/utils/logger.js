import { logService } from '../services/log.service.js';
import fs from 'fs';
import { join } from 'path';

const __dirname = process.cwd();

console.log('Completion Log File:', join(__dirname, 'completions.log'));

class Logger {
    formatMessage(message, meta = {}) {
        const formattedMeta = Object.keys(meta).length > 0 
            ? ` | ${JSON.stringify(meta)}`
            : '';
        return `${message}${formattedMeta}`;
    }

    info(message, meta = {}) {
        const formattedMessage = this.formatMessage(message, meta);
        console.info(formattedMessage);
        logService.info(formattedMessage);
    }

    error(message, meta = {}) {
        const formattedMessage = this.formatMessage(message, meta);
        console.error(formattedMessage);
        logService.error(formattedMessage);
    }

    warn(message, meta = {}) {
        const formattedMessage = this.formatMessage(message, meta);
        console.warn(formattedMessage);
        logService.warn(formattedMessage);
    }

    debug(message, meta = {}) {
        const formattedMessage = this.formatMessage(message, meta);
        console.debug(formattedMessage);
        logService.debug(formattedMessage);
    }

    createCompletionLogger() {
        const logFile = join(__dirname, 'completions.log');
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        return {
            info: (message, meta = {}) => {
                const formattedMessage = this.formatMessage(message, meta);
                logStream.write(`${formattedMessage}\n`);
            },
            error: (message, meta = {}) => {
                const formattedMessage = this.formatMessage(message, meta);
                logStream.write(`${formattedMessage}\n`);
            }
        };
    }
}

export const logger = new Logger();
export const completionLogger = logger.createCompletionLogger();