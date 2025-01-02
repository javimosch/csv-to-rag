import Joi from 'joi';
import { logger } from '../utils/logger.js';
import { parse } from 'csv-parse/sync';

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
  try {
    if (!req.file) {
      logger.warn('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvData = req.file.buffer.toString('utf-8');
    //logger.info('CSV Data:', csvData); // Log the raw CSV data

    const records = parse(csvData, {
      columns: true,
      delimiter: ';',
      skip_empty_lines: true
    });

    logger.info('Parsed Records:', records.length); // Log the parsed records

    if (records.length === 0) {
      logger.warn('CSV file is empty');
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    // Validate first row to check structure
    const { error } = csvSchema.validate(records[0]);
    if (error) {
      logger.warn('CSV validation error:', { details: error.details });
      return res.status(400).json({ error: error.details[0].message });
    }

    // Store parsed records for later use
    req.csvRecords = records;
    next();
  } catch (err) {
    logger.error('CSV parsing error:', err);
    return res.status(400).json({ error: 'Failed to parse CSV file' });
  }
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
