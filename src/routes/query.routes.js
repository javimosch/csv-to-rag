import express from 'express';
import { QueryService } from '../services/query.service.js';
import { validateQuery } from '../middleware/validation.middleware.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.post('/', validateQuery, async (req, res, next) => {
  try {
    const { query } = req.body;
    const { searchResults, documents } = await QueryService.performSimilaritySearch(query);
    const response = await QueryService.generateResponse(query, documents);
    
    res.json({
      response,
      relevantDocuments: documents
    });
  } catch (error) {
    logger.error('Error in query processing:', error);
    next(error);
  }
});

export const queryRoutes = router;