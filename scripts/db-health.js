import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { Document } from '../src/models/document.model.js';
import { logger } from '../src/utils/logger.js';
import fs from 'fs';
import { parse } from 'csv-parse';
import { CSVService } from '../src/services/csv.service.js';
import { getOpenAI } from '../src/config/openai.js';
import readline from 'readline';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
config({ path: envPath });

async function parseCsvFile(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        
        return new Promise((resolve, reject) => {
            parse(fileContent, {
                delimiter: ';',
                columns: true,
                skip_empty_lines: true,
                trim: true
            }, (err, records) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(records);
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

async function fetchAllVectors(pineconeIndex, codes) {
    try {
        logger.info('Fetching all vectors from Pinecone using metadata codes');
        
        // Validate codes
        if (!codes || !Array.isArray(codes) || codes.length === 0) {
            throw new Error('Invalid or empty codes array');
        }

        // Query vectors using metadata filter
        const allVectors = {};
        const batchSize = 50;
        
        for (let i = 0; i < codes.length; i += batchSize) {
            const batchCodes = codes.slice(i, i + batchSize);
            const response = await pineconeIndex.query({
                topK: batchSize,
                filter: {
                    code: { $in: batchCodes }
                },
                includeMetadata: true
            });

            if (!response || !response.matches) {
                logger.error('Invalid query response from Pinecone:', response);
                throw new Error('Invalid response from Pinecone query operation');
            }

            // Add matches to results
            for (const match of response.matches) {
                allVectors[match.id] = match;
            }
            
            logger.info(`Fetched ${response.matches.length} vectors in batch ${Math.floor(i / batchSize) + 1}`);
            
            // Add small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        logger.info(`Successfully fetched ${Object.keys(allVectors).length} vectors from Pinecone`);
        return allVectors;
    } catch (error) {
        logger.error('Error fetching vectors from Pinecone:', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

async function upsertVector(pineconeIndex, vector) {
    try {
        logger.debug(`Upserting vector for id: ${vector.id}`);
        //logger.debug('Vector format:', JSON.stringify(vector, null, 2));
        
        // Ensure we have the required fields
        if (!vector.id || !vector.values || !vector.metadata) {
            logger.error('Missing required fields for vector:', vector);
            return false;
        }
        
        // Format exactly as Pinecone expects
        const record = [{
            id: vector.id,
            values: Array.from(vector.values), // Ensure it's a proper array
            metadata: vector.metadata
        }];
        
        logger.debug('Upsert request:', JSON.stringify(record, null, 2));
        
        await pineconeIndex.upsert(record);
        
        logger.debug(`Successfully upserted vector for id: ${vector.id}`);
        return true;
    } catch (error) {
        logger.error(`Error upserting vector for id: ${vector.id}:`, {
            message: error.message,
            stack: error.stack
        });
        return false;
    }
}

async function upsertVectorBatch(pineconeIndex, vectors, batchSize = 10) {
    try {
        const batches = [];
        for (let i = 0; i < vectors.length; i += batchSize) {
            batches.push(vectors.slice(i, i + batchSize));
        }

        logger.info(`Upserting vectors in ${batches.length} batches of ${batchSize}`);
        
        let successCount = 0;
        for (const [index, batch] of batches.entries()) {
            try {
                // Format exactly as Pinecone expects
                const records = batch.map(vector => ({
                    id: vector.id,
                    values: Array.from(vector.values), // Ensure it's a proper array
                    metadata: vector.metadata
                }));
                
                logger.debug('Batch upsert request:', JSON.stringify(records, null, 2));
                
                await pineconeIndex.upsert(records);
                successCount += batch.length;
                logger.info(`Successfully upserted batch ${index + 1}/${batches.length} (${successCount} total)`);
                
                // Add small delay between batches
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                logger.error(`Error upserting batch ${index + 1}:`, {
                    message: error.message,
                    stack: error.stack
                });
                throw error;
            }
        }

        return successCount;
    } catch (error) {
        logger.error('Error upserting vector batch:', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Cache vector dimension after first embedding
const VECTOR_DIM = parseInt(process.env.VECTOR_DIM || '1536', 10);

async function getVectorDimension() {
    return VECTOR_DIM;
}

async function fetchVectorByCode(pineconeIndex, code) {
    try {
        logger.debug(`Fetching vector for code: ${code}`);
        
        // Get vector dimension for zero vector
        const dim = await getVectorDimension();
        const zeroVector = new Array(dim).fill(0);
        
        const response = await pineconeIndex.query({
            vector: zeroVector,
            topK: 1,
            filter: { code },
            includeMetadata: true
        });

        if (!response || !response.matches) {
            logger.warn(`No query response from Pinecone for code: ${code}`);
            return null;
        }

        const match = response.matches[0];
        if (!match) {
            logger.warn(`No vector found for code: ${code}`);
            return null;
        }

        logger.debug(`Successfully fetched vector for code: ${code}`);
        return match;
    } catch (error) {
        logger.error(`Error fetching vector for code: ${code}:`, {
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

async function processBatch(pineconeIndex, records, fileName, autoApprove = false) {
    logger.info(`Processing batch of ${records.length} records`);
    
    // First check what needs to be done
    const toProcess = [];
    
    for (const record of records) {
        // 1. Check MongoDB document
        const doc = await Document.findOne({ code: record.code }).lean();
        const needsMongo = !doc || !doc.fileName;
        
        // 2. Check Pinecone vector
        const vector = await fetchVectorByCode(pineconeIndex, record.code);
        const needsPinecone = !vector || !vector.metadata?.fileName;
        
        if (needsMongo || needsPinecone) {
            toProcess.push({
                record,
                needsMongo,
                needsPinecone,
                doc
            });
        }
    }
    
    if (toProcess.length === 0) {
        logger.info('No records need processing in this batch');
        return { mongoUpdated: 0, pineconeUpdated: 0 };
    }
    
    // Prompt user
    const message = `Repair ${toProcess.length} records?\n` +
        toProcess.map(({ record, needsMongo, needsPinecone }) => 
            `- ${record.code}: ${needsMongo ? 'MongoDB' : ''} ${needsPinecone ? 'Pinecone' : ''}`
        ).join('\n');
    
    if (!autoApprove) {
        const proceed = await promptUser(message);
        if (!proceed) {
            logger.info('User skipped batch');
            return { mongoUpdated: 0, pineconeUpdated: 0 };
        }
    } else {
        logger.info(message);
    }
    
    // Process approved records
    let mongoUpdated = 0;
    let pineconeUpdated = 0;
    
    for (const { record, needsMongo, needsPinecone, doc } of toProcess) {
        try {
            // Update MongoDB if needed
            if (needsMongo) {
                if (!doc) {
                    await Document.create({
                        code: record.code,
                        fileName,
                        metadata_small: record.metadata_small
                    });
                } else {
                    await Document.updateOne(
                        { _id: doc._id },
                        { $set: { fileName } }
                    );
                }
                mongoUpdated++;
            }
            
            // Update Pinecone if needed
            if (needsPinecone) {
                // Re-embed the document with both code and metadata_small
                const embedding = await embedDocument(record.code, record.metadata_small);
                
                if (!embedding) {
                    logger.error(`Failed to generate embedding for ${record.code}`);
                    continue;
                }
                
                const vector = {
                    id: record.code,
                    values: embedding,
                    metadata: {
                        fileName,
                        code: record.code,
                        metadata_small: record.metadata_small
                    }
                };
                
                const success = await upsertVector(pineconeIndex, vector);
                if (success) {
                    pineconeUpdated++;
                }
            }
            
            // Add small delay between records
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            logger.error(`Error processing record ${record.code}:`, {
                message: error.message,
                stack: error.stack
            });
        }
    }
    
    return { mongoUpdated, pineconeUpdated };
}

async function repairMetadata(pineconeIndex, csvPath, options = { batchSize: 10, auto: false }) {
    try {
        const { batchSize = 10, auto = false } = options;
        logger.info(`Starting metadata repair (auto mode: ${auto})`);
        
        // Read CSV file
        const records = await parseCsvFile(csvPath);
        if (!records || records.length === 0) {
            logger.warn('No records found in CSV file');
            return;
        }
        
        logger.info(`Found ${records.length} records in CSV file`);
        //logger.debug('First record:', JSON.stringify(records[0], null, 2));
        
        // Process in batches
        const batches = [];
        for (let i = 0; i < records.length; i += batchSize) {
            batches.push(records.slice(i, i + batchSize));
        }
        
        logger.info(`Processing ${batches.length} batches of ${batchSize} records`);
        
        for (const batch of batches) {
            if (auto) {
                logger.info('Auto mode enabled, processing batch without confirmation');
                await processBatch(pineconeIndex, batch, csvPath.split('/').pop(), auto);
            } else {
                // Display the batch
                console.log('Repair', batch.length, 'records?');
                for (const record of batch) {
                    console.log(`- ${record.code}:  ${record.source}`);
                }

                const answer = await promptUser('(y/N): ');
                if (answer.toLowerCase() === 'y') {
                    await processBatch(pineconeIndex, batch, csvPath.split('/').pop(), auto);
                } else {
                    logger.info('Skipping batch');
                }
            }
        }
        
        logger.info('Metadata repair complete');
    } catch (error) {
        logger.error('Error repairing metadata:', {
            message: error.message,
            stack: error.stack
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
            },
            {
                $sort: { count: -1 }
            }
        ]);

        const totalDocuments = documentCounts.reduce((sum, group) => sum + group.count, 0);

        return {
            totalDocuments,
            fileGroups: documentCounts
        };
    } catch (error) {
        logger.error('MongoDB Health Check Error:', error);
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

        const totalVectors = stats.totalRecordCount || 0;

        // Get vectors with their metadata
        const vectorsByFile = new Map();
        const uniqueFileNames = (await Document.distinct('fileName')) || [];
        
        // For each file, get the codes from MongoDB
        for (const fileName of uniqueFileNames) {
            try {
                const codes = await Document.find({ fileName }, { code: 1 }).distinct('code');
                
                // Query Pinecone for these codes
                const queryResponse = await pineconeIndex.fetch({ 
                    ids: codes
                });

                // Count how many vectors we found
                const foundVectors = Object.keys(queryResponse.vectors || {}).length;
                vectorsByFile.set(fileName, foundVectors);
                
                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                logger.error(`Error getting vectors for ${fileName}:`, error);
                vectorsByFile.set(fileName, 0);
            }
        }

        // Calculate totals
        const vectorsWithFileName = Array.from(vectorsByFile.values()).reduce((a, b) => a + b, 0);
        const orphanedVectors = totalVectors - vectorsWithFileName;

        logger.info('Pinecone Health Stats:', {
            total: totalVectors,
            withFileName: vectorsWithFileName,
            orphaned: orphanedVectors,
            byFile: Object.fromEntries(vectorsByFile)
        });

        return {
            totalVectors,
            vectorsWithFileName,
            orphanedVectors,
            vectorsByFile: Object.fromEntries(vectorsByFile)
        };
    } catch (error) {
        logger.error('Pinecone Health Check Error:', error);
        throw error;
    }
}

async function runHealthCheck() {
    try {
        logger.info('Starting Database Health Check');

        // Ensure MongoDB connection
        await connectToMongoDB();
        
        // Get health information from both systems
        const [mongoHealth, pineconeHealth] = await Promise.all([
            getMongoHealth(),
            getPineconeHealth()
        ]);

        // Print MongoDB health
        console.log('\n=== MongoDB Health ===');
        console.log(`Total Documents: ${mongoHealth.totalDocuments}`);
        console.log('\nDocuments by File:');
        mongoHealth.fileGroups.forEach(group => {
            console.log(`  ${group._id.padEnd(30)} ${group.count.toString().padStart(6)} documents`);
        });

        // Print Pinecone health
        console.log('\n=== Pinecone Health ===');
        console.log(`Total Vectors:          ${pineconeHealth.totalVectors || 0}`);
        console.log(`Vectors with fileName:  ${pineconeHealth.vectorsWithFileName || 0}`);
        console.log(`Orphaned Vectors:       ${pineconeHealth.orphanedVectors || 0}`);
        
        console.log('\nVectors by File:');
        Object.entries(pineconeHealth.vectorsByFile).forEach(([fileName, count]) => {
            console.log(`  ${fileName.padEnd(30)} ${count.toString().padStart(6)} vectors`);
        });

        // Find discrepancies
        console.log('\n=== Discrepancies ===');
        const allFileNames = new Set([
            ...mongoHealth.fileGroups.map(g => g._id),
            ...Object.keys(pineconeHealth.vectorsByFile)
        ]);

        const mongoCountMap = new Map(
            mongoHealth.fileGroups.map(g => [g._id, g.count])
        );

        let hasDiscrepancies = false;
        allFileNames.forEach(fileName => {
            const mongoCount = mongoCountMap.get(fileName) || 0;
            const pineconeCount = pineconeHealth.vectorsByFile[fileName] || 0;
            
            if (mongoCount !== pineconeCount) {
                hasDiscrepancies = true;
                console.log(`\n  ${fileName}:`);
                console.log(`    MongoDB:    ${mongoCount.toString().padStart(6)} documents`);
                console.log(`    Pinecone:   ${pineconeCount.toString().padStart(6)} vectors`);
                console.log(`    Difference: ${Math.abs(mongoCount - pineconeCount).toString().padStart(6)} ${mongoCount > pineconeCount ? 'missing in Pinecone' : 'extra in Pinecone'}`);
            }
        });

        if (!hasDiscrepancies) {
            console.log('  No discrepancies found! All counts match.');
        }

        // Overall health status
        console.log('\n=== Overall Health Status ===');
        const totalDiff = Math.abs(mongoHealth.totalDocuments - (pineconeHealth.vectorsWithFileName || 0));
        const healthStatus = totalDiff === 0 ? 'HEALTHY' : 'UNHEALTHY';
        console.log(`Status: ${healthStatus}`);
        if (totalDiff > 0) {
            console.log(`Total difference: ${totalDiff} documents`);
            if (pineconeHealth.orphanedVectors > 0) {
                console.log(`Warning: ${pineconeHealth.orphanedVectors} orphaned vectors found in Pinecone`);
            }
        }

        // Cleanup
        await mongoose.disconnect();
        logger.info('Health Check Completed');
    } catch (error) {
        logger.error('Health Check Error:', error);
        process.exit(1);
    }
}

async function main() {
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const shouldRepair = args.includes('--repair');
        const isAuto = args.includes('--auto');
        
        // Find file path - support both --file=path and --file path formats
        const fileArg = args.find(arg => arg.startsWith('--file='));
        const filePath = fileArg ? 
            fileArg.split('=')[1] : 
            args[args.indexOf('--file') + 1];

        if (!shouldRepair || !filePath) {
            console.log('Usage: node db-health.js --repair --file=<path/to/csv> [--auto]');
            return;
        }

        logger.info('Starting with options:', {
            repair: shouldRepair,
            auto: isAuto,
            file: filePath
        });

        // Connect to MongoDB first
        await connectToMongoDB();
        logger.info('MongoDB connection ready');

        // Initialize Pinecone client
        const pineconeIndex = await initPinecone();
        if (!pineconeIndex) {
            throw new Error('Failed to initialize Pinecone client');
        }

        // Repair metadata if requested
        if (shouldRepair) {
            logger.info(`Starting repair with auto mode: ${isAuto}`);
            await repairMetadata(pineconeIndex, filePath, { batchSize: 10, auto: isAuto });
        }
    } catch (error) {
        logger.error('Error in main:', {
            message: error.message,
            stack: error.stack
        });
        process.exit(1);
    } finally {
        // Clean up MongoDB connection
        await mongoose.disconnect();
        logger.info('MongoDB connection closed');
    }
}

async function embedDocument(code, metadata_small) {
    try {
        const text = `${code}\n${metadata_small}`;
        const openai = getOpenAI();
        const response = await openai.embeddings.create({
            input: text,
            model: "text-embedding-ada-002"
        });
        
        if (!response || !response.data || !response.data[0]) {
            logger.error('Invalid embedding response from OpenAI:', response);
            return null;
        }
        
        return response.data[0].embedding;
    } catch (error) {
        logger.error(`Error generating embedding for ${code}:`, {
            message: error.message,
            stack: error.stack
        });
        return null;
    }
}

// Run the script
main();
