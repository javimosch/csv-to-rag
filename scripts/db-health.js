import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { Document } from '../src/models/document.model.js';
import { logger } from '../src/utils/logger.js';
import fs from 'fs';
import { parse } from 'csv-parse';
import { getOpenAI } from '../src/config/openai.js';
import readline from 'readline';
import { embedDocument } from '../src/services/embedding.service.js';
// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
config({ path: envPath });

async function parseCsvFile(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        return new Promise((resolve, reject) => {
            // Using csv-parse library: https://csv.js.org/parse/
            parse(fileContent, {
                delimiter: ';',
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,  // Allow flexible column count for JSON
                quote: false,              // Disable quote parsing to handle JSON
                comment: '#'               // Allow comments starting with #
            }, (err, records) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Treat JSON fields as strings
                const parsedRecords = records.map(record => ({
                    ...record,
                    metadata_small: record.metadata_small || "",
                    metadata_big_1: record.metadata_big_1 || "",
                    metadata_big_2: record.metadata_big_2 || ""
                }));

                resolve(parsedRecords);
            });
        });
    } catch (error) {
        logger.error('Error parsing CSV file:', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function connectToMongoDB() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        logger.info('Connecting to MongoDB...');
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        });
        logger.info('Connected to MongoDB');
    } catch (error) {
        logger.error('Error connecting to MongoDB:', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function initPinecone() {
    try {
        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });

        const index = pinecone.index(process.env.PINECONE_INDEX);
        logger.info('Initialized Pinecone client', 'initPinecone');

        return index;
    } catch (error) {
        logger.error('Error initializing Pinecone:', error);
        throw error;
    }
}


// Cache vector dimension after first embedding
const VECTOR_DIM = parseInt(process.env.VECTOR_DIM || '1536', 10);

async function getVectorDimension() {
    return VECTOR_DIM;
}

async function upsertVectors(pineconeIndex, vectors) {
    try {
        logger.debug(`Upserting ${vectors.length} vectors`);

        // Ensure we have valid vectors
        const validVectors = vectors.filter(vector => {
            if (!vector.id || !vector.values || !vector.metadata) {
                logger.warn(`Invalid vector format for id: ${vector.id}`);
                return false;
            }
            // Log metadata
            //logger.debug(`Vector ${vector.id} metadata:`, vector.metadata);
            return true;
        });

        if (validVectors.length === 0) {
            logger.warn('No valid vectors to upsert');
            return false;
        }

        // Format vectors for Pinecone API
        const formattedVectors = validVectors.map(vector => ({
            id: vector.id,
            values: Array.from(vector.values), // Ensure it's a proper array
            metadata: vector.metadata
        }));

        // Log first vector for debugging
        //logger.debug('First formatted vector:', formattedVectors[0]);

        // Batch upsert to Pinecone
        await pineconeIndex.upsert(formattedVectors);

        return true;
    } catch (error) {
        logger.error('Error upserting vectors:', {
            message: error.message,
            stack: error.stack
        });
        throw error; // Re-throw to abort the process
    }
}

async function fetchVectorByCode(pineconeIndex, code) {
    try {
        // Get vector dimension for zero vector
        const dim = await getVectorDimension();
        //const zeroVector = new Array(dim).fill(0);

        // Query by id with zero vector
        const response = await pineconeIndex.query({
            id: code,
            //filter: { code },
            topK: 1,
            includeMetadata: true,
            includeValues: true // Make sure to get vector values
        });

        const match = response.matches[0];
        if (!match) {
            //logger.warn(`No vector found for code: ${code}`);
            return null;
        }

        if (!match.values) {
            logger.error(`Vector found but no values for code: ${code}`);
            return null;
        }

        // Validate vector dimension
        if (match.values.length !== dim) {
            logger.error(`Invalid vector dimension for ${code}: got ${match.values.length}, expected ${dim}`);
            return null;
        }

        return {
            id: match.id,
            values: match.values,
            metadata: match.metadata
        };
    } catch (error) {
        logger.error(`Error fetching vector for code ${code}:`, {
            message: error.message,
            stack: error.stack
        });
        return null;
    }
}

async function promptUser(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(message + ' (y/N): ', answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

async function repairMetadata(pineconeIndex, csvPath, options = { auto: false }) {
    try {
        // Extract fileName from csvPath
        const fileName = csvPath.split('/').pop();
        logger.info(`Using fileName: ${fileName}`);

        // Parse CSV file
        const records = await parseCsvFile(csvPath);
        if (!records || records.length === 0) {
            throw new Error('No records found in CSV file');
        }
        logger.info(`Found ${records.length} records in CSV file`);

        // Calculate dynamic batch size for max 5 batches
        const batchSize = Math.max(10, Math.ceil(records.length / 5));
        logger.info(`Using batch size: ${batchSize}`);

        // Process records in batches
        const batches = [];
        for (let i = 0; i < records.length; i += batchSize) {
            batches.push(records.slice(i, i + batchSize));
        }

        logger.info(`Processing ${batches.length} batches`);

        for (const [index, batch] of batches.entries()) {
            try {
                logger.info(`Processing batch ${index + 1}/${batches.length} (${batch.length} records)`);
                await processBatch(pineconeIndex, batch.map(record => ({ ...record, fileName })), options.auto);
            } catch (error) {
                logger.error(`Error processing batch ${index + 1}:`, error);
                throw error;
            }
        }

        logger.info('Metadata repair completed successfully');
    } catch (error) {
        logger.error('Error repairing metadata:', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}



async function processBatch(pineconeIndex, batch, isAuto = false) {
    try {
        // Display the batch
        console.log('Repair', batch.length, 'records?');

        // If not auto, prompt for confirmation
        if (!isAuto) {
            const answer = await promptUser('(y/N): ');
            if (answer.toLowerCase() !== 'y') {
                logger.info('Skipping batch');
                return;
            }
        } else {
            logger.info('Auto mode enabled, processing batch without confirmation');
        }

        const FETCH_BATCH_SIZE = 20;
        const PARALLEL_BATCH_SIZE = 5;
        const expectedDim = await getVectorDimension();
        logger.info(`Expected vector dimension: ${expectedDim}`);

        // Process in batches of 20
        for (let i = 0; i < batch.length; i += FETCH_BATCH_SIZE) {
            const currentBatch = batch.slice(i, i + FETCH_BATCH_SIZE);
            logger.info(`Processing batch ${Math.floor(i / FETCH_BATCH_SIZE) + 1}/${Math.ceil(batch.length / FETCH_BATCH_SIZE)} (${currentBatch.length} records)`);

            // Process records in parallel batches of 5
            const vectorsToUpsert = [];
            for (let j = 0; j < currentBatch.length; j += PARALLEL_BATCH_SIZE) {
                const parallelBatch = currentBatch.slice(j, j + PARALLEL_BATCH_SIZE);

                // Fetch vectors for current batch
                const vectorPromises = parallelBatch.map(record => fetchVectorByCode(pineconeIndex, record.code));
                const existingVectors = await Promise.all(vectorPromises);

                const parallelVectors = existingVectors.slice(j, j + PARALLEL_BATCH_SIZE);

                await Promise.all(parallelBatch.map(async (record, index) => {
                    const existingVector = parallelVectors[index];
                    try {
                        // Check MongoDB document
                        let doc = await Document.findOne({ code: record.code }).lean();

                        // Always update/create document with fileName
                        logger.info(`Upserting MongoDB document for code: ${record.code} with fileName: ${record.fileName}`);
                        doc = await Document.findOneAndUpdate(
                            { code: record.code },
                            {
                                code: record.code,
                                fileName: record.fileName,
                                metadata_small: record.metadata_small,
                                source: record.source
                            },
                            { upsert: true, new: true }
                        );

                        // Extract essential metadata
                        const metadata = {
                            code: record.code,
                            fileName: record.fileName,
                            metadata_small: record.metadata_small
                        };

                        if (!existingVector) {
                            // Re-embed the document with both code and metadata_small
                            const embedding = await embedDocument(record.code, record.metadata_small);

                            if (!embedding) {
                                logger.error(`Failed to generate embedding for ${record.code}`);
                                return;
                            }

                            // Check embedding dimension
                            if (embedding.length !== expectedDim) {
                                logger.error(`Invalid embedding dimension for ${record.code}: got ${embedding.length}, expected ${expectedDim}`);
                                return;
                            }

                            vectorsToUpsert.push({
                                id: record.code,
                                values: embedding,
                                metadata
                            });
                        } else {
                            // Check existing vector dimension
                            if (existingVector.values.length !== expectedDim) {
                                logger.error(`Invalid existing vector dimension for ${record.code}: got ${existingVector.values.length}, expected ${expectedDim}`);
                                return;
                            }

                            // Check if vector has fileName in metadata
                            if (!existingVector.metadata?.fileName) {
                                logger.info(`Fixing orphan vector ${existingVector.id} with fileName: ${record.fileName}`);
                                try {
                                    // Log metadata before update
                                    logger.debug('Updating vector metadata:', {
                                        id: existingVector.id,
                                        currentMetadata: existingVector.metadata,
                                        newMetadata: metadata
                                    });

                                    await pineconeIndex.update({
                                        id: existingVector.id,
                                        setMetadata: metadata
                                    });
                                    logger.info(`Successfully updated metadata for orphan vector ${existingVector.id}`);
                                } catch (error) {
                                    logger.error(`Failed to update metadata for orphan vector ${existingVector.id}:`, {
                                        error: {
                                            name: error.name,
                                            message: error.message,
                                            stack: error.stack
                                        },
                                        vector: {
                                            id: existingVector.id,
                                            metadata: existingVector.metadata,
                                            newMetadata: metadata
                                        },
                                        record
                                    });
                                }
                            }

                            vectorsToUpsert.push({
                                id: existingVector.id,
                                values: existingVector.values,
                                metadata
                            });
                        }
                    } catch (error) {
                        logger.error(`Error processing record: ${record.code}`, {
                            error: {
                                name: error.name,
                                message: error.message,
                                stack: error.stack
                            },
                            record,
                            existingVector
                        });
                    }
                }));
            }

            // Upsert vectors for current batch
            if (vectorsToUpsert.length > 0) {
                logger.info(`Upserting ${vectorsToUpsert.length} vectors`);
                const firstVector = vectorsToUpsert[0];
                logger.debug(`First vector: id=${firstVector.id}, dimension=${firstVector.values.length}`);
                logger.debug('First vector metadata:', firstVector.metadata);

                try {
                    const success = await upsertVectors(pineconeIndex, vectorsToUpsert);
                    if (success) {
                        logger.info(`Successfully processed ${vectorsToUpsert.length} vectors in current batch`);
                    }
                } catch (error) {
                    logger.error('Failed to upsert vectors:', {
                        error: {
                            name: error.name,
                            message: error.message,
                            stack: error.stack
                        },
                        firstVector,
                        totalVectors: vectorsToUpsert.length
                    });
                }
            } else {
                logger.warn('No vectors to update in current batch');
            }

            // Add small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        logger.error('Error processing batch:', {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            batchSize: batch.length
        });
        throw error;
    }
}

async function getMongoHealth() {
    try {
        // Ensure MongoDB connection
        await connectToMongoDB();

        // Get document counts by fileName
        const documentCounts = await Document.aggregate([
            {
                $group: {
                    _id: '$fileName',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Create a map for easier access
        const countMap = new Map();
        documentCounts.forEach(doc => {
            countMap.set(doc._id, doc.count);
        });

        return countMap;
    } catch (error) {
        logger.error('Error getting MongoDB health:', error);
        throw error;
    }
}

async function getPineconeHealth() {
    try {
        const pineconeIndex = await initPinecone();
        logger.info('Connected to Pinecone');

        // Get overall stats first
        const stats = await pineconeIndex.describeIndexStats();
        logger.debug('Pinecone stats:', stats);

        // Get vectors with their metadata
        const vectorsByFile = new Map();
        const uniqueFileNames = (await Document.distinct('fileName')) || [];

        // For each file, get the codes from MongoDB
        for (const fileName of uniqueFileNames) {
            try {
                // Get codes for this file
                const codes = await Document.find({ fileName }).distinct('code');
                logger.debug(`Found ${codes.length} codes for ${fileName}`);

                // Get vector dimension for zero vector
                const dim = await getVectorDimension();
                const zeroVector = new Array(dim).fill(0);

                // Query by codes with zero vector
                const response = await pineconeIndex.query({
                    vector: zeroVector,
                    filter: { fileName },
                    topK: codes.length,
                    includeMetadata: true
                });

                let foundVectors = 0;
                let missingFileNameVectors = [];

                if (response.matches) {
                    foundVectors = response.matches.length;
                    missingFileNameVectors = response.matches.filter(match => !match.metadata?.fileName);
                }

                if (missingFileNameVectors.length > 0) {
                    logger.debug(`Vectors missing fileName in metadata:`, missingFileNameVectors);
                }

                logger.debug(`Found ${foundVectors} vectors with fileName for ${fileName}`);
                vectorsByFile.set(fileName, foundVectors);

                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                logger.error(`Error getting health for ${fileName}:`, error);
            }
        }

        return {
            totalVectors: stats.totalVectorCount,
            vectorsWithFileName: Array.from(vectorsByFile.values()).reduce((a, b) => a + b, 0),
            orphanedVectors: stats.totalVectorCount - Array.from(vectorsByFile.values()).reduce((a, b) => a + b, 0),
            vectorsByFile: Object.fromEntries(vectorsByFile)
        };
    } catch (error) {
        logger.error('Error getting Pinecone health:', error);
        throw error;
    }
}

async function logExtraMongoDocuments(fileName) {
    try {
        // Get all documents for this file
        const mongoDocs = await Document.find({ fileName }).lean();
        
        // Get vector dimension for zero vector
        const dim = await getVectorDimension();
        const zeroVector = new Array(dim).fill(0);
        
        // Initialize Pinecone
        const pineconeIndex = await initPinecone();
        
        // Create a log file for extra documents
        const logStream = fs.createWriteStream('repair.log', { flags: 'a' });
        logStream.write(`\n=== Extra MongoDB Documents for ${fileName} ===\n\n`);
        
        // Check each MongoDB document
        for (const doc of mongoDocs) {
            // Query Pinecone for this document
            const response = await pineconeIndex.query({
                vector: zeroVector,
                filter: { code: doc.code },
                topK: 1,
                includeMetadata: true
            });
            
            // If no matching vector in Pinecone, log it
            if (!response.matches || response.matches.length === 0) {
                logStream.write(JSON.stringify({
                    code: doc.code,
                    fileName: doc.fileName,
                    metadata_small: doc.metadata_small
                }, null, 2) + '\n');
            }
            
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        logStream.end();
        logger.info(`Extra MongoDB documents logged to mongo_extras.log`);
    } catch (error) {
        logger.error('Error logging extra MongoDB documents:', error);
        throw error;
    }
}

async function runHealthCheck() {
    try {
        logger.info('Running health check...');

        // Ensure MongoDB connection
        await connectToMongoDB();

        // Get health information from both systems
        const [mongoHealth, pineconeHealth] = await Promise.all([
            getMongoHealth(),
            getPineconeHealth()
        ]);

        console.log('\n=== Health Check Results ===\n');

        // Print MongoDB document counts
        console.log('MongoDB Document Counts:');
        mongoHealth.forEach((count, fileName) => {
            console.log(`  ${fileName}: ${count} documents`);
        });

        console.log('\nPinecone Vector Counts:');
        console.log(`Total Vectors:          ${pineconeHealth.totalVectors || 0}`);
        console.log(`Vectors with fileName:  ${pineconeHealth.vectorsWithFileName || 0}`);
        console.log(`Orphaned Vectors:       ${pineconeHealth.orphanedVectors || 0}`);

        console.log('\nVectors by File:');
        Object.entries(pineconeHealth.vectorsByFile).forEach(([fileName, count]) => {
            const safeFileName = fileName || 'Unknown File';
            console.log(`  ${safeFileName}: ${count} vectors`);
        });

        // Check for discrepancies
        console.log('\n=== Discrepancies ===\n');
        let hasDiscrepancies = false;

        // Create a map for easier comparison
        const mongoCountMap = mongoHealth;
        const pineconeCountMap = new Map(Object.entries(pineconeHealth.vectorsByFile));

        // Get all unique file names
        const allFileNames = new Set([
            ...mongoCountMap.keys(),
            ...Object.keys(pineconeHealth.vectorsByFile)
        ]);

        // Store files with discrepancies
        const discrepancyFiles = [];

        allFileNames.forEach(fileName => {
            const mongoCount = mongoCountMap.get(fileName) || 0;
            const pineconeCount = pineconeHealth.vectorsByFile[fileName] || 0;

            if (mongoCount !== pineconeCount) {
                hasDiscrepancies = true;
                console.log(`\n  ${fileName}:`);
                console.log(`    MongoDB:       ${mongoCount} documents`);
                console.log(`    Pinecone:      ${pineconeCount} vectors`);
                console.log(`    Difference:     ${mongoCount - pineconeCount} missing in Pinecone`);
                
                // Add to list if MongoDB has more documents
                if (mongoCount > pineconeCount) {
                    discrepancyFiles.push(fileName);
                }
            }
        });

        if (!hasDiscrepancies) {
            console.log('No discrepancies found. All counts match!');
        }

        console.log('\n=== Overall Health Status ===\n');

        const totalMongo = Array.from(mongoCountMap.values()).reduce((a, b) => a + b, 0);
        const totalPinecone = pineconeHealth.vectorsWithFileName;

        if (totalMongo === totalPinecone && !hasDiscrepancies) {
            console.log('✅ System is healthy! All document counts match.');
        } else {
            console.log('❌ System needs attention:');
            if (totalMongo !== totalPinecone) {
                console.log(`   - Total document count mismatch: MongoDB (${totalMongo}) vs Pinecone (${totalPinecone})`);
            }
            if (hasDiscrepancies) {
                console.log('   - File-level discrepancies found (see above)');
            }
            if (pineconeHealth.orphanedVectors > 0) {
                console.log(`   - ${pineconeHealth.orphanedVectors} orphaned vectors found in Pinecone`);
            }
        }

        // Log extra documents for all files with discrepancies
        if (discrepancyFiles.length > 0) {
            logger.info('Logging extra MongoDB documents...');
            for (const fileName of discrepancyFiles) {
                await logExtraMongoDocuments(fileName);
            }
        }

    } catch (error) {
        logger.error('Error running health check:', error);
        throw error;
    } finally {
        // Close MongoDB connection at the very end
        await closeServices();
    }
}

async function initServices() {
    // Connect to MongoDB first
    await connectToMongoDB();
    logger.info('MongoDB connection ready');

    // Initialize Pinecone client
    const pineconeIndex = await initPinecone();
    if (!pineconeIndex) {
        throw new Error('Failed to initialize Pinecone client');
    }
    logger.info('Pinecone client ready');

    return pineconeIndex;
}

async function closeServices() {
    // Clean up MongoDB connection
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
}

async function getOrphanVectors(pineconeIndex) {
    try {
        logger.info('Finding orphan vectors...');
        
        // Get vector dimension for zero vector
        const dim = await getVectorDimension();
        const zeroVector = new Array(dim).fill(0);
        
        // Query all vectors
        const response = await pineconeIndex.query({
            vector: zeroVector,
            topK: 10000, // Adjust if needed
            includeMetadata: true,
            includeValues: false
        });

        if (!response.matches) {
            logger.warn('No vectors found in Pinecone');
            return [];
        }

        // Find vectors without fileName in metadata
        const orphanVectors = response.matches.filter(match => !match.metadata?.fileName);
        logger.info(`Found ${orphanVectors.length} orphan vectors`);
        
        return orphanVectors;
    } catch (error) {
        logger.error('Error finding orphan vectors:', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function removeOrphanVectors(pineconeIndex) {
    try {
        logger.info('Starting orphan vector removal...');

        // Get orphan vectors
        const orphanVectors = await getOrphanVectors(pineconeIndex);
        if (orphanVectors.length === 0) {
            logger.info('No orphan vectors found');
            return;
        }

        // Confirm deletion
        console.log(`Found ${orphanVectors.length} orphan vectors to remove:`);
        for (const vector of orphanVectors.slice(0, 5)) {
            console.log(`- ${vector.id}`);
        }
        if (orphanVectors.length > 5) {
            console.log(`... and ${orphanVectors.length - 5} more`);
        }

        const answer = await promptUser('Remove these vectors? (y/N): ');
        if (answer.toLowerCase() !== 'y') {
            logger.info('Aborting vector removal');
            return;
        }

        // Delete vectors in batches
        const BATCH_SIZE = 100;
        for (let i = 0; i < orphanVectors.length; i += BATCH_SIZE) {
            const batch = orphanVectors.slice(i, i + BATCH_SIZE);
            const ids = batch.map(v => v.id);

            logger.info(`Deleting batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(orphanVectors.length/BATCH_SIZE)} (${ids.length} vectors)`);
            
            try {
                await pineconeIndex.deleteMany(ids);
                logger.info(`Successfully deleted ${ids.length} vectors`);
            } catch (error) {
                logger.error(`Error deleting batch:`, {
                    message: error.message,
                    stack: error.stack
                });
                // Continue with next batch
            }

            // Add small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        logger.info('Orphan vector removal completed');
    } catch (error) {
        logger.error('Error removing orphan vectors:', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function main() {
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const shouldRepair = args.includes('--repair');
        const isAuto = args.includes('--auto');
        const removeOrphans = args.includes('--remove-orphan-vectors');

        // Find file path - support both --file=path and --file path formats
        const fileArg = args.find(arg => arg.startsWith('--file='));
        const filePath = fileArg ? 
            fileArg.split('=')[1] : 
            args[args.indexOf('--file') + 1];

        logger.info('Starting with options:', {
            repair: shouldRepair,
            auto: isAuto,
            removeOrphans,
            file: filePath || 'none'
        });

        // Initialize services
        const pineconeIndex = await initServices();

        if (removeOrphans) {
            await removeOrphanVectors(pineconeIndex);
            return;
        }

        // Repair metadata if requested
        if (shouldRepair) {
            if (!filePath) {
                logger.error('--file argument is required when using --repair');
                console.log('Usage: node db-health.js [--repair --file=<path/to/csv> [--auto]] [--remove-orphan-vectors]');
                return;
            }
            logger.info(`Starting repair with auto mode: ${isAuto}`);
            await repairMetadata(pineconeIndex, filePath, { auto: isAuto });
        } else {
            await runHealthCheck();
        }
    } catch (error) {
        logger.error('Error in main:', {
            message: error.message,
            stack: error.stack
        });
        process.exit(1);
    } finally {
        await closeServices();
    }
}


// Run the script
main();
