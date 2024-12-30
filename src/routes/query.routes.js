import express from 'express';
import { QueryService } from '../services/query.service.js';
import { validateQuery } from '../middleware/validation.middleware.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.post('/', validateQuery, async (req, res, next) => {
  try {
    const { query } = req.body;
    const { searchResults, documents } = await QueryService.performSimilaritySearch(query);
    const answer = await QueryService.generateResponse(query, documents);
    
    // Format the response to match the UI's expected format
    res.json({
      answer,
      sources: documents.map(doc => ({
        fileName: doc.fileName,
        context: doc.metadata_small // Using metadata_small as context
      }))
    });
  } catch (error) {
    logger.error('Error in query processing:', error);
    next(error);
  }
});

export const queryRoutes = router;