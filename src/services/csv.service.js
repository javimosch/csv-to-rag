import { parse } from 'csv-parse';
import { Document } from '../models/document.model.js';
import { generateEmbeddings, deleteVectors, getVectorCountsByFileName } from './embedding.service.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

export class CSVService {
  static async processCSV(fileBuffer, fileName, namespace = 'default') {
    const startTime = Date.now();
    logger.info('Starting CSV processing', { fileSize: fileBuffer.length, fileName, namespace });

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
      //firstDataLine,
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
        quote: false, // Disable quote parsing
        escape: false, // Disable escape character handling
        relax: true,
        trim: true,
        skip_records_with_error: true,
        on_record: async (record, { lines }) => {
          try {
            recordCount++;
            if (recordCount % 100 === 0) {
              logger.info(`Processing record ${recordCount}...`);
            }
            
            // Log the raw record for debugging
            /* logger.debug('Processing raw record:', { 
              recordNum: recordCount,
              record: JSON.stringify(record)
            }); */
            
            // Log parsed record before validation
            //logger.info('Parsed record:', { record });
            
            const processedRecord = this.validateAndProcessRecord({
              ...record,
              metadata_big_1: String(record.metadata_big_1 || '').replace(/"/g, '\"'), // Ensure as string
              metadata_big_2: String(record.metadata_big_2 || '').replace(/"/g, '\"'), // Ensure as string
              metadata_big_3: String(record.metadata_big_3 || '').replace(/"/g, '\"')  // Ensure as string
            }, fileName, namespace);
            if (processedRecord) {
              records.push(processedRecord);
              /* logger.debug('Record validated and processed successfully:', { 
                recordNum: recordCount,
                record: JSON.stringify(processedRecord)
              }); */
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
            namespace,
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

  static async processFileAsync(fileBuffer, fileName, namespace = 'default') {
    const jobId = new mongoose.Types.ObjectId().toString();
    logger.info('Starting async CSV processing', { jobId, fileName, namespace, fileSize: fileBuffer.length });

    // Start processing in the background
    this.processInBackground(fileBuffer, fileName, namespace, jobId).catch(error => {
      logger.error('Background processing failed', { jobId, fileName, namespace, error });
    });

    return {
      jobId,
      fileName,
      namespace,
      message: 'File upload successful. Processing started.',
      estimatedDuration: 'Processing time depends on file size. Check logs for progress.'
    };
  }

  static async cleanupExistingData(fileName, namespace) {
    logger.info('Checking for existing data', { fileName, namespace });
    
    // Find existing documents for this file
    const existingDocs = await Document.find({ fileName, namespace }, { code: 1 });
    
    if (existingDocs.length > 0) {
      logger.info('Found existing documents to clean up', { 
        fileName, 
        namespace, 
        count: existingDocs.length 
      });

      // Get codes for Pinecone cleanup
      const existingCodes = existingDocs.map(doc => doc.code);

      // Delete from MongoDB
      await Document.deleteMany({ fileName, namespace });
      
      // Delete from Pinecone
      await this.deletePineconeVectors(existingCodes);

      logger.info('Cleaned up existing data', { 
        fileName, 
        namespace, 
        deletedCount: existingDocs.length 
      });
    }
  }

  static async processInBackground(fileBuffer, fileName, namespace, jobId) {
    try {
      const startTime = Date.now();
      logger.info('Background processing started', { jobId, fileName, namespace });

      // Clean up existing data first
      await this.cleanupExistingData(fileName, namespace);

      // Step 1: Parse CSV
      const records = await this.processCSV(fileBuffer, fileName, namespace);
      if (!records || records.length === 0) {
        throw new Error('No valid records found in CSV');
      }

      logger.info('CSV parsing completed', { 
        jobId,
        fileName,
        namespace,
        recordCount: records.length 
      });

      // Step 2: Generate embeddings first (to fail fast if OpenAI has issues)
      logger.info('Generating embeddings...', { jobId, fileName, namespace });
      const embeddings = await generateEmbeddings(records, namespace);
      if (!embeddings || embeddings.length === 0) {
        throw new Error('Failed to generate embeddings');
      }

      // Step 3: Save to MongoDB
      logger.info('Saving to MongoDB...', { jobId, fileName, namespace });
      const savedRecords = await Document.insertMany(records.map(record => ({ ...record, namespace })));
      logger.info('MongoDB save completed', { 
        jobId,
        fileName,
        namespace,
        savedCount: savedRecords.length 
      });

      // Step 4: Save to Pinecone
      logger.info('Saving to Pinecone...', { jobId, fileName, namespace });
      await this.saveToPinecone(embeddings, fileName, namespace);
      
      const duration = Date.now() - startTime;
      
      logger.info('Background processing completed successfully', {
        jobId,
        fileName,
        namespace,
        duration: `${duration}ms`,
        recordCount: records.length
      });

    } catch (error) {
      logger.error('Background processing failed', { 
        jobId,
        fileName,
        namespace,
        error: {
          message: error.message,
          stack: error.stack
        }
      });
      
      // If we failed after saving to MongoDB but before Pinecone,
      // clean up the MongoDB records
      if (error.message.includes('Pinecone')) {
        logger.info('Rolling back MongoDB changes...', { jobId, fileName, namespace });
        await Document.deleteMany({ fileName, namespace });
      }
      
      throw error;
    }
  }

  static isBase64(str) {
    try {
      // Check if the string matches base64 pattern
      if (!/^[A-Za-z0-9+/=]+$/.test(str)) return false;
      
      // Try to decode and check if it's valid UTF-8
      const decoded = Buffer.from(str, 'base64').toString('utf-8');
      return true;
    } catch (e) {
      return false;
    }
  }

  static decodeBase64IfNeeded(value) {
    if (!value) return '';
    if (this.isBase64(value)) {
      try {
        return Buffer.from(value, 'base64').toString('utf-8');
      } catch (e) {
        logger.warn('Failed to decode base64 value:', { value, error: e.message });
        return value;
      }
    }
    return value;
  }

  static validateAndProcessRecord(record, fileName, namespace) {
    const { code, metadata_small, metadata_big_1, metadata_big_2, metadata_big_3 } = record;
    
    if (!code || code.trim() === '') {
      logger.warn('Missing or empty code field:', { record });
      return null;
    }

    if (!metadata_small) {
      logger.warn('Missing metadata_small field:', { record });
      return null;
    }

    // Decode base64 metadata if needed
    return {
      fileName,
      namespace,
      code: code.trim(),
      metadata_small: this.decodeBase64IfNeeded(metadata_small),
      metadata_big_1: this.decodeBase64IfNeeded(metadata_big_1),
      metadata_big_2: this.decodeBase64IfNeeded(metadata_big_2),
      metadata_big_3: this.decodeBase64IfNeeded(metadata_big_3)
    };
  }

  static async saveToPinecone(embeddings, fileName, namespace) {
    if (!embeddings || embeddings.length === 0) {
      throw new Error('No embeddings to save to Pinecone');
    }

    // Add fileName and namespace to metadata for each vector
    const vectorsWithMetadata = embeddings.map(embedding => ({
      ...embedding,
      metadata: {
        ...embedding.metadata,
        fileName,
        namespace
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

  static async cleanupPinecone(jobId, fileName, namespace) {
    // Implement cleanup logic for Pinecone if needed
    logger.info('Cleaning up Pinecone data', { jobId, fileName, namespace });
  }

  static async listCsvFiles() {
    try {
      // Get unique file names, their document counts, and a sample document
      const files = await Document.aggregate([
        {
          $sort: { timestamp: -1 }  // Sort by newest first
        },
        {
          $group: {
            _id: { fileName: '$fileName', namespace: '$namespace' },
            rowCount: { $sum: 1 },
            lastUpdated: { $max: '$timestamp' },  // Use timestamp field
            sampleDoc: { $first: '$$ROOT' }  // Get the most recent document as sample
          }
        },
        {
          $project: {
            fileName: '$_id.fileName',
            namespace: '$_id.namespace',
            rowCount: 1,
            lastUpdated: 1,
            sampleMetadata: {
              code: '$sampleDoc.code',
              metadata_small: '$sampleDoc.metadata_small'
            },
            _id: 0
          }
        },
        {
          $sort: { lastUpdated: -1 }
        }
      ]);

      // Get vector counts from Pinecone
      const fileNames = files.map(file => file.fileName);
      const vectorCounts = await getVectorCountsByFileName(fileNames);

      // Add vector counts and sync status to the response
      const filesWithVectorCounts = files.map(file => ({
        ...file,
        vectorCount: vectorCounts.get(file.fileName) || 0,
        isInSync: (vectorCounts.get(file.fileName) || 0) === file.rowCount
      }));

      return {
        totalFiles: files.length,
        files: filesWithVectorCounts
      };
    } catch (error) {
      logger.error('Error in listCsvFiles:', error);
      throw error;
    }
  }

  static async deleteFile(fileName, namespace) {
    try {
      logger.info('Starting file deletion process', { fileName, namespace });

      // Get all document codes for Pinecone cleanup
      const documents = await Document.find({ fileName, namespace }, { code: 1 });
      const codes = documents.map(doc => doc.code);

      // Delete from MongoDB
      const deleteResult = await Document.deleteMany({ fileName, namespace });
      logger.info('Deleted documents from MongoDB', { 
        fileName, 
        namespace, 
        deletedCount: deleteResult.deletedCount 
      });

      // Delete from Pinecone
      if (codes.length > 0) {
        await deleteVectors(codes);
        logger.info('Deleted vectors from Pinecone', { 
          fileName, 
          namespace, 
          vectorCount: codes.length 
        });
      }

      return {
        success: true,
        deletedCount: deleteResult.deletedCount,
        vectorsDeleted: codes.length
      };
    } catch (error) {
      logger.error('Error deleting file:', { 
        fileName, 
        namespace, 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

}