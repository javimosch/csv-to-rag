import express from 'express';
import multer from 'multer';
import { CSVService } from '../services/csv.service.js';
import { validateCsv } from '../middleware/validation.middleware.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 1, // 1 file
  },
});

router.post('/upload', upload.single('csvFile'), validateCsv, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Start async processing
    const result = await CSVService.processFileAsync(req.file.buffer, req.file.originalname);
    
    res.status(202).json({
      message: 'CSV file upload started',
      jobId: result.jobId,
      fileName: result.fileName
    });
  } catch (error) {
    logger.error('Error in CSV upload:', error);
    next(error);
  }
});

router.get('/list', async (req, res, next) => {
  try {
    const result = await CSVService.listCsvFiles();
    if (!result || !result.files) {
      return res.status(404).json({ error: 'No files found' });
    }
    res.json(result);
  } catch (error) {
    logger.error('Error listing CSV files:', error);
    next(error);
  }
});

router.put('/update/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const updatedRecord = await CSVService.updateCsvRecord(id, updatedData);
    if (!updatedRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(updatedRecord);
  } catch (error) {
    logger.error('Error updating CSV record:', error);
    next(error);
  }
});

// Delete entire file
router.delete('/file/:fileName', async (req, res, next) => {
  try {
    const { fileName } = req.params;
    if (!fileName) {
      return res.status(400).json({ 
        success: false,
        error: 'File name is required' 
      });
    }

    const result = await CSVService.deleteFile(fileName);
    res.json(result);
  } catch (error) {
    logger.error('Error deleting CSV file:', { 
      fileName: req.params.fileName,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error while deleting file'
    });
  }
});


export const csvRoutes = router;
