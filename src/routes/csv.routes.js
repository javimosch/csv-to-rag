import express from 'express';
import multer from 'multer';
import { CSVService } from '../services/csv.service.js';
import { validateCSV } from '../middleware/validation.middleware.js';
import { logger } from '../utils/logger.js';
import { Document } from '../models/document.model.js';

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
      const fileName = req.file.originalname;
      const result = await CSVService.processFileAsync(req.file.buffer, fileName);
      res.status(202).json(result); // 202 Accepted for async processing
    } catch (error) {
      logger.error('Error in CSV upload:', error);
      next(error);
    }
  }
);

router.get('/list', async (req, res, next) => {
  try {
    // Aggregate documents by fileName to get file-level statistics
    const fileStats = await Document.aggregate([
      {
        $group: {
          _id: '$fileName',
          rowCount: { $sum: 1 },
          lastUpdated: { $max: '$timestamp' },
          firstRow: { $first: '$$ROOT' }
        }
      },
      {
        $project: {
          _id: 0,
          fileName: '$_id',
          rowCount: 1,
          lastUpdated: 1,
          sampleMetadata: {
            code: '$firstRow.code',
            metadata_small: '$firstRow.metadata_small'
          }
        }
      },
      {
        $sort: { lastUpdated: -1 }
      }
    ]);
    logger.info('File list retrieved successfully', {
      fileCount: fileStats.length
    });
    res.json({
      totalFiles: fileStats.length,
      files: fileStats
    });
  } catch (error) {
    logger.error('Error retrieving file list:', error);
    next(error);
  }
});

export const csvRoutes = router;