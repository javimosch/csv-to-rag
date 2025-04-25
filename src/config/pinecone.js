import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from '../utils/logger.js';

// Singleton Pinecone index instance
let pineconeIndexInstance = null;

export async function initPinecone() {
  console.log('src/config/pinecone.js initPinecone Ensuring Pinecone index singleton', { index: process.env.PINECONE_INDEX });
  if (pineconeIndexInstance) {
    return pineconeIndexInstance;
  }
  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    pineconeIndexInstance = pinecone.index(process.env.PINECONE_INDEX, process.env.PINECONE_HOST);
    return pineconeIndexInstance;
  } catch (err) {
    console.log('src/config/pinecone.js initPinecone Error initializing Pinecone client', { message: err.message, stack: err.stack });
    throw err;
  }
}