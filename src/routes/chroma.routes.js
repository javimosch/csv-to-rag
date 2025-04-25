import express from 'express';
import { syncFileToChroma } from '../services/chroma.service.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @route POST /api/chroma/sync
 * @desc Sync MongoDB documents for a CSV file into Chroma collection
 * @access Protected
 */
router.post('/chroma/sync', async (req, res) => {
  try {
    const { fileName } = req.body;
    const namespace = req.body.namespace || req.query.namespace || 'default';
    if (!fileName) {
      return res.status(400).json({ success: false, error: 'fileName is required' });
    }
    const result = await syncFileToChroma(fileName, namespace);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Error in /api/chroma/sync:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export const chromaRoutes = router;