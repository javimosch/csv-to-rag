import { logService } from '../services/log.service.js';

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
}

export const logger = new Logger();