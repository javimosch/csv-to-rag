import express from 'express';
import multer from 'multer';
import { CSVService } from '../services/csv.service.js';
import { validateCSV } from '../middleware/validation.middleware.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', 
  upload.single('file'),
  validateCSV,
  async (req, res, next) => {
    try {
      const records = await CSVService.processCSV(req.file.buffer);
      const result = await CSVService.saveToDatabase(records);
      res.status(201).json(result);
    } catch (error) {
      logger.error('Error in CSV upload:', error);
      next(error);
    }
  }
);

router.get('/list', async (req, res, next) => {
  try {
    const documents = await Document.find({}, { code: 1, metadata_small: 1, timestamp: 1 });
    res.json(documents);
  } catch (error) {
    next(error);
  }
});

export const csvRoutes = router;