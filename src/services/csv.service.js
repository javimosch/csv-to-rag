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
        skip_empty_lines: true,
        delimiter: ',',
        quote: '"',
        escape: '"',
        relax_quotes: true,
        relax: true,
        columns_duplicates_to_array: true,
        trim: true,
        skip_records_with_error: true
      })
        .on('data', (record) => {
          try {
            const processedRecord = this.validateAndProcessRecord(record);
            if (processedRecord) {
              records.push(processedRecord);
            }
          } catch (error) {
            logger.error('Error processing record:', error);
          }
        })
        .on('end', () => resolve(records))
        .on('error', (error) => {
          logger.error('CSV parsing error:', error);
          reject(error);
        });
    });
  }

  static validateAndProcessRecord(record) {
    const { code, metadata_small, metadata_big_1, metadata_big_2, metadata_big_3 } = record;
    
    if (!code || !metadata_small) {
      logger.warn('Missing required fields in record:', record);
      return null;
    }

    // Log the record for debugging
    logger.info('Processing record:', record);

    return {
      code,
      metadata_small,
      metadata_big_1: metadata_big_1 || '',
      metadata_big_2: metadata_big_2 || '',
      metadata_big_3: metadata_big_3 || ''
    };
  }

  static async saveToDatabase(records) {
    const savedRecords = await Document.insertMany(records);
    const embeddings = await generateEmbeddings(records);
    return { savedRecords, embeddings };
  }
}