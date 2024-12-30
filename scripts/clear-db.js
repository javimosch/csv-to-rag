import inquirer from 'inquirer';
import { Pinecone } from '@pinecone-database/pinecone';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { logger } from '../src/utils/logger.js';

dotenv.config();

async function clearPineconeData() {
  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT
    });

    const index = pinecone.index(process.env.PINECONE_INDEX);
    
    // Delete all vectors in the index
    await index.deleteAll();
    
    logger.info('Successfully cleared all data from Pinecone');
  } catch (error) {
    logger.error('Error clearing Pinecone data:', error);
    throw error;
  }
}

async function clearMongoDBData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Get all collections
    const collections = await mongoose.connection.db.collections();
    
    // Drop each collection
    for (const collection of collections) {
      await collection.drop();
      logger.info(`Dropped collection: ${collection.collectionName}`);
    }
    
    logger.info('Successfully cleared all data from MongoDB');
  } catch (error) {
    logger.error('Error clearing MongoDB data:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

async function main() {
  try {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'WARNING: This will permanently delete all data from both Pinecone and MongoDB. Are you sure you want to continue?',
        default: false
      }
    ]);

    if (!confirm) {
      logger.info('Operation cancelled by user');
      process.exit(0);
    }

    logger.info('Starting database cleanup...');
    
    // Clear both databases
    await Promise.all([
      clearPineconeData(),
      clearMongoDBData()
    ]);
    
    logger.info('Successfully cleared all databases');
  } catch (error) {
    logger.error('Error during database cleanup:', error);
    process.exit(1);
  }
}

// Run the script
main();
