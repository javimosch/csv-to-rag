import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from '../utils/logger.js';

export async function initPinecone() {
  logger.info('Initializing Pinecone client', 'initPinecone', {
    index: process.env.PINECONE_INDEX
  });

  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    
    return pinecone.index(process.env.PINECONE_INDEX, process.env.PINECONE_HOST);
  } catch (error) {
    logger.error('Failed to initialize Pinecone', 'initPinecone', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}