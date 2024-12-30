import express from 'express';
import multer from 'multer';
import { CSVService } from '../services/csv.service.js';
import { validateCSV } from '../middleware/validation.middleware.js';
import { logger } from '../utils/logger.js';
import { Document as Doc } from '../models/document.model.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    logger.info('Multer file details:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      fieldname: file.fieldname
    });
    
    // Accept files with .csv extension
    const validExtensions = ['.csv', '.txt'];
    const fileExtension = file.originalname.toLowerCase().match(/\.[^.]*$/);
    
    if (fileExtension && validExtensions.includes(fileExtension[0])) {
      return cb(null, true);
    }
    cb(new Error('Please upload a CSV file'));
  }
});

router.post('/upload', 
  (req, res, next) => {
    logger.info('Request headers:', req.headers);
    logger.info('Request files:', req.files);
    next();
  },
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
    const documents = await Doc.find({}, { code: 1, metadata_small: 1, timestamp: 1 });
    res.json(documents);
  } catch (error) {
    next(error);
  }
});

export const csvRoutes = router;