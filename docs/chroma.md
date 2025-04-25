# How to Use Chroma with Node.js

This guide explains how to set up and interact with the Chroma vector database from a Node.js application.

## Prerequisites
- Node.js v14 or higher
- npm or yarn
- A running Chroma server (HTTP API) on port 8123 (default)

## 1. Run Chroma Server

### Using Docker Compose
```bash
docker-compose up -d chroma
```
This starts a Chroma container listening on port 8123.

### Using Docker CLI
```bash
docker run -d \
  --name chroma \
  -p 8123:8000 \
  -v $(pwd)/chroma_data:/chroma/chroma \
  chromadb/chroma:latest \
  --allow-reset \
  --disable-anonymized-telemetry
```

## 2. Install Node.js Dependencies
```bash
npm install chromadb
# Optional: install default embedder if needed
npm install chromadb-default-embed
```

## 3. Configure Environment
Set the Chroma server URL:
```bash
export CHROMA_BASE_URL=http://localhost:8123
```

## 4. Initialize the Client
In your Node.js code, import and configure the Chroma client:
```javascript
const { ChromaClient } = require('chromadb');

const baseUrl = process.env.CHROMA_BASE_URL || 'http://localhost:8123';
const client = new ChromaClient({ path: baseUrl });
```

## 5. Create or Retrieve a Collection
```javascript
async function setupCollection() {
  const collection = await client.getOrCreateCollection({
    name: 'my_collection',
    metadata: {
      description: 'Example collection',
      timestamp: new Date().toISOString(),
    },
    dimensions: 768,
  });
  return collection;
}
```

## 6. Add Embeddings
```javascript
async function addEmbeddings(collection, items) {
  // items: Array of { id: string, values: number[], metadata: object, document: string }
  const ids = items.map(i => i.id);
  const embeddings = items.map(i => i.values);
  const metadatas = items.map(i => i.metadata);
  const documents = items.map(i => i.document);

  await collection.add({
    ids,
    embeddings,
    metadatas,
    documents,
  });
}
```

## 7. Query for Similar Embeddings
```javascript
async function queryEmbeddings(collection, queryVector, topK = 5, filter = {}) {
  const results = await collection.query({
    queryEmbeddings: [queryVector],
    nResults: topK,
    include: ['metadatas', 'documents', 'distances'],
    where: Object.keys(filter).length ? filter : undefined,
  });

  // Format results
  const ids = results.ids[0] || [];
  const scores = results.distances[0] || [];
  const metadatas = results.metadatas[0] || [];
  const documents = results.documents[0] || [];
  return ids.map((id, idx) => ({
    id,
    score: scores[idx],
    metadata: metadatas[idx],
    document: documents[idx],
  }));
}
```

## 8. Delete a Collection
```javascript
async function deleteCollection(name) {
  await client.deleteCollection(name);
}
```

## 9. Direct HTTP API Calls
You can also call the HTTP API endpoints directly using `fetch` or similar:
```javascript
const fetch = require('node-fetch');

async function createCollectionHttp(name) {
  const baseUrl = process.env.CHROMA_BASE_URL || 'http://localhost:8123';
  const res = await fetch(`${baseUrl}/api/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}
```


# Using Collections in Chroma with Node.js

Collections are the primary way to organize and manage data in Chroma DB. Each collection can hold a set of embeddings, documents, and metadata, allowing you to group related data together. This is similar to how namespaces are used in other vector databases like Pinecone, but in Chroma, we use the term "collections."

In this section, we'll explore how to work with collections in Chroma using the Node.js client. We'll cover creating collections, listing them, checking for existence, updating metadata, adding and querying data, and more.

## 1. Creating a Collection

To create a new collection, use the `getOrCreateCollection` method of the Chroma client. This method creates the collection if it doesn't exist or returns the existing one if it does.

```javascript
const collection = await client.getOrCreateCollection({
  name: 'my_collection',
  metadata: {
    description: 'This is an example collection',
    createdBy: 'John Doe',
    createdAt: new Date().toISOString(),
  },
  dimensions: 768, // The dimensionality of the vector space
});
```

- **Parameters**:
  - `name`: A unique identifier for the collection. It must be between 3 and 63 characters long and can only contain lowercase letters, numbers, and hyphens.
  - `metadata`: An object that can hold any additional information about the collection. This is useful for tracking who created the collection, when it was created, or other relevant details.
  - `dimensions`: The number of dimensions for the vectors stored in this collection. All embeddings added to this collection must have this many dimensions.

**Best Practice**: Ensure the collection name is unique and follows the naming conventions (3-63 characters, lowercase letters, numbers, and hyphens).

## 2. Listing All Collections

To list all existing collections, use the `listCollections` method.

```javascript
const collections = await client.listCollections();
console.log(collections);
```

This returns an array of collection objects, each containing the name and metadata of the collection.

## 3. Checking if a Collection Exists

Before creating a new collection, check if it already exists using the `getCollection` method.

```javascript
async function collectionExists(name) {
  try {
    await client.getCollection({ name });
    return true;
  } catch (error) {
    if (error.message.includes('Collection not found')) {
      return false;
    }
    throw error;
  }
}

const exists = await collectionExists('my_collection');
console.log(`Collection exists: ${exists}`);
```

**Why This Matters**: Avoiding duplicate collections ensures data integrity and prevents unnecessary resource usage.

## 4. Updating Collection Metadata

To update the metadata of an existing collection, use the `update` method on the collection object.

```javascript
const collection = await client.getCollection({ name: 'my_collection' });
await collection.update({
  metadata: {
    ...collection.metadata,
    lastUpdated: new Date().toISOString(),
  },
});
```

- **Explanation**: This example updates the `lastUpdated` field while preserving existing metadata.

**Note**: Metadata is always overwritten when updated. To add a new key-value pair, retrieve the existing metadata and merge it with the new data.

## 5. Adding Data to Collections

Add data to a collection by including embeddings, metadata, and documents. You can also use embedding functions (like `OpenAIEmbeddingFunction`) to generate embeddings automatically.

```javascript
const items = [
  {
    id: '1',
    values: [0.1, 0.2, 0.3, /* ... 768 values ... */],
    metadata: { author: 'Alice', date: '2023-01-01' },
    document: 'This is the first document.',
  },
  {
    id: '2',
    values: [0.4, 0.5, 0.6, /* ... 768 values ... */],
    metadata: { author: 'Bob', date: '2023-01-02' },
    document: 'This is the second document.',
  },
];

await collection.add({
  ids: items.map(i => i.id),
  embeddings: items.map(i => i.values),
  metadatas: items.map(i => i.metadata),
  documents: items.map(i => i.document),
});
```

- **Parameters**:
  - `ids`: Unique identifiers for each embedding.
  - `embeddings`: The vector representations.
  - `metadatas`: Additional information about each embedding.
  - `documents`: The original text or data that the embeddings represent.

**Using Embedding Functions**:
If you don't have precomputed embeddings, use an embedding function like `OpenAIEmbeddingFunction`.

```javascript
const { ChromaClient, OpenAIEmbeddingFunction } = require('chromadb');
const embedder = new OpenAIEmbeddingFunction({
  openai_api_key: 'your-api-key',
  model_name: 'text-embedding-ada-002',
});

const collection = await client.createCollection({
  name: 'my_collection',
  embeddingFunction: embedder,
});

await collection.add({
  ids: ['id1', 'id2'],
  documents: ['Document 1 content', 'Document 2 content'],
});
```

## 6. Querying Collections

To find similar embeddings, use the `query` method, which is useful for tasks like semantic search or document retrieval.

```javascript
const queryVector = [0.2, 0.3, 0.4, /* ... 768 values ... */];
const results = await collection.query({
  queryEmbeddings: [queryVector],
  nResults: 5,
  include: ['metadatas', 'documents', 'distances'],
  where: { author: 'Alice' }, // Filter by metadata
});

const ids = results.ids[0];
const scores = results.distances[0];
const metadatas = results.metadatas[0];
const documents = results.documents[0];

ids.forEach((id, index) => {
  console.log(`ID: ${id}, Score: ${scores[index]}, Metadata: ${JSON.stringify(metadatas[index])}, Document: ${documents[index]}`);
});
```

- **Parameters**:
  - `queryEmbeddings`: The vector(s) to query with.
  - `nResults`: The number of top results to return.
  - `include`: What to include in the results (e.g., `metadatas`, `documents`, `distances`).
  - `where`: A filter based on metadata (e.g., `{ author: 'Alice' }`).

**Example with Natural Language**:
If using an embedding function, query with text directly.

```javascript
const results = await collection.query({
  queryTexts: ['What are some recent developments in AI?'],
  nResults: 2,
});
```

## 7. Deleting Data from Collections

To delete specific embeddings, use the `delete` method.

```javascript
await collection.delete({
  ids: ['1', '2'], // IDs to delete
});
```

## 8. Deleting a Collection

To delete an entire collection, use the `deleteCollection` method on the client.

```javascript
await client.deleteCollection('my_collection');
```

## 9. Using HTTP API for Collections

Interact with collections directly via HTTP requests for integration with external systems.

- **Create a Collection**:
  ```javascript
  const fetch = require('node-fetch');
  const baseUrl = process.env.CHROMA_BASE_URL || 'http://localhost:8000';
  await fetch(`${baseUrl}/api/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'my_collection',
      metadata: { description: 'Example collection' },
      dimensions: 768,
    }),
  });
  ```

- **List Collections**:
  ```javascript
  const response = await fetch(`${baseUrl}/api/v1/collections`);
  const collections = await response.json();
  console.log(collections);
  ```

- **Delete a Collection**:
  ```javascript
  await fetch(`${baseUrl}/api/v1/collections/my_collection`, {
    method: 'DELETE',
  });
  ```

For more details, see the [Chroma API specification](https://docs.trychroma.com/api).

## 10. Advanced Features and Best Practices

- **Persistence**: Chroma DB supports persistence when running locally or in a container. Ensure your Node.js application connects to a persistent Chroma server for production use.
- **Remote Server**: Connect to a remote Chroma server by setting the `path` parameter:
  ```javascript
  const client = new ChromaClient({ path: 'http://your-remote-server:8000' });
  ```
- **Metadata Filtering**: Use the `where` parameter to filter results based on metadata:
  ```javascript
  await collection.query({
    queryEmbeddings: [queryVector],
    nResults: 5,
    where: { date: { $gte: '2023-01-01' } }, // Filter documents with date >= 2023-01-01
  });
  ```
- **Error Handling**: Handle errors for operations on non-existent collections:
  ```javascript
  try {
    const collection = await client.getCollection({ name: 'non_existent' });
  } catch (error) {
    console.error('Error:', error.message);
  }
  ```

## Example Use Case: Topic Classification

Here's an example of using Chroma DB for topic classification:

```javascript
const { ChromaClient, OpenAIEmbeddingFunction } = require('chromadb');
const client = new ChromaClient({ path: 'http://localhost:8000' });
const embedder = new OpenAIEmbeddingFunction({ openai_api_key: 'your-api-key' });

const collection = await client.createCollection({
  name: 'topic_classification',
  embeddingFunction: embedder,
});

// Add sample data
await collection.add({
  ids: ['id1', 'id2'],
  documents: ['apple jumped 10% today', 'i like apple pie'],
  metadatas: [{ category: 'Stocks' }, { category: 'Food' }],
});

// Query with natural language
const results = await collection.query({
  queryTexts: ['is apple stock a good buy?', 'i ate an apple flavored jolly rancher'],
  nResults: 1,
});

// Results classify queries as 'Stocks' or 'Food'
console.log(results);
```

## Integration with Frameworks

Chroma DB can be used with frameworks like Langchain for advanced AI applications:

```javascript
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';

const embeddings = new OpenAIEmbeddings({ model: 'text-embedding-3-small' });
const vectorStore = new Chroma(embeddings, {
  collectionName: 'a-test-collection',
  url: 'http://localhost:8000',
  collectionMetadata: { 'hnsw:space': 'cosine' },
});
```

See the [Langchain documentation](https://js.langchain.com/docs/integrations/vectorstores/chroma/) for more details.

## Conclusion on collections usage

By following these steps and examples, you can effectively use collections in Chroma with your Node.js applications to manage and query vector data efficiently. Collections provide a powerful way to organize data for tasks like semantic search and document retrieval.

# Full Chroma reference

# Chroma OpenAPI Specification

## API Endpoints

### Version 1

- **GET** `/api/v1` - Root
- **POST** `/api/v1/reset` - Reset
- **GET** `/api/v1/version` - Version
- **GET** `/api/v1/heartbeat` - Heartbeat
- **GET** `/api/v1/pre-flight-checks` - Pre Flight Checks
- **POST** `/api/v1/databases` - Create Database V1
- **GET** `/api/v1/databases/{database}` - Get Database V1
- **POST** `/api/v1/tenants` - Create Tenant V1
- **GET** `/api/v1/tenants/{tenant}` - Get Tenant V1
- **GET** `/api/v1/collections` - List Collections V1
- **POST** `/api/v1/collections` - Create Collection V1
- **GET** `/api/v1/count_collections` - Count Collections V1
- **POST** `/api/v1/collections/{collection_id}/add` - Add V1
- **POST** `/api/v1/collections/{collection_id}/update` - Update V1
- **POST** `/api/v1/collections/{collection_id}/upsert` - Upsert V1
- **POST** `/api/v1/collections/{collection_id}/get` - Get V1
- **POST** `/api/v1/collections/{collection_id}/delete` - Delete V1
- **GET** `/api/v1/collections/{collection_id}/count` - Count V1
- **POST** `/api/v1/collections/{collection_id}/query` - Get Nearest Neighbors V1
- **GET** `/api/v1/collections/{collection_name}` - Get Collection V1
- **DELETE** `/api/v1/collections/{collection_name}` - Delete Collection V1
- **PUT** `/api/v1/collections/{collection_id}` - Update Collection V1

### Version 2

- **GET** `/api/v2` - Root
- **POST** `/api/v2/reset` - Reset
- **GET** `/api/v2/version` - Version
- **GET** `/api/v2/heartbeat` - Heartbeat
- **GET** `/api/v2/pre-flight-checks` - Pre Flight Checks
- **GET** `/api/v2/auth/identity` - Get User Identity
- **POST** `/api/v2/tenants/{tenant}/databases` - Create Database
- **GET** `/api/v2/tenants/{tenant}/databases/{database_name}` - Get Database
- **POST** `/api/v2/tenants` - Create Tenant
- **GET** `/api/v2/tenants/{tenant}` - Get Tenant
- **GET** `/api/v2/tenants/{tenant}/databases/{database_name}/collections` - List Collections
- **POST** `/api/v2/tenants/{tenant}/databases/{database_name}/collections` - Create Collection
- **GET** `/api/v2/tenants/{tenant}/databases/{database_name}/collections_count` - Count Collections
- **POST** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_id}/add` - Add
- **POST** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_id}/update` - Update
- **POST** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_id}/upsert` - Upsert
- **POST** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_id}/get` - Get
- **POST** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_id}/delete` - Delete
- **GET** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_id}/count` - Count
- **POST** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_id}/query` - Get Nearest Neighbors
- **GET** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_name}` - Get Collection
- **DELETE** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_name}` - Delete Collection
- **PUT** `/api/v2/tenants/{tenant}/databases/{database_name}/collections/{collection_id}` - Update Collection

## Client Specification

### JavaScript Client

The Chroma JavaScript client allows you to interact with the Chroma server from your JavaScript applications. Below are the main methods available in the client:

#### Installation

To install the Chroma JavaScript client, use one of the following package managers:

```bash
# Using yarn
yarn add chromadb chromadb-default-embed

# Using npm
npm install chromadb chromadb-default-embed

# Using pnpm
pnpm add chromadb chromadb-default-embed
```

#### Usage

Here is an example of how to use the Chroma JavaScript client:

```javascript
import { ChromaClient } from 'chromadb';

const client = new ChromaClient({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:8123',
});

// Example: Creating a collection
const collection = await client.createCollection('my-collection');

// Example: Adding an embedding
await collection.addEmbedding({
  embeddingId: 'embedding-id',
  vector: [0.1, 0.2, 0.3],
});

// Example: Querying embeddings
const results = await collection.queryEmbeddings({
  queryVector: [0.1, 0.2, 0.3],
  topK: 5,
});

console.log(results);
```

#### Methods

- **createCollection(name: string): Promise<Collection>**
  - Creates a new collection with the specified name.

- **getCollection(name: string): Promise<Collection>**
  - Retrieves an existing collection by name.

- **listCollections(): Promise<Collection[]>**
  - Lists all collections.

- **deleteCollection(name: string): Promise<void>**
  - Deletes a collection by name.

### Collection Methods

- **addEmbedding(embedding: { embeddingId: string, vector: number[] }): Promise<void>**
  - Adds a new embedding to the collection.

- **queryEmbeddings(query: { queryVector: number[], topK: number }): Promise<Embedding[]>**
  - Queries the collection for the nearest embeddings to the provided query vector.

- **deleteEmbedding(embeddingId: string): Promise<void>**
  - Deletes an embedding from the collection by its ID.

- **updateEmbedding(embedding: { embeddingId: string, vector: number[] }): Promise<void>**
  - Updates an existing embedding in the collection.

For more details, refer to the [official documentation](https://docs.trychroma.com/reference/js-client).

## Schemas

### AddEmbedding

- **embedding_id**: `str`
  - Description: Unique identifier for the embedding.
  - Constraints: Must be a valid UUID.
- **vector**: `List[float]`
  - Description: The vector representation of the embedding.
  - Constraints: Must be a list of floats.

### CreateCollection

- **name**: `str`
  - Description: The name of the collection.
  - Constraints: Maximum length of 255 characters.

### CreateDatabase

- **database_name**: `str`
  - Description: The name of the database.
  - Constraints: Maximum length of 255 characters.

### CreateTenant

- **tenant_id**: `str`
  - Description: Unique identifier for the tenant.
  - Constraints: Must be a valid UUID.

### DeleteEmbedding

- **embedding_id**: `str`
  - Description: Unique identifier for the embedding to delete.
  - Constraints: Must be a valid UUID.

### GetEmbedding

- **embedding_id**: `str`
  - Description: Unique identifier for the embedding to retrieve.
  - Constraints: Must be a valid UUID.

### HTTPValidationError

- **detail**: `List[ValidationError]`
  - Description: List of validation errors.

### IncludeEnum

- **value**: `str`
  - Description: Enum value for inclusion.
  - Constraints: Must be one of the predefined enum values.

### QueryEmbedding

- **query_vector**: `List[float]`
  - Description: The vector to query against the embeddings.
  - Constraints: Must be a list of floats.

### UpdateCollection

- **collection_id**: `str`
  - Description: Unique identifier for the collection to update.
  - Constraints: Must be a valid UUID.
- **new_name**: `str`
  - Description: New name for the collection.
  - Constraints: Maximum length of 255 characters.

### UpdateEmbedding

- **embedding_id**: `str`
  - Description: Unique identifier for the embedding to update.
  - Constraints: Must be a valid UUID.
- **new_vector**: `List[float]`
  - Description: The new vector representation of the embedding.
  - Constraints: Must be a list of floats.

### ValidationError

- **loc**: `List[Union[str, int]]`
  - Description: Location of the error.
- **msg**: `str`
  - Description: Error message.
- **type**: `str`
  - Description: Type of error.
