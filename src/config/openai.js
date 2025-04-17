import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

let openaiInstance = null;

export function initOpenAI() {
  if (!openaiInstance) {

    if(!process.env.OPENAI_BASE_URL){
      logger.error('OPENAI_BASE_URL is not set');
      process.exit(1);
    }

    logger.info('Initializing OpenAI client');
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_MODEL,
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