import { getOpenAIEmbedding } from '../config/openai.js';
import { initPinecone } from '../config/pinecone.js';
import { logger } from '../utils/logger.js';
import { Document } from '../models/document.model.js';
import { getChromaCollection } from '../config/chroma.js';

// Use Chroma vector store if CHROMA_BASE_URL is set
const useChroma = Boolean(process.env.CHROMA_BASE_URL);

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


async function embedDocument(code, metadata_small) {
  try {

      console.debug('Embedding document:', {
        model: process.env.EMBEDDING_OPENAI_MODEL||"text-embedding-ada-002"
      });

      const openai = getOpenAIEmbedding();
      const response = await openai.embeddings.create({
          input: `${code}\n${metadata_small}`,
          model: process.env.EMBEDDING_OPENAI_MODEL||"text-embedding-ada-002"
      });
      
      if (!response || !response.data || !response.data[0]) {
          logger.error('Invalid embedding response from OpenAI:', response);
          return null;
      }
      
      return response.data[0].embedding;
  } catch (error) {
      logger.error(`Error generating embedding for ${code}:`, {
          message: error.message,
          stack: error.stack
      });
      return null;
  }
}

async function generateEmbeddingBatch(records, openai) {
  const embeddingPromises = records.map(async (record) => {
    try {
      // Only use code and metadata_small for embeddings
      const text = `${record.code}\n${record.metadata_small}`;
      
      console.debug('Embedding document:', {
        model: process.env.EMBEDDING_OPENAI_MODEL||"text-embedding-ada-002"
      });

      const embedding = await openai.embeddings.create({
        input: text,
        model: process.env.EMBEDDING_OPENAI_MODEL||"text-embedding-ada-002"
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

/**
 * Save a batch of embeddings and records to the vector store and MongoDB.
 */
async function saveBatchToStorage(embeddings, pineconeIndex) {
  console.log('src/services/embedding.service.js saveBatchToStorage Called', { embeddingsCount: embeddings.length });
  try {
    // Save records to MongoDB
    const documents = embeddings.map(item => item.record);
    console.log('src/services/embedding.service.js saveBatchToStorage Before insertMany', { documentsCount: documents.length });
    await Document.insertMany(documents);
    console.log('src/services/embedding.service.js saveBatchToStorage After insertMany', { documentsCount: documents.length });
    logger.info('Saved batch to MongoDB', { count: documents.length });

    if (useChroma) {
      // Save embeddings to Chroma collection per namespace
      const namespace = embeddings[0].record.namespace || 'default';
      const collection = await getChromaCollection(namespace);
      const ids = embeddings.map(item => item.embedding.id);
      const vectors = embeddings.map(item => item.embedding.values);
      const metadatas = embeddings.map(item => item.embedding.metadata);
      const docs = embeddings.map(item => item.record.code);
      console.log('src/services/embedding.service.js saveBatchToStorage Adding to Chroma', { namespace, vectorsCount: ids.length });
      await collection.add({ ids, embeddings: vectors, metadatas, documents: docs });
      logger.info('Saved batch to Chroma', { count: ids.length, namespace });
    } else {
      // Save embeddings to Pinecone
      const vectors = embeddings.map(item => item.embedding);
      if (vectors.length > 0) {
        console.log('src/services/embedding.service.js saveBatchToStorage Before pineconeIndex.upsert', { vectorsCount: vectors.length });
        await pineconeIndex.upsert({ vectors });
        console.log('src/services/embedding.service.js saveBatchToStorage After pineconeIndex.upsert', { vectorsCount: vectors.length });
        logger.info('Saved batch to Pinecone', { count: vectors.length });
      }
    }
  } catch (err) {
    console.log('src/services/embedding.service.js saveBatchToStorage Error', { message: err.message, stack: err.stack, axiosData: err?.response?.data });
    logger.error('Error saving batch:', err);
    throw err;
  }
}

async function generateEmbeddings(records) {
  // src/services/embedding.service.js generateEmbeddings Starting embedding generation
  console.log('src/services/embedding.service.js generateEmbeddings Starting embedding generation', { totalRecords: records.length });
  try {
    // Initialize vector store client if using Pinecone
    let pineconeIndex;
    if (!useChroma) {
      pineconeIndex = await initPinecone();
    }
    const openai = getOpenAIEmbedding();
    console.log('src/services/embedding.service.js generateEmbeddings OpenAI embedding client initialized', {});
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
        // src/services/embedding.service.js generateEmbeddings Processing batch
        console.log('src/services/embedding.service.js generateEmbeddings Processing batch', { batchIndex: index+1, batchSize: batch.length });
        logger.info(`Processing batch ${index + 1}/${recordBatches.length}`);
        
        // Generate embeddings for the batch
        console.log('src/services/embedding.service.js generateEmbeddings Before generateEmbeddingBatch', { batchIndex: index+1 });
        const batchResults = await generateEmbeddingBatch(batch, openai);
        console.log('src/services/embedding.service.js generateEmbeddings After generateEmbeddingBatch', { batchIndex: index+1, batchResultsCount: batchResults.length });
        
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
      } catch (err) {
        console.log('src/services/embedding.service.js generateEmbeddings Error in batch', { batchIndex: index+1, message: err.message, stack: err.stack, axiosData: err?.response?.data });
        logger.error(`Error processing batch ${index + 1}:`, err);
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
  } catch (err) {
    console.log('src/services/embedding.service.js generateEmbeddings Fatal error', { message: err.message, stack: err.stack, axiosData: err?.response?.data });
    logger.error('Error in generateEmbeddings:', err);
    throw err;
  }
}

/**
 * Delete vectors by IDs from the vector store.
 * Supports both Pinecone and Chroma.
 */
async function deleteVectors(codes) {
  try {
    if (!codes || codes.length === 0) {
      logger.warn('No codes provided for vector deletion');
      return;
    }
    if (useChroma) {
      // Delete from Chroma default collection or namespace-specific
      const namespace = 'default';
      const collection = await getChromaCollection(namespace);
      await collection.delete({ ids: codes });
      logger.info('Deleted vectors from Chroma', { count: codes.length, namespace });
    } else {
      const pineconeIndex = await initPinecone();
      const batches = chunkArray(codes, BATCH_SIZE());
      logger.info('Starting vector deletion (Pinecone)', { totalVectors: codes.length, batchCount: batches.length });
      for (const batch of batches) {
        try {
          await pineconeIndex.deleteMany({ ids: batch });
          logger.info('Deleted vector batch (Pinecone)', { batchSize: batch.length });
          await delay(BATCH_DELAY());
        } catch (error) {
          logger.error('Error deleting vector batch (Pinecone):', { error: error.message, batch });
          throw error;
        }
      }
      logger.info('Vector deletion completed (Pinecone)', { totalVectorsDeleted: codes.length });
    }
  } catch (error) {
    logger.error('Error in deleteVectors:', error);
    throw error;
  }
}

/**
 * Get vector counts for given CSV file names optionally scoped to a Pinecone namespace.
 * @param {string[]} fileNames - Array of CSV file names (metadata.fileName).
 * @param {string} [namespace] - Pinecone namespace to query. If omitted, queries default.
 * @returns {Promise<Map<string, number>>} Map of fileName to vector count.
 */
/**
 * Get vector counts per fileName, scoped to a namespace.
 * For Chroma, counts via MongoDB documents; for Pinecone, queries vector store.
 */
async function getVectorCountsByFileName(fileNames, namespace) {
  if (!fileNames || fileNames.length === 0) {
    return new Map();
  }
  if (useChroma) {
    const counts = new Map();
    // Use Chroma collection query to count embeddings per fileName
    const collection = await getChromaCollection(namespace);
    const dim = parseInt(process.env.VECTOR_DIM || '1536', 10);
    const zeroVector = new Array(dim).fill(0);
    for (const fileName of fileNames) {
      try {
        // Determine how many results to fetch (based on document count)
        const docCount = await Document.countDocuments({ fileName, namespace });
        const results = await collection.query({
          queryEmbeddings: [zeroVector],
          nResults: docCount,
          where: { fileName }
        });
        const matchCount = results.ids?.[0]?.length || 0;
        counts.set(fileName, matchCount);
      } catch (error) {
        logger.error('Error getting vector count for file (Chroma):', { fileName, namespace, error: error.message });
        counts.set(fileName, 0);
      }
    }
    return counts;
  }
  // Pinecone fallback
  try {
    const pineconeIndex = await initPinecone();
    const counts = new Map();
    const dim = parseInt(process.env.VECTOR_DIM || '1536', 10);
    for (const fileName of fileNames) {
      try {
        const zeroVector = new Array(dim).fill(0);
        const queryOptions = { vector: zeroVector, filter: { fileName }, topK: 10000, includeMetadata: false };
        const queryResponse = namespace
          ? await pineconeIndex.namespace(namespace).query(queryOptions)
          : await pineconeIndex.query(queryOptions);
        counts.set(fileName, queryResponse.matches?.length || 0);
        await new Promise(res => setTimeout(res, 100));
      } catch (error) {
        logger.error('Error getting vector count for file (Pinecone):', { fileName, namespace, error: error.message });
        counts.set(fileName, 0);
      }
    }
    return counts;
  } catch (error) {
    logger.error('Error getting vector counts (Pinecone):', error);
    throw error;
  }
}

export {
  embedDocument,
  generateEmbeddings,
  deleteVectors,
  getVectorCountsByFileName
};
