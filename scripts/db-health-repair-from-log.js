import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import mongoose from 'mongoose';
import { Document } from '../src/models/document.model.js';
import { embedDocument } from '../src/services/embedding.service.js';
import { logger } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

async function initServices() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('Connected to MongoDB');

        // Initialize Pinecone
        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });
        const index = pinecone.index(process.env.PINECONE_INDEX);
        logger.info('Connected to Pinecone');

        return index;
    } catch (error) {
        logger.error('Error initializing services:', error);
        throw error;
    }
}

async function closeServices() {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
}

async function readRepairLog(logPath) {
    try {
        const content = fs.readFileSync(logPath, 'utf-8');
        const sections = content.split('=== Extra MongoDB Documents for ');
        
        const documents = [];
        for (const section of sections) {
            if (!section.trim()) continue;
            
            // Split into filename and content
            const [fileName, jsonContent] = section.split('===\n\n');
            if (!jsonContent) continue;

            // Split content into JSON objects
            const jsonObjects = jsonContent.split('\n}\n')
                .map(chunk => chunk.trim())
                .filter(chunk => chunk)
                .map(chunk => {
                    // Add closing brace if it's missing
                    const jsonStr = chunk.endsWith('}') ? chunk : chunk + '}';
                    try {
                        return JSON.parse(jsonStr);
                    } catch (e) {
                        logger.warn(`Failed to parse JSON object:`, {
                            chunk: jsonStr,
                            error: e.message
                        });
                        return null;
                    }
                })
                .filter(doc => doc !== null);
            
            documents.push(...jsonObjects);
        }
        
        logger.info(`Successfully parsed ${documents.length} documents from log`);
        if (documents.length > 0) {
            logger.debug('First document:', documents[0]);
        }
        
        return documents;
    } catch (error) {
        logger.error('Error reading repair log:', error);
        throw error;
    }
}

async function repairVectors(pineconeIndex, documents) {
    try {
        logger.info(`Repairing ${documents.length} vectors`);
        
        for (const doc of documents) {
            try {
                // Re-embed the document
                const embedding = await embedDocument(doc.code, doc.metadata_small);
                if (!embedding) {
                    logger.error(`Failed to generate embedding for ${doc.code}`);
                    continue;
                }

                // Prepare metadata
                const metadata = {
                    code: doc.code,
                    fileName: doc.fileName,
                    metadata_small: doc.metadata_small
                };

                // Upsert to Pinecone
                await pineconeIndex.upsert([{
                    id: doc.code,
                    values: embedding,
                    metadata
                }]);

                logger.info(`Successfully repaired vector for ${doc.code}`);

                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                logger.error(`Failed to repair vector for ${doc.code}:`, {
                    error: {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    },
                    document: doc
                });
            }
        }
    } catch (error) {
        logger.error('Error repairing vectors:', error);
        throw error;
    }
}

async function main() {
    try {
        // Initialize services
        const pineconeIndex = await initServices();

        // Read repair log
        const logPath = join(__dirname, '..', 'repair.log');
        const documents = await readRepairLog(logPath);
        logger.info(`Found ${documents.length} documents to repair`);

        // Repair vectors
        await repairVectors(pineconeIndex, documents);

        logger.info('Repair completed');
    } catch (error) {
        logger.error('Error in main:', error);
        process.exit(1);
    } finally {
        await closeServices();
    }
}

main();
