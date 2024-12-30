import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js'; // Adjusted import for logger

export function validateCSV(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  logger.info('Uploaded file details:', JSON.stringify(req.file, null, 2));

  // Check file extension instead of mimetype
  const validExtensions = ['.csv', '.txt'];
  const fileExtension = req.file.originalname.toLowerCase().match(/\.[^.]*$/);
  
  if (!fileExtension || !validExtensions.includes(fileExtension[0])) {
    return res.status(400).json({ error: 'Invalid file type. Please upload a CSV file' });
  }

  next();
}

export const validateQuery = [
  body('query')
    .notEmpty()
    .withMessage('Query is required')
    .isString()
    .withMessage('Query must be a string')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Query must be between 1 and 1000 characters'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];