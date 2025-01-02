import { parse } from 'csv-parse';
import { Document } from '../models/document.model.js';
import { generateEmbeddings, deleteVectors, getVectorCountsByFileName } from './embedding.service.js';
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
            /* logger.debug('Processing raw record:', { 
              recordNum: recordCount,
              record: JSON.stringify(record)
            }); */
            
            // Log parsed record before validation
            //logger.info('Parsed record:', { record });
            
            const processedRecord = this.validateAndProcessRecord(record, fileName);
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
    //logger.debug('Validating record:', { record });
    
    const { code, metadata_small, metadata_big_1, metadata_big_2, metadata_big_3 } = record;
    
    if (!code || code.trim() === '') {
      logger.warn('Missing or empty code field:', { record });
      return null;
    }

    if (!metadata_small) {
      logger.warn('Missing metadata_small field:', { record });
      return null;
    }

    return {
      fileName,
      code: code.trim(),
      metadata_small: metadata_small,
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

  static async listCsvFiles() {
    try {
      // Get unique file names, their document counts, and a sample document
      const files = await Document.aggregate([
        {
          $sort: { timestamp: -1 }  // Sort by newest first
        },
        {
          $group: {
            _id: '$fileName',
            rowCount: { $sum: 1 },
            lastUpdated: { $max: '$timestamp' },  // Use timestamp field
            sampleDoc: { $first: '$$ROOT' }  // Get the most recent document as sample
          }
        },
        {
          $project: {
            fileName: '$_id',
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

  static async deleteFile(fileName) {
    try {
      logger.info('Starting file deletion process', { fileName });

      // Get all document codes for Pinecone cleanup
      const documents = await Document.find({ fileName }, { code: 1 });
      const codes = documents.map(doc => doc.code);

      // Delete from MongoDB
      const deleteResult = await Document.deleteMany({ fileName });
      logger.info('Deleted documents from MongoDB', { 
        fileName, 
        deletedCount: deleteResult.deletedCount 
      });

      // Delete from Pinecone
      if (codes.length > 0) {
        await deleteVectors(codes);
        logger.info('Deleted vectors from Pinecone', { 
          fileName, 
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
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  static async repairFileMetadata(fileBuffer, originalFileName, targetFileName) {
    try {
      logger.info('Starting metadata repair process', {
        originalFileName,
        targetFileName,
        bufferSize: fileBuffer.length
      });

      // Parse the repair CSV file
      const repairRecords = await this.processCSV(fileBuffer, originalFileName);
      if (!repairRecords || repairRecords.length === 0) {
        throw new Error('No valid records found in repair CSV');
      }

      // Get existing documents
      const existingDocs = await Document.find({ fileName: targetFileName });
      logger.info('Found existing documents', {
        targetFileName,
        existingCount: existingDocs.length,
        repairCount: repairRecords.length
      });

      // Create a map of code to repair record for quick lookup
      const repairMap = new Map(repairRecords.map(record => [record.code, record]));

      // Update each existing document with new metadata
      let updatedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const doc of existingDocs) {
        try {
          const repairData = repairMap.get(doc.code);
          if (!repairData) {
            logger.warn('No repair data found for document', {
              code: doc.code,
              fileName: targetFileName
            });
            skippedCount++;
            continue;
          }

          // Update the document with new metadata
          const updateResult = await Document.updateOne(
            { _id: doc._id },
            {
              $set: {
                metadata_small: repairData.metadata_small,
                metadata_big_1: repairData.metadata_big_1,
                metadata_big_2: repairData.metadata_big_2,
                metadata_big_3: repairData.metadata_big_3,
                timestamp: new Date()  // Update timestamp
              }
            }
          );

          if (updateResult.modifiedCount > 0) {
            updatedCount++;
          } else {
            skippedCount++;
          }
        } catch (error) {
          errorCount++;
          logger.error('Error updating document:', {
            code: doc.code,
            error: error.message
          });
        }
      }

      return {
        success: true,
        fileName: targetFileName,
        stats: {
          existingDocuments: existingDocs.length,
          repairRecords: repairRecords.length,
          updated: updatedCount,
          skipped: skippedCount,
          errors: errorCount
        }
      };
    } catch (error) {
      logger.error('Error repairing file metadata:', {
        originalFileName,
        targetFileName,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}