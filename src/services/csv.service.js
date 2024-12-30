import { parse } from 'csv-parse';
import { Document } from '../models/document.model.js';
import { generateEmbeddings } from './embedding.service.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

export class CSVService {
  static async processCSV(fileBuffer, fileName) {
    const startTime = Date.now();
    logger.info('Starting CSV processing', { fileSize: fileBuffer.length, fileName });

    // Convert buffer to string and normalize line endings
    const content = fileBuffer.toString('utf-8');
    const lines = content.split('\n');
    
    // Detect and normalize delimiter
    const headerLine = lines[0];
    const firstDataLine = lines[1] || '';
    
    // If header uses different delimiter than data, normalize it
    const headerDelimiter = headerLine.includes(',') ? ',' : ';';
    const dataDelimiter = process.env.CSV_DELIMITER || ';';
    
    // Normalize the header if needed
    const normalizedContent = headerDelimiter !== dataDelimiter
      ? [headerLine.replace(/,/g, dataDelimiter), ...lines.slice(1)].join('\n')
      : content;

    logger.info('CSV Content Preview:', {
      totalLines: lines.length,
      headerLine,
      firstDataLine,
      headerDelimiter,
      dataDelimiter,
      normalizedHeaderLine: headerLine.replace(/,/g, dataDelimiter)
    });

    return new Promise((resolve, reject) => {
      const records = [];
      let recordCount = 0;
      let errorCount = 0;
      
      parse(Buffer.from(normalizedContent), {
        columns: true,
        skip_empty_lines: true,
        delimiter: dataDelimiter,
        quote: '"',
        escape: '"',
        relax_quotes: true,
        relax: true,
        trim: true,
        skip_records_with_error: true
      })
        .on('data', (record) => {
          try {
            recordCount++;
            if (recordCount % 100 === 0) {
              logger.info(`Processing record ${recordCount}...`);
            }
            
            // Log the raw record for debugging
            logger.debug('Processing raw record:', { 
              recordNum: recordCount,
              record: JSON.stringify(record)
            });
            
            // Log parsed record before validation
            logger.info('Parsed record:', { record });
            
            const processedRecord = this.validateAndProcessRecord(record, fileName);
            if (processedRecord) {
              records.push(processedRecord);
              logger.debug('Record validated and processed successfully:', { 
                recordNum: recordCount,
                record: JSON.stringify(processedRecord)
              });
            } else {
              errorCount++;
              logger.warn('Record validation failed:', { 
                recordNum: recordCount,
                record: JSON.stringify(record)
              });
            }
          } catch (error) {
            errorCount++;
            logger.error('Error processing record:', { 
              recordNum: recordCount,
              error: error.message,
              record: JSON.stringify(record)
            });
          }
        })
        .on('error', (error) => {
          logger.error('CSV parsing error:', error);
          reject(error);
        })
        .on('end', () => {
          const duration = Date.now() - startTime;
          logger.info('CSV processing completed', {
            fileName,
            totalRecords: recordCount,
            validRecords: records.length,
            errorCount,
            duration: `${duration}ms`
          });
          
          if (records.length === 0 && recordCount > 0) {
            logger.error('No valid records found despite having input rows', {
              totalRecords: recordCount,
              errorCount
            });
          }
          
          resolve(records);
        });
    });
  }

  static async processFileAsync(fileBuffer, fileName) {
    const jobId = Date.now().toString();
    logger.info('Starting async CSV processing', { jobId, fileName, fileSize: fileBuffer.length });

    // Start processing in the background
    this.processInBackground(fileBuffer, fileName, jobId).catch(error => {
      logger.error('Background processing failed', { jobId, fileName, error });
    });

    return {
      jobId,
      fileName,
      message: 'File upload successful. Processing started.',
      estimatedDuration: 'Processing time depends on file size. Check logs for progress.'
    };
  }

  static async cleanupExistingData(fileName) {
    logger.info('Checking for existing data', { fileName });
    
    // Find existing documents for this file
    const existingDocs = await Document.find({ fileName }, { code: 1 });
    
    if (existingDocs.length > 0) {
      logger.info('Found existing documents to clean up', { 
        fileName, 
        count: existingDocs.length 
      });

      // Get codes for Pinecone cleanup
      const existingCodes = existingDocs.map(doc => doc.code);

      // Delete from MongoDB
      await Document.deleteMany({ fileName });
      
      // Delete from Pinecone
      await this.deletePineconeVectors(existingCodes);

      logger.info('Cleaned up existing data', { 
        fileName, 
        deletedCount: existingDocs.length 
      });
    }
  }

  static async processInBackground(fileBuffer, fileName, jobId) {
    try {
      const startTime = Date.now();
      logger.info('Background processing started', { jobId, fileName });

      // Clean up existing data first
      await this.cleanupExistingData(fileName);

      // Step 1: Parse CSV
      const records = await this.processCSV(fileBuffer, fileName);
      if (!records || records.length === 0) {
        throw new Error('No valid records found in CSV');
      }

      logger.info('CSV parsing completed', { 
        jobId,
        fileName,
        recordCount: records.length 
      });

      // Step 2: Generate embeddings first (to fail fast if OpenAI has issues)
      logger.info('Generating embeddings...', { jobId, fileName });
      const embeddings = await generateEmbeddings(records, fileName);
      if (!embeddings || embeddings.length === 0) {
        throw new Error('Failed to generate embeddings');
      }

      // Step 3: Save to MongoDB
      logger.info('Saving to MongoDB...', { jobId, fileName });
      const savedRecords = await Document.insertMany(records);
      logger.info('MongoDB save completed', { 
        jobId,
        fileName,
        savedCount: savedRecords.length 
      });

      // Step 4: Save to Pinecone
      logger.info('Saving to Pinecone...', { jobId, fileName });
      await this.saveToPinecone(embeddings, fileName);
      
      const duration = Date.now() - startTime;
      
      logger.info('Background processing completed successfully', {
        jobId,
        fileName,
        duration: `${duration}ms`,
        recordCount: records.length
      });

    } catch (error) {
      logger.error('Background processing failed', { 
        jobId,
        fileName,
        error: {
          message: error.message,
          stack: error.stack
        }
      });
      
      // If we failed after saving to MongoDB but before Pinecone,
      // clean up the MongoDB records
      if (error.message.includes('Pinecone')) {
        logger.info('Rolling back MongoDB changes...', { jobId, fileName });
        await Document.deleteMany({ fileName });
      }
      
      throw error;
    }
  }

  static validateAndProcessRecord(record, fileName) {
    logger.debug('Validating record:', { record });
    
    const { code, metadata_small, metadata_big_1, metadata_big_2, metadata_big_3 } = record;
    
    if (!code || code.trim() === '') {
      logger.warn('Missing or empty code field:', { record });
      return null;
    }

    if (!metadata_small) {
      logger.warn('Missing metadata_small field:', { record });
      return null;
    }

    // Ensure metadata_small is a valid JSON string if it isn't already an object
    let parsedMetadataSmall = metadata_small;
    if (typeof metadata_small === 'string') {
      try {
        parsedMetadataSmall = JSON.parse(metadata_small);
      } catch (error) {
        logger.warn('Invalid JSON in metadata_small:', { 
          metadata_small,
          error: error.message 
        });
        return null;
      }
    }

    return {
      fileName,
      code: code.trim(),
      metadata_small: typeof parsedMetadataSmall === 'string' 
        ? parsedMetadataSmall 
        : JSON.stringify(parsedMetadataSmall),
      metadata_big_1: metadata_big_1 || '',
      metadata_big_2: metadata_big_2 || '',
      metadata_big_3: metadata_big_3 || ''
    };
  }

  static async saveToPinecone(embeddings, fileName) {
    if (!embeddings || embeddings.length === 0) {
      throw new Error('No embeddings to save to Pinecone');
    }

    // Add fileName to metadata for each vector
    const vectorsWithMetadata = embeddings.map(embedding => ({
      ...embedding,
      metadata: {
        ...embedding.metadata,
        fileName
      }
    }));

    // Implementation of Pinecone save
    // This should be implemented in the embedding.service.js
    return vectorsWithMetadata;
  }

  static async deletePineconeVectors(codes) {
    // Implementation of Pinecone vector deletion
    logger.info('Deleting vectors from Pinecone', { codes });
    // This should be implemented in the embedding.service.js
  }

  static async cleanupPinecone(jobId, fileName) {
    // Implement cleanup logic for Pinecone if needed
    logger.info('Cleaning up Pinecone data', { jobId, fileName });
  }
}