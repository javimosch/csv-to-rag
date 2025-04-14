import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

export async function setupMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}