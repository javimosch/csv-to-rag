import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

let openaiInstance = null;
let openaiEmbeddingInstance = null;

export function initOpenAIEmbedding(){
  if (!openaiEmbeddingInstance) {
    logger.info('Initializing OpenAI embedding client',{
      key: (process.env.EMBEDDING_OPENAI_API_KEY||process.env.OPENAI_API_KEY).slice(0, 15),
      baseURL: process.env.EMBEDDING_OPENAI_BASE_URL||process.env.OPENAI_BASE_URL
    });
    openaiEmbeddingInstance = new OpenAI({
      apiKey: process.env.EMBEDDING_OPENAI_API_KEY||process.env.OPENAI_API_KEY,
      baseURL: process.env.EMBEDDING_OPENAI_BASE_URL||process.env.OPENAI_BASE_URL
    });
  }
  return openaiEmbeddingInstance;
}

export function initOpenAI() {
  if (!openaiInstance) {

    if(!process.env.OPENAI_BASE_URL){
      logger.error('OPENAI_BASE_URL is not set');
      process.exit(1);
    }

    logger.info('Initializing OpenAI client',{key: (process.env.OPENAI_API_KEY).slice(0, 15)});
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.PUBLIC_DOMAIN || 'http://localhost:3000',
        'X-Title': 'CSV to RAG'
      }
    });
  }
  return openaiInstance;
}

export function getOpenAI() {
  return initOpenAI();
}

export function getOpenAIEmbedding() {
  return initOpenAIEmbedding();
}