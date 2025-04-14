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
    const namespace = req.query.namespace || req.body.namespace || 'default';
    const onlyContext = Boolean(req.query.onlyContext || req.body.onlyContext);

    console.debug('Query:', { query, namespace, onlyContext })
    
    const { documents } = await QueryService.performSimilaritySearch(query, 5, namespace);
    
    if (onlyContext) {
      // Return only the context without LLM completion
      res.json(documents.map(mapRemoveKeys(['_id','__v','timestamp','fileName','namespace'])));
    } else {
      // Generate LLM response as before
      const answer = await QueryService.generateResponse(query, documents);
      res.json({
        answer,
        sources: documents.map(doc => ({
          fileName: doc.fileName,
          namespace: doc.namespace,
          context: doc.metadata_small // Using metadata_small as context
        }))
      });
    }
  } catch (error) {
    logger.error('Error in query processing:', error);
    next(error);
  }
});

const mapRemoveKeys = keysToRemove => doc => {
  doc = doc.toJSON();
  return Object.fromEntries(
    Object.entries(doc).filter(([key]) => !keysToRemove.includes(key))
  );
}

/**
 * @route POST /api/completion
 * @desc Legacy completion endpoint (defaults to 'default' namespace)
 * @access Public
 */
router.post('/completion', validateCompletion, async (req, res, next) => {
  try {
    const { prompt, max_tokens, temperature } = req.body;
    const namespace = req.query.namespace || req.body.namespace || 'default';
    await handleCompletion(req, res, next, namespace);
  } catch (error) {
    logger.error('Error in completion:', error);
    next(error);
  }
});

/**
 * @route POST /api/ns/:namespace/completion
 * @desc Namespaced completion endpoint following OpenAI URL pattern
 * @access Public
 */
router.post('/ns/:namespace/completion', validateCompletion, async (req, res, next) => {
  try {
    const namespace = req.params.namespace;
    await handleCompletion(req, res, next, namespace);
  } catch (error) {
    logger.error('Error in namespaced completion:', error);
    next(error);
  }
});

/**
 * Handle completion request for both namespaced and non-namespaced routes
 */
async function handleCompletion(req, res, next, namespace) {
  const { prompt, max_tokens, temperature } = req.body;
  
  // Generate a unique ID for the completion
  const completionId = uuidv4();

  // Perform similarity search using the prompt as the query
  const { documents } = await QueryService.performSimilaritySearch(prompt, 5, namespace);
  
  // Generate response using the retrieved documents
  const completion = await QueryService.generateResponse(prompt, documents);

  // Format the response to match the OpenAI API format
  res.json({
    id: `cmpl-${completionId}`,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-3.5-turbo',
    choices: [{
      text: completion,
      index: 0,
      logprobs: null,
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: prompt.length,
      completion_tokens: completion.length,
      total_tokens: prompt.length + completion.length
    }
  });
}

export const queryRoutes = router;
