import { parse } from 'csv-parse';
import { Document } from '../models/document.model.js';
import { generateEmbeddings } from './embedding.service.js';
import { logger } from '../utils/logger.js';

export class CSVService {
  static async processCSV(fileBuffer) {
    return new Promise((resolve, reject) => {
      const records = [];
      
      parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true
      })
        .on('data', (record) => {
          try {
            const processedRecord = this.validateAndProcessRecord(record);
            records.push(processedRecord);
          } catch (error) {
            logger.error('Error processing record:', error);
          }
        })
        .on('end', () => resolve(records))
        .on('error', reject);
    });
  }

  static validateAndProcessRecord(record) {
    const { code, metadata_small, metadata_big_1, metadata_big_2, metadata_big_3 } = record;
    
    if (!code || !metadata_small) {
      throw new Error('Missing required fields');
    }

    return {
      code,
      metadata_small,
      metadata_big_1: JSON.parse(metadata_big_1),
      metadata_big_2: JSON.parse(metadata_big_2),
      metadata_big_3: JSON.parse(metadata_big_3)
    };
  }

  static async saveToDatabase(records) {
    const savedRecords = await Document.insertMany(records);
    const embeddings = await generateEmbeddings(records);
    return { savedRecords, embeddings };
  }
}