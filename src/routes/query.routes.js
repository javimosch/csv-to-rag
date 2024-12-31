import express from 'express';
import { QueryService } from '../services/query.service.js';
import { validateQuery, validateCompletion } from '../middleware/validation.middleware.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

/**
 * @route POST /api/query
 * @desc Perform a similarity search and generate a response
 * @access Public
 */
router.post('/query', validateQuery, async (req, res, next) => {
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

router.post('/completion', validateCompletion, async (req, res, next) => {
  try {
    const { prompt, max_tokens, temperature } = req.body;

    // Generate a unique ID for the completion
    const completionId = uuidv4();

    // Perform similarity search using the prompt as the query
    const { documents } = await QueryService.performSimilaritySearch(prompt);
    
    // Generate response using the retrieved documents
    const completion = await QueryService.generateResponse(prompt, documents);

    // Format the response to match the OpenAI API format
    res.json({
      id: `cmpl-${completionId}`,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: 'custom-model', // This is a placeholder as the model is determined by the server
      choices: [
        {
          text: completion,
          index: 0,
          logprobs: null,
          finish_reason: 'length' // Placeholder
        }
      ],
      usage: {
        prompt_tokens: prompt.split(' ').length, // Basic token count
        completion_tokens: completion.split(' ').length, // Basic token count
        total_tokens: prompt.split(' ').length + completion.split(' ').length // Basic token count
      }
    });
  } catch (error) {
    logger.error('Error in completion processing:', error);
    next(error);
  }
});

export const queryRoutes = router;
