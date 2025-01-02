import { getOpenAI } from '../config/openai.js';
import { initPinecone } from '../config/pinecone.js';
import { logger } from '../utils/logger.js';
import { Document } from '../models/document.model.js';

// Get batch configuration from environment variables
const BATCH_SIZE = ()=>parseInt(process.env.PINECONE_BATCH_SIZE || '100', 10);
const BATCH_DELAY = ()=>parseInt(process.env.PINECONE_BATCH_DELAY || '100', 10);
const EMBEDDING_BATCH_SIZE = ()=>parseInt(process.env.EMBEDDING_BATCH_SIZE || '20', 10);

// Utility function to chunk array into batches
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Utility function to add delay between operations
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function generateEmbeddingBatch(records, openai) {
  const embeddingPromises = records.map(async (record) => {
    try {
      // Only use code and metadata_small for embeddings
      const text = `${record.code}\n${record.metadata_small}`;
      
      const embedding = await openai.embeddings.create({
        input: text,
        model: 'text-embedding-ada-002'
      });

      return {
        record,
        embedding: {
          id: record.code,
          values: embedding.data[0].embedding,
          metadata: { 
            code: record.code,
            metadata_small: record.metadata_small
          }
        }
      };
    } catch (error) {
      logger.error('Error generating embedding for record:', { 
        code: record.code,
        error: error.message 
      });
      // Return null for failed embeddings, will be filtered out later
      return null;
    }
  });

  const results = await Promise.all(embeddingPromises);
  return results.filter(result => result !== null);
}

async function saveBatchToStorage(embeddings, pineconeIndex) {
  try {
    // Save records to MongoDB
    const documents = embeddings.map(item => item.record);
    await Document.insertMany(documents);
    logger.info('Saved batch to MongoDB', { count: documents.length });

    // Save embeddings to Pinecone
    const vectors = embeddings.map(item => item.embedding);
    if (vectors.length > 0) {
      await pineconeIndex.upsert({
        vectors: vectors
      });
      logger.info('Saved batch to Pinecone', { count: vectors.length });
    }
  } catch (error) {
    logger.error('Error saving batch:', error);
    throw error;
  }
}

async function generateEmbeddings(records) {
  try {
    const pineconeIndex = await initPinecone();
    const openai = getOpenAI();
    
    // Split records into smaller batches for embedding generation
    const recordBatches = chunkArray(records, EMBEDDING_BATCH_SIZE());
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    
    logger.info('Processing embeddings in batches', { 
      totalRecords: records.length,
      batchCount: recordBatches.length,
      batchSize: EMBEDDING_BATCH_SIZE()
    });

    // Process each batch and save immediately
    for (const [index, batch] of recordBatches.entries()) {
      try {
        logger.info(`Processing batch ${index + 1}/${recordBatches.length}`);
        
        // Generate embeddings for the batch
        const batchResults = await generateEmbeddingBatch(batch, openai);
        
        // Save successful embeddings immediately
        if (batchResults.length > 0) {
          await saveBatchToStorage(batchResults, pineconeIndex);
          successCount += batchResults.length;
        }
        
        errorCount += batch.length - batchResults.length;
        processedCount += batch.length;
        
        // Log progress
        logger.info('Batch processing progress', {
          batch: index + 1,
          totalBatches: recordBatches.length,
          processedCount,
          successCount,
          errorCount,
          progress: `${Math.round((processedCount / records.length) * 100)}%`
        });
        
        // Add a small delay between batches to avoid rate limits
        if (index < recordBatches.length - 1) {
          await delay(BATCH_DELAY());
        }
      } catch (error) {
        logger.error(`Error processing batch ${index + 1}:`, error);
        errorCount += batch.length;
        processedCount += batch.length;
        // Continue with next batch even if this one failed
      }
    }

    logger.info('Embedding generation completed', {
      totalProcessed: processedCount,
      successful: successCount,
      failed: errorCount
    });

    return {
      totalProcessed: processedCount,
      successful: successCount,
      failed: errorCount
    };
  } catch (error) {
    logger.error('Error in generateEmbeddings:', error);
    throw error;
  }
}

async function deleteVectors(codes) {
  try {
    if (!codes || codes.length === 0) {
      logger.warn('No codes provided for vector deletion');
      return;
    }

    const pineconeIndex = await initPinecone();
    
    // Delete in batches to avoid overwhelming Pinecone
    const batches = chunkArray(codes, BATCH_SIZE());
    
    logger.info('Starting vector deletion', { 
      totalVectors: codes.length,
      batchCount: batches.length 
    });

    for (const batch of batches) {
      try {
        await pineconeIndex.deleteMany({
          ids: batch
        });
        
        logger.info('Deleted vector batch', { 
          batchSize: batch.length 
        });
        
        // Add delay between batches
        await delay(BATCH_DELAY());
      } catch (error) {
        logger.error('Error deleting vector batch:', { 
          error: error.message,
          batch 
        });
        throw error;
      }
    }

    logger.info('Vector deletion completed', { 
      totalVectorsDeleted: codes.length 
    });
  } catch (error) {
    logger.error('Error in deleteVectors:', error);
    throw error;
  }
}

async function getVectorCountsByFileName(fileNames) {
  try {
    if (!fileNames || fileNames.length === 0) {
      return new Map();
    }

    const pineconeIndex = await initPinecone();
    const counts = new Map();

    // Query Pinecone for each file name
    for (const fileName of fileNames) {
      try {
        const queryResponse = await pineconeIndex.describeIndexStats({
          filter: {
            fileName: fileName
          }
        });

        counts.set(fileName, queryResponse.totalVectorCount || 0);
        
        // Add delay to avoid rate limiting
        await delay(100);
      } catch (error) {
        logger.error('Error getting vector count for file:', {
          fileName,
          error: error.message
        });
        counts.set(fileName, 0);
      }
    }

    return counts;
  } catch (error) {
    logger.error('Error getting vector counts:', error);
    throw error;
  }
}

export {
  generateEmbeddings,
  deleteVectors,
  getVectorCountsByFileName
};
