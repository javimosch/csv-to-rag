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

function isBase64(str) {
    try {
        // Check if the string matches base64 pattern
        if (!/^[A-Za-z0-9+/=]+$/.test(str)) return false;
        
        // Try to decode and check if it's valid UTF-8
        const decoded = Buffer.from(str, 'base64').toString('utf-8');
        return true;
    } catch (e) {
        return false;
    }
}

function decodeBase64IfNeeded(value) {
    if (!value) return '';
    if (isBase64(value)) {
        try {
            return Buffer.from(value, 'base64').toString('utf-8');
        } catch (e) {
            logger.warn('Failed to decode base64 value:', { value, error: e.message });
            return value;
        }
    }
    return value;
}

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
                
                // Decode base64 metadata fields
                const parsedRecords = records.map(record => ({
                    ...record,
                    metadata_small: decodeBase64IfNeeded(record.metadata_small || ""),
                    metadata_big_1: decodeBase64IfNeeded(record.metadata_big_1 || ""),
                    metadata_big_2: decodeBase64IfNeeded(record.metadata_big_2 || ""),
                    metadata_big_3: decodeBase64IfNeeded(record.metadata_big_3 || "")
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

async function fetchVectorByCode(pineconeIndex, code, namespace = 'default') {
    try {
        // Get vector dimension for zero vector
        const dim = await getVectorDimension();
        const zeroVector = new Array(dim).fill(0);

        // Query by code with zero vector
        const response = await pineconeIndex.namespace(namespace).query({
            vector: zeroVector,
            filter: { code },
            topK: 1,
            includeMetadata: true
        });

        if (!response.matches || response.matches.length === 0) {
            return null;
        }

        return response.matches[0];
    } catch (error) {
        logger.error('Error fetching vector by code:', {
            code,
            namespace,
            message: error.message,
            stack: error.stack
        });
        throw error;
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

async function repairMetadata(pineconeIndex, csvPath, options = {
    auto: false,
    code: null,
    namespace: 'default',
    repairMongoOnly: false
}) {
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

        // If code is provided, filter records to only repair the specified row
        let recordsToProcess = records;
        if (options.code) {
            recordsToProcess = records.filter(record => record.code.toLowerCase().includes(options.code.toLowerCase()));
            if (recordsToProcess.length === 0) {
                logger.error(`No records found with code containing: ${options.code} in CSV file`);
                return;
            }
            logger.info(`Found ${recordsToProcess.length} records with code containing: ${options.code} in CSV file`);
        }

        // Calculate dynamic batch size for max 5 batches
        const batchSize = options.code ? 1 : Math.max(10, Math.ceil(records.length / 5));
        logger.info(`Using batch size: ${batchSize}`);

        // Process records in batches
        const batches = [];
        for (let i = 0; i < recordsToProcess.length; i += batchSize) {
            batches.push(recordsToProcess.slice(i, i + batchSize));
        }

        logger.info(`Processing ${batches.length} batches`);

        for (const [index, batch] of batches.entries()) {
            try {
                logger.info(`Processing batch ${index + 1}/${batches.length} (${batch.length} records)`);
                await processBatch(pineconeIndex, batch.map(record => ({ ...record, fileName })), options.auto, options.namespace, options.repairMongoOnly);
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



async function processBatch(pineconeIndex, batch, isAuto = false, namespace = 'default', repairMongoOnly = false) {
    try {
        // Display the batch
        console.log('Repair', batch.length, 'records?');
        console.log('Sample:', JSON.stringify(batch[0], null, 2));

        let shouldProceed = isAuto;
        if (!isAuto) {
            const answer = await promptUser('Proceed with repair? (y/n): ');
            shouldProceed = answer.toLowerCase() === 'y';
        }

        if (!shouldProceed) {
            console.log('Skipping batch');
            return;
        }

        logger.info(`Processing batch of ${batch.length} records`);

        // Process in smaller parallel batches to avoid overwhelming the system
        const PARALLEL_BATCH_SIZE = 10;
        for (let i = 0; i < batch.length; i += PARALLEL_BATCH_SIZE) {
            const currentBatch = batch.slice(i, i + PARALLEL_BATCH_SIZE);
            logger.info(`Processing sub-batch ${Math.floor(i/PARALLEL_BATCH_SIZE) + 1}/${Math.ceil(batch.length/PARALLEL_BATCH_SIZE)} (${currentBatch.length} records)`);

            // Process each record in the current batch in parallel
            for (let j = 0; j < currentBatch.length; j += PARALLEL_BATCH_SIZE) {
                const parallelBatch = currentBatch.slice(j, j + PARALLEL_BATCH_SIZE);

                // Fetch vectors for current batch
                const vectorPromises = parallelBatch.map(record => fetchVectorByCode(pineconeIndex, record.code, namespace));
                const existingVectors = await Promise.all(vectorPromises);

                const parallelVectors = existingVectors.slice(j, j + PARALLEL_BATCH_SIZE);

                // Process each record in parallel
                await Promise.all(parallelBatch.map(async (record, index) => {
                    const existingVector = parallelVectors[index];
                    try {
                        // Prepare document data
                        const documentData = {
                            code: record.code,
                            namespace: namespace,
                            fileName: record.fileName,
                            metadata_small: record.metadata_small,
                            metadata_big_1: record.metadata_big_1,
                            metadata_big_2: record.metadata_big_2,
                            metadata_big_3: record.metadata_big_3
                        };

                        // Try to find and update/create document
                        let doc;
                        try {
                            doc = await Document.findOneAndUpdate(
                                { code: record.code, namespace: namespace },
                                documentData,
                                { upsert: true, new: true }
                            );
                        } catch (error) {
                            if (error.code === 11000) {
                                logger.warn(`Duplicate key detected for code: ${record.code}. Attempting to resolve...`);
                                
                                try {
                                    // Find the existing document
                                    const existingDoc = await Document.findOne({ code: record.code });
                                    
                                    if (existingDoc) {
                                        if (existingDoc.namespace === namespace) {
                                            // Update the existing document
                                            doc = await Document.findOneAndUpdate(
                                                { _id: existingDoc._id },
                                                documentData,
                                                { new: true }
                                            );
                                            logger.info(`Updated existing document for code: ${record.code} in namespace: ${namespace}`);
                                        } else {
                                            // Document exists in a different namespace, create new one
                                            await Document.deleteOne({ code: record.code, namespace: namespace });
                                            doc = await Document.create(documentData);
                                            logger.info(`Created new document for code: ${record.code} in namespace: ${namespace}`);
                                        }
                                    } else {
                                        // No document found, try creating again
                                        doc = await Document.create(documentData);
                                        logger.info(`Created new document for code: ${record.code} in namespace: ${namespace}`);
                                    }
                                } catch (retryError) {
                                    logger.error(`Failed to resolve duplicate key for code: ${record.code}`, {
                                        error: retryError.message,
                                        stack: retryError.stack
                                    });
                                    throw retryError;
                                }
                            } else {
                                throw error;
                            }
                        }

                        // Skip Pinecone operations if repairMongoOnly is true
                        if (!repairMongoOnly) {
                            // Get vector for the document
                            const embedding = await embedDocument(record.metadata_small);
                            if (!embedding) {
                                logger.error('Failed to get embedding for document:', {
                                    code: record.code,
                                    metadata_small: record.metadata_small
                                });
                                return;
                            }

                            // Prepare metadata
                            const metadata = {
                                fileName: record.fileName,
                                code: record.code,
                                metadata_small: record.metadata_small
                            };

                            // Update or create vector
                            if (existingVector) {
                                logger.info('Updating existing vector:', {
                                    id: existingVector.id,
                                    code: record.code,
                                    oldMetadata: existingVector.metadata,
                                    newMetadata: metadata
                                });

                                await pineconeIndex.namespace(namespace).update({
                                    id: existingVector.id,
                                    metadata
                                });
                            } else {
                                logger.info('Creating new vector:', {
                                    code: record.code,
                                    metadata
                                });

                                await pineconeIndex.namespace(namespace).upsert([{
                                    id: record.code,
                                    values: embedding,
                                    metadata
                                }]);
                            }
                        }
                    } catch (error) {
                        logger.error(`Error processing record:`, {
                            record,
                            error: error.message,
                            stack: error.stack
                        });
                        throw error;
                    }
                }));

                // Add small delay between parallel batches to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        logger.info('Batch processing completed successfully');
    } catch (error) {
        logger.error('Error processing batch:', {
            error: error.message,
            stack: error.stack,
            batchSize: batch.length
        });
        throw error;
    }
}

async function getMongoHealth(namespace = 'default') {
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

        // Get overall stats for all namespaces
        const stats = await pineconeIndex.describeIndexStats();
        logger.debug('Pinecone stats:', stats);

        // Ensure we have namespaces data
        if (!stats?.namespaces) {
            logger.warn('No namespaces found in Pinecone stats');
            return {};
        }

        const namespaceStats = {};
        
        // Process each namespace
        for (const [namespace, nsStats] of Object.entries(stats.namespaces)) {
            try {
                const vectorsByFile = new Map();
                const uniqueFileNames = (await Document.distinct('fileName', { namespace })) || [];

                // Process each file in the namespace
                for (const fileName of uniqueFileNames) {
                    try {
                        const codes = await Document.find({ fileName, namespace }).distinct('code');
                        const dim = await getVectorDimension();
                        const zeroVector = new Array(dim).fill(0);

                        const response = await pineconeIndex.namespace(namespace).query({
                            vector: zeroVector,
                            filter: { fileName },
                            topK: codes.length,
                            includeMetadata: true
                        });

                        const foundVectors = response.matches?.length || 0;
                        vectorsByFile.set(fileName, foundVectors);
                    } catch (error) {
                        logger.error(`Error processing file ${fileName} in namespace ${namespace}:`, error);
                        continue;
                    }
                }

                namespaceStats[namespace] = {
                    totalVectors: nsStats.vectorCount || 0,
                    vectorsWithFileName: Array.from(vectorsByFile.values()).reduce((a, b) => a + b, 0),
                    orphanedVectors: (nsStats.vectorCount || 0) - Array.from(vectorsByFile.values()).reduce((a, b) => a + b, 0),
                    vectorsByFile: Object.fromEntries(vectorsByFile)
                };
            } catch (error) {
                logger.error(`Error processing namespace ${namespace}:`, error);
                continue;
            }
        }

        return namespaceStats || {};
    } catch (error) {
        logger.error('Error getting Pinecone health:', error);
        throw error;
    }
} 


async function logExtraMongoDocuments(fileName, namespace = 'default') {
    try {
        // Get all documents for this file
        const mongoDocs = await Document.find({ fileName, namespace }).lean();
        
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
            const response = await pineconeIndex.namespace(namespace).query({
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

async function runHealthCheck(namespace = 'default') {
    try {
        logger.info('Running health check...');

        // Ensure MongoDB connection
        await connectToMongoDB();

        // Get health information from both systems
        const [mongoHealth, pineconeHealth] = await Promise.all([
            getMongoHealth(namespace),
            getPineconeHealth(namespace)
        ]);

        console.log('\n=== Health Check Results ===\n');

        // Print MongoDB document counts
        console.log('MongoDB Document Counts:');
        mongoHealth.forEach((count, fileName) => {
            console.log(`  ${fileName}: ${count} documents`);
        });

        console.log('Pinecone Health:', pineconeHealth);

        if (!pineconeHealth || typeof pineconeHealth !== 'object') {
            logger.error('Pinecone health data is not valid:', pineconeHealth);
            return;
        }


        console.log('\nPinecone Vector Counts:');
        console.log(`Total Vectors:          ${pineconeHealth.totalVectors || 0}`);
        console.log(`Vectors with fileName:  ${pineconeHealth.vectorsWithFileName || 0}`);
        console.log(`Orphaned Vectors:       ${pineconeHealth.orphanedVectors || 0}`);

        console.log('\nVectors by File:');
        for (const [namespace, healthData] of Object.entries(pineconeHealth)) {
            if (healthData.vectorsByFile) {
                Object.entries(healthData.vectorsByFile).forEach(([fileName, count]) => {
                    const safeFileName = fileName || 'Unknown File';
                    console.log(`  ${safeFileName}: ${count} vectors in namespace ${namespace}`);
                });
            } else {
                console.log(`No vectors found for namespace: ${namespace}`);
            }
        }

        // Check for discrepancies
        console.log('\n=== Discrepancies ===\n');
        let hasDiscrepancies = false;

        // Create a map for easier comparison
        const mongoCountMap = mongoHealth;

        // Store files with discrepancies
        const discrepancyFiles = [];

        // Iterate through each namespace in pineconeHealth
        let totalVectors = 0
        for (const [namespace, healthData] of Object.entries(pineconeHealth)) {
            const vectorsByFile = healthData.vectorsByFile || {};

            Object.keys(vectorsByFile).forEach(fileName => {
                const mongoCount = mongoCountMap.get(fileName) || 0;
                const pineconeCount = vectorsByFile[fileName] || 0;
                totalVectors+=pineconeCount
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
        }

        if (!hasDiscrepancies) {
            console.log('No discrepancies found. All counts match!');
        }

        console.log('\n=== Overall Health Status ===\n');

        const totalMongo = Array.from(mongoCountMap.values()).reduce((a, b) => a + b, 0);
        const totalPinecone = totalVectors

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
                await logExtraMongoDocuments(fileName, namespace);
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

async function getOrphanVectors(pineconeIndex, namespace = 'default') {
    try {
        logger.info('Finding orphan vectors...');
        
        // Get vector dimension for zero vector
        const dim = await getVectorDimension();
        const zeroVector = new Array(dim).fill(0);
        
        // Query all vectors
        const response = await pineconeIndex.namespace(namespace).query({
            vector: zeroVector,
            topK: 10000, // Adjust this value based on your needs
            includeMetadata: true
        });

        if (!response.matches) {
            logger.warn('No vectors found in Pinecone');
            return [];
        }

        // Filter vectors that don't have fileName in metadata
        return response.matches.filter(vector => !vector.metadata?.fileName);
    } catch (error) {
        logger.error('Error getting orphan vectors:', {
            namespace,
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function removeOrphanVectors(pineconeIndex, namespace = 'default') {
    try {
        logger.info('Starting orphan vector removal...');

        // Get orphan vectors
        const orphanVectors = await getOrphanVectors(pineconeIndex, namespace);
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
                await pineconeIndex.namespace(namespace).deleteMany(ids);
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

async function checkSingleRowHealth(pineconeIndex, code, namespace = 'default') {
    try {
        logger.info(`Checking health for document with code: ${code}`);

        // Get document from MongoDB
        const mongoDoc = await Document.findOne({ code, namespace });
        
        // Get vector from Pinecone
        const pineconeVector = await fetchVectorByCode(pineconeIndex, code, namespace);

        console.log('\n=== Single Row Health Check Results ===\n');
        
        if (!mongoDoc && !pineconeVector) {
            console.log(`❌ Document with code '${code}' not found in either MongoDB or Pinecone`);
            return;
        }

        // Check MongoDB
        console.log('MongoDB Status:');
        if (mongoDoc) {
            console.log('  ✅ Document exists');
            console.log(`  File Name: ${mongoDoc.fileName}`);
            console.log(`  Code: ${mongoDoc.code}`);
        } else {
            console.log('  ❌ Document not found');
        }

        // Check Pinecone
        console.log('\nPinecone Status:');
        if (pineconeVector) {
            console.log('  ✅ Vector exists');
            console.log(`  File Name: ${pineconeVector.metadata?.fileName || 'Not set'}`);
            console.log(`  Code: ${pineconeVector.metadata?.code || 'Not set'}`);
        } else {
            console.log('  ❌ Vector not found');
        }

        // Overall health assessment
        console.log('\nHealth Assessment:');
        if (mongoDoc && pineconeVector) {
            const metadataMatch = mongoDoc.fileName === pineconeVector.metadata?.fileName;
            if (metadataMatch) {
                console.log('✅ Row is healthy - exists in both systems with matching metadata');
            } else {
                console.log('⚠️  Row exists in both systems but metadata differs:');
                console.log(`  MongoDB fileName: ${mongoDoc.fileName}`);
                console.log(`  Pinecone fileName: ${pineconeVector.metadata?.fileName}`);
            }
        } else {
            console.log('❌ Row is unhealthy - missing from one system:');
            if (mongoDoc) console.log('  - Exists in MongoDB but missing from Pinecone');
            if (pineconeVector) console.log('  - Exists in Pinecone but missing from MongoDB');
        }

    } catch (error) {
        logger.error('Error checking single row health:', {
            message: error.message,
            stack: error.stack,
            code
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
        const repairMongoOnly = args.includes('--repair-mongo-only');

        // Find file path - support both --file=path and --file path formats
        const fileArg = args.find(arg => arg.startsWith('--file='));
        const filePath = fileArg ? 
            fileArg.split('=')[1] : 
            args[args.indexOf('--file') + 1];

        // Find code for single row check
        const codeArg = args.find(arg => arg.startsWith('--code='));
        const code = codeArg ? codeArg.split('=')[1] : null;

        // Find namespace - support both --ns=namespace and --namespace=namespace formats
        const nsArg = args.find(arg => arg.startsWith('--ns=') || arg.startsWith('--namespace='));
        const namespace = nsArg ? nsArg.split('=')[1] : 'default';

        logger.info('Starting with options:', {
            repair: shouldRepair,
            auto: isAuto,
            removeOrphans,
            file: filePath || 'none',
            code: code || 'none',
            namespace
        });

        // Initialize services
        const pineconeIndex = await initServices();

        if (shouldRepair) {
            if (!filePath) {
                logger.error('--file argument is required when using --repair');
                console.log('Usage: node db-health.js [--repair --file=<path/to/csv> [--auto]] [--remove-orphan-vectors] [--code=<document-code>] [--ns=<namespace>]');
                return;
            }
            logger.info(`Starting repair with auto mode: ${isAuto}, namespace: ${namespace}`);
            await repairMetadata(pineconeIndex, filePath, { auto: isAuto, code, namespace, repairMongoOnly });
        } else if (code) {
            // If code is provided without repair, do single row health check
            await checkSingleRowHealth(pineconeIndex, code, namespace);
        } else if (removeOrphans) {
            await removeOrphanVectors(pineconeIndex, namespace);
        } else {
            await runHealthCheck(namespace);
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
