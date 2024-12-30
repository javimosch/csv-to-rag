import express from 'express';
import { logService } from '../services/log.service.js';

const router = express.Router();

router.get('/', (req, res) => {
    try {
        const timestamp = req.query.timestamp ? parseInt(req.query.timestamp) : undefined;
        const logs = logService.getLogs(timestamp);
        res.json({
            logs,
            count: logs.length,
            oldestTimestamp: logs.length > 0 ? Math.min(...logs.map(log => log.timestamp)) : null,
            newestTimestamp: logs.length > 0 ? Math.max(...logs.map(log => log.timestamp)) : null
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to retrieve logs',
            message: error.message 
        });
    }
});

export const logRoutes = router;
