import { Document } from '../models/document.model.js';
import { getOpenAIEmbedding } from '../config/openai.js';
import { getChromaCollection } from '../config/chroma.js';
import { logger } from '../utils/logger.js';

// Batch size for embedding generation
const EMBEDDING_BATCH_SIZE = () => parseInt(process.env.EMBEDDING_BATCH_SIZE || '20', 10);

// Utility to split array into chunks
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Sync all documents for given fileName/namespace into Chroma collection.
 * Regenerates embeddings for each record and adds them to Chroma.
 * @param {string} fileName
 * @param {string} namespace
 * @returns {Promise<{ total: number, synced: number, errors: Array }>} result
 */
export async function syncFileToChroma(fileName, namespace = 'default') {
  logger.info('Starting Chroma sync', { fileName, namespace });
  // Fetch records from MongoDB
  const records = await Document.find({ fileName, namespace });
  const total = records.length;
  if (total === 0) {
    return { total, synced: 0, errors: [] };
  }
  const openai = getOpenAIEmbedding();
  const collection = await getChromaCollection(namespace);
  let synced = 0;
  const errors = [];
  // Process in batches
  const batches = chunkArray(records, EMBEDDING_BATCH_SIZE());
  for (const batch of batches) {
    // Generate embeddings for batch
    const ids = [];
    const embeddings = [];
    const metadatas = [];
    const documents = [];
    await Promise.all(batch.map(async rec => {
      try {
        // Generate embedding from code + metadata_small
        const vecRes = await openai.embeddings.create({
          input: `${rec.code}\n${rec.metadata_small}`,
          model: process.env.EMBEDDING_OPENAI_MODEL
        });
        const vector = vecRes.data[0].embedding;
        ids.push(rec.code);
        embeddings.push(vector);
        // Parse metadata_small JSON into object for Chroma
        let metaObj;
        try {
          metaObj = JSON.parse(rec.metadata_small);
        } catch (e) {
          metaObj = { metadata_small: rec.metadata_small };
        }
        // Include identifying fields
        metaObj.code = rec.code;
        metaObj.fileName = rec.fileName;
        metaObj.namespace = rec.namespace;
        metadatas.push(metaObj);
        documents.push(rec.code);
      } catch (err) {
        logger.error('Error generating embedding during Chroma sync', { code: rec.code, message: err.message });
        errors.push({ code: rec.code, error: err.message });
      }
    }));
    if (ids.length) {
      try {
        await collection.add({ ids, embeddings, metadatas, documents });
        synced += ids.length;
      } catch (err) {
        logger.error('Error adding batch to Chroma', { fileName, namespace, message: err.message });
        // mark all in batch as error if bulk fails
        batch.forEach(rec => errors.push({ code: rec.code, error: err.message }));
      }
    }
  }
  logger.info('Chroma sync completed', { fileName, namespace, total, synced, errorsCount: errors.length });
  return { total, synced, errors };
}