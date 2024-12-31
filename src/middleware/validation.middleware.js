import Joi from 'joi';
import { logger } from '../utils/logger.js';

// Validation schema for CSV file uploads
export const csvSchema = Joi.object({
  code: Joi.string().required(),
  metadata_small: Joi.string().required(),
  metadata_big_1: Joi.string().required(),
  metadata_big_2: Joi.string().required(),
  metadata_big_3: Joi.string().required(),
});

// Validation middleware for CSV data
export const validateCsv = (req, res, next) => {
  const { error } = csvSchema.validate(req.body);
  if (error) {
    logger.warn('CSV validation error:', { details: error.details });
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

// Validation schema for query requests
const querySchema = Joi.object({
  query: Joi.string().required(),
});

// Validation middleware for query requests
export const validateQuery = (req, res, next) => {
  const { error } = querySchema.validate(req.body);
  if (error) {
    logger.warn('Query validation error:', { details: error.details });
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

// Validation schema for completion requests
const completionSchema = Joi.object({
  prompt: Joi.string().required(),
  max_tokens: Joi.number().integer().min(1).optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  model: Joi.string().optional()
});

// Validation middleware for completion requests
export const validateCompletion = (req, res, next) => {
  const { error } = completionSchema.validate(req.body);
  if (error) {
    logger.warn('Completion validation error:', { details: error.details });
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};
