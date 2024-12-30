import OpenAI from 'openai';
import { setupPinecone } from '../config/pinecone.js';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateEmbeddings(records) {
  try {
    const pineconeIndex = await setupPinecone();
    
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

    await pineconeIndex.upsert(embeddings);
    return embeddings;
  } catch (error) {
    logger.error('Error generating embeddings:', error);
    throw error;
  }
}