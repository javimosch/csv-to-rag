import { ChromaClient } from 'chromadb';

// Singleton Chroma client instance
let chromaClientInstance = null;

/**
 * Initialize and return a singleton Chroma client.
 * Requires CHROMA_BASE_URL environment variable.
 */
export function initChromaClient() {
  if (chromaClientInstance) {
    return chromaClientInstance;
  }
  const baseUrl = process.env.CHROMA_BASE_URL;
  if (!baseUrl) {
    throw new Error('CHROMA_BASE_URL environment variable is not set');
  }
  // Initialize Chroma client
  chromaClientInstance = new ChromaClient({ path: baseUrl });
  return chromaClientInstance;
}

/**
 * Get or create a Chroma collection corresponding to the given namespace.
 * Collections are used to isolate namespaces behind the hood.
 * @param {string} name - Collection name (namespace)
 * @returns {Promise<import('chromadb').Collection>} Chroma collection instance
 */
export async function getChromaCollection(name) {
  const client = initChromaClient();
  // Determine vector dimension, default to 1536
  const dimensions = parseInt(process.env.VECTOR_DIM || '1536', 10);
  try {
    const collection = await client.getOrCreateCollection({
      name,
      metadata: {},
      dimensions,
    });
    return collection;
  } catch (err) {
    console.error('Error initializing Chroma collection', err);
    throw err;
  }
}