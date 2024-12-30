import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

let openaiInstance = null;

export function initOpenAI() {
  if (!openaiInstance) {
    logger.info('Initializing OpenAI client');
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiInstance;
}

export function getOpenAI() {
  if (!openaiInstance) {
    return initOpenAI();
  }
  return openaiInstance;
}
