import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from '../utils/logger.js';

export async function setupPinecone() {
  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT
    });
    
    const index = pinecone.index(process.env.PINECONE_INDEX);
    logger.info('Pinecone connected successfully');
    return index;
  } catch (error) {
    logger.error('Pinecone connection error:', error);
    throw error;
  }
}