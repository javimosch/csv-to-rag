import { getOpenAI } from '../config/openai.js';
import { initPinecone } from '../config/pinecone.js';
import { logger } from '../utils/logger.js';

// Get batch configuration from environment variables
const BATCH_SIZE = parseInt(process.env.PINECONE_BATCH_SIZE || '100', 10);
const BATCH_DELAY = parseInt(process.env.PINECONE_BATCH_DELAY || '100', 10);

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

export async function generateEmbeddings(records) {
  try {
    const pineconeIndex = await initPinecone();
    const openai = getOpenAI();
    
    // Generate embeddings for all records
    const embeddings = await Promise.all(
      records.map(async (record) => {
        const text = `${record.metadata_small} ${JSON.stringify(record.metadata_big_1)} ${JSON.stringify(record.metadata_big_2)} ${JSON.stringify(record.metadata_big_3)}`;
        
        const embedding = await openai.embeddings.create({
          input: text,
          model: 'text-embedding-ada-002'
        });

        return {
          id: record.code,
          values: embedding.data[0].embedding,
          metadata: { code: record.code }
        };
      })
    );

    // Split embeddings into configurable batches
    const batches = chunkArray(embeddings, BATCH_SIZE);
    logger.info('Upserting embeddings in batches', { 
      totalVectors: embeddings.length,
      batchCount: batches.length,
      batchSize: BATCH_SIZE,
      batchDelay: BATCH_DELAY
    });

    // Process each batch with configurable delay
    for (const [index, batch] of batches.entries()) {
      logger.info('Processing batch', { 
        batchNumber: index + 1, 
        batchSize: batch.length 
      });
      
      await pineconeIndex.upsert(batch);
      
      logger.info('Batch processed successfully', { 
        batchNumber: index + 1,
        vectorsUpserted: batch.length,
        remainingBatches: batches.length - (index + 1)
      });

      // Add delay between batches if not the last batch
      if (index < batches.length - 1) {
        await delay(BATCH_DELAY);
      }
    }

    return embeddings;
  } catch (error) {
    logger.error('Error generating embeddings:', error);
    throw error;
  }
}