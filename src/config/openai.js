import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

let openaiInstance = null;
let openrouterInstance = null;

export function initOpenAI() {
  if (!openaiInstance) {
    logger.info('Initializing OpenAI client');
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiInstance;
}

export function initOpenRouter() {
  if (!openrouterInstance) {
    logger.info('Initializing OpenRouter client');
    openrouterInstance = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.PUBLIC_DOMAIN || 'http://localhost:3000',
        'X-Title': 'CSV to RAG'
      }
    });
  }
  return openrouterInstance;
}

export function getOpenAI() {
  return initOpenAI();
}

export function getOpenRouter() {
  return initOpenRouter();
}
