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
      parse(Buffer.from(normalizedContent), {
        columns: true,
        skip_empty_lines: true,
        delimiter: dataDelimiter,
        quote: false,
        escape: false,
        relax: true,
        trim: true,
        skip_records_with_error: true,
      }, (err, parsedRecords) => {
        if (err) {
          logger.error('CSV parsing error:', err);
          return reject(err);
        }
        let errorCount = 0;
        let recordCount = 0;
        const records = [];
        for (const record of parsedRecords) {
          recordCount++;
          if (recordCount % 100 === 0) {
            logger.info(`Processing record ${recordCount}...`);
          } else {
            logger.debug(`Processing record ${recordCount}...`);
          }
          try {
            const processedRecord = this.validateAndProcessRecord({
              ...record,
              metadata_big_1: String(record.metadata_big_1 || '').replace(/"/g, '\"'),
              metadata_big_2: String(record.metadata_big_2 || '').replace(/"/g, '\"'),
              metadata_big_3: String(record.metadata_big_3 || '').replace(/"/g, '\"')
            }, fileName, namespace);
            if (processedRecord) {
              records.push(processedRecord);
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
        const duration = Date.now() - startTime;
        logger.info('CSV processing completed', {
          fileName,
          namespace,
          totalRecords: recordCount,
          validRecords: records.length,
          errorCount,
          duration: `${duration}ms`
        });
        console.log('src/services/csv.service.js processCSV CSV parsing ended, resolving promise', { fileName, namespace, recordCount, validRecords: records.length });
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
    logger.info('Enqueuing background processing', { jobId, fileName, namespace });
    this.processInBackground(fileBuffer, fileName, namespace, jobId)
      .then(() => logger.info('Background processing promise resolved', { jobId }))
      .catch(error => {
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
      logger.debug('About to cleanup existing data', { jobId, fileName, namespace });
      await this.cleanupExistingData(fileName, namespace);
      logger.info('cleanupExistingData completed', { jobId, fileName, namespace });

      // Step 1: Parse CSV
      logger.debug('About to parse CSV file', { jobId, fileName, namespace });
      const records = await this.processCSV(fileBuffer, fileName, namespace);
      console.log('src/services/csv.service.js processInBackground CSV parsing promise resolved', { jobId, fileName, namespace, recordCount: records.length });
      logger.info('CSV parsing and validation completed', { jobId, fileName, namespace, recordCount: records.length });
      if (!records || records.length === 0) {
        throw new Error('No valid records found in CSV');
      }

      logger.info('CSV parsing completed', { 
        jobId,
        fileName,
        namespace,
        recordCount: records.length 
      });

      // Step 2: Generate embeddings and save to Pinecone/MongoDB
      logger.debug('About to generate embeddings', { jobId, fileName, namespace });
      console.log('src/services/csv.service.js processInBackground Before generateEmbeddings', { jobId, fileName, namespace, recordCount: records.length });
      const embeddingResult = await generateEmbeddings(records, namespace);
      console.log('src/services/csv.service.js processInBackground After generateEmbeddings', { jobId, fileName, namespace, embeddingResult });
      logger.info('Embedding generation completed', { jobId, fileName, namespace, ...embeddingResult });
      // embeddingResult should include successful & failed counts
      if (!embeddingResult || embeddingResult.successful === 0) {
        throw new Error('No embeddings were successfully generated');
      }
      // For downstream Pinecone upload, regenerate detailed embeddings if needed
      const embeddings = Array.isArray(embeddingResult.embeddings) ? embeddingResult.embeddings : records;

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
      logger.info('Saving to Pinecone metadata...', { jobId, fileName, namespace });
      const savedVectors = await this.saveToPinecone(embeddings, fileName, namespace);
      logger.info('Pinecone save completed', { jobId, fileName, namespace, vectorCount: Array.isArray(savedVectors) ? savedVectors.length : null });
      
      const duration = Date.now() - startTime;
      logger.info('Background processing completed successfully', {
        jobId,
        fileName,
        namespace,
        duration: `${duration}ms`,
        recordsProcessed: records.length,
        vectorsSaved: Array.isArray(savedVectors) ? savedVectors.length : undefined
      });

    } catch (err) {
      console.log('src/services/csv.service.js processInBackground Error', { jobId, fileName, namespace, message: err.message, stack: err.stack, axiosData: err?.response?.data });
      logger.error('Background processing failed', { 
        jobId,
        fileName,
        namespace,
        error: {
          message: err.message,
          stack: err.stack
        }
      });
      // If we failed after saving to MongoDB but before Pinecone,
      // clean up the MongoDB records
      if (err.message && err.message.includes('Pinecone')) {
        logger.info('Rolling back MongoDB changes...', { jobId, fileName, namespace });
        await Document.deleteMany({ fileName, namespace });
      }
      throw err;
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

      // Compute vector counts per namespace
      const namespaces = [...new Set(files.map(f => f.namespace))];
      const vectorCountsByNs = {};
      for (const ns of namespaces) {
        const fileNamesForNs = files
          .filter(f => f.namespace === ns)
          .map(f => f.fileName);
        vectorCountsByNs[ns] = await getVectorCountsByFileName(fileNamesForNs, ns);
      }

      // Add vector counts and sync status to the response
      const filesWithVectorCounts = files.map(file => {
        const countsMap = vectorCountsByNs[file.namespace] || new Map();
        const vectorCount = countsMap.get(file.fileName) || 0;
        return {
          ...file,
          vectorCount,
          isInSync: vectorCount === file.rowCount
        };
      });

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

  /**
   * Get a list of all available namespaces in the system
   * @returns {Promise<Array<string>>} Array of unique namespace names
   */
  static async getNamespaces() {
    try {
      // scripts/deno-ui/app/csv.service.js getNamespaces Retrieving available namespaces
      logger.info('Retrieving available namespaces', {data: {}});
      
      // Use MongoDB aggregation to get unique namespaces
      const result = await Document.aggregate([
        // Group by namespace
        { $group: { _id: '$namespace' } },
        // Sort alphabetically
        { $sort: { _id: 1 } },
        // Project to get a clean array
        { $project: { namespace: '$_id', _id: 0 } }
      ]);
      
      // Extract namespace values from result
      const namespaces = result.map(item => item.namespace);
      
      logger.info('Retrieved namespaces', {data: {count: namespaces.length, namespaces}});
      return namespaces;
    } catch (error) {
      logger.error('Error retrieving namespaces:', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

}