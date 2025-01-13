import inquirer from 'inquirer';
import { Pinecone } from '@pinecone-database/pinecone';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { logger } from '../src/utils/logger.js';
import { Document } from '../src/models/document.model.js';

dotenv.config();

// Cache vector dimension
const VECTOR_DIM = parseInt(process.env.VECTOR_DIM || '1536', 10);

async function clearPineconeData(fileName = null, namespace = 'default') {
  try {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });

    const index = pinecone.index(process.env.PINECONE_INDEX);
    
    if (fileName) {
      // Use zero vector trick to fetch vectors by metadata
      const zeroVector = new Array(VECTOR_DIM).fill(0);
      
      // Query vectors by fileName
      const response = await index.namespace(namespace).query({
        vector: zeroVector,
        filter: { fileName },
        topK: 10000, // Adjust if needed
        includeMetadata: true
      });

      if (response.matches && response.matches.length > 0) {
        // Delete vectors in batches
        const BATCH_SIZE = 100;
        const vectorIds = response.matches.map(match => match.id);
        
        for (let i = 0; i < vectorIds.length; i += BATCH_SIZE) {
          const batch = vectorIds.slice(i, i + BATCH_SIZE);
          await index.namespace(namespace).deleteMany(batch);
          logger.info(`Deleted batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(vectorIds.length/BATCH_SIZE)} (${batch.length} vectors)`);
        }
        
        logger.info(`Successfully deleted ${vectorIds.length} vectors for fileName: ${fileName}`);
      } else {
        logger.info(`No vectors found for fileName: ${fileName}`);
      }
    } else {
      // Delete all vectors in the index
      await index.deleteAll();
      logger.info('Successfully cleared all data from Pinecone');
    }
  } catch (error) {
    logger.error('Error clearing Pinecone data:', error);
    throw error;
  }
}

async function clearMongoDBData(fileName = null, namespace = 'default') {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    if (fileName) {
      // Delete documents for specific fileName
      const result = await Document.deleteMany({ fileName, namespace });
      logger.info(`Deleted ${result.deletedCount} documents for fileName: ${fileName}`);
    } else {
      // Get all collections
      const collections = await mongoose.connection.db.collections();
      
      // Drop each collection
      for (const collection of collections) {
        await collection.drop();
        logger.info(`Dropped collection: ${collection.collectionName}`);
      }
      
      logger.info('Successfully cleared all data from MongoDB');
    }
  } catch (error) {
    logger.error('Error clearing MongoDB data:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const fileNameArg = args.find(arg => arg.startsWith('--fileName='));
    const fileName = fileNameArg ? fileNameArg.split('=')[1] : null;
    
    const nsArg = args.find(arg => arg.startsWith('--ns=') || arg.startsWith('--namespace='));
    const namespace = nsArg ? nsArg.split('=')[1] : 'default';

    if (!fileNameArg) {
      const { confirmFileName } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmFileName',
          message: 'WARNING: You have not provided a fileName. Do you want to proceed without it?',
          default: false
        }
      ]);

      if (!confirmFileName) {
        logger.info('Operation cancelled due to missing fileName');
        return;
      }
    }

    if (!nsArg) {
      const { confirmNamespace } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmNamespace',
          message: 'WARNING: You have not provided a namespace. Do you want to proceed without it?',
          default: false
        }
      ]);

      if (!confirmNamespace) {
        logger.info('Operation cancelled due to missing namespace');
        return;
      }
    }

    if (fileName) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to clear all data for fileName: ${fileName} in namespace: ${namespace}?`,
          default: false
        }
      ]);

      if (!confirm) {
        logger.info('Operation cancelled');
        return;
      }

      logger.info(`Clearing data for fileName: ${fileName} in namespace: ${namespace}`);
      await clearMongoDBData(fileName, namespace);
      await clearPineconeData(fileName, namespace);
    } else {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to clear ALL data from both MongoDB and Pinecone?',
          default: false
        }
      ]);

      if (!confirm) {
        logger.info('Operation cancelled');
        return;
      }

      logger.info('Clearing all data...');
      await clearMongoDBData();
      await clearPineconeData();
    }

    logger.info('Data clearing completed successfully');
  } catch (error) {
    logger.error('Error in main:', error);
    process.exit(1);
  }
}

// Run the script
main();
