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
    const csvFiles = await CSVService.listCsvFiles();
    res.json(csvFiles);
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

router.delete('/delete/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const deletedRecord = await CSVService.deleteCsvRecord(id);
    if (!deletedRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    logger.error('Error deleting CSV record:', error);
    next(error);
  }
});

export const csvRoutes = router;
