# Pinecone Client Singleton Initialization

## Problem
Previously, the Pinecone client and index were being initialized every time `initPinecone()` was called. This caused repeated log entries and unnecessary client creation, especially during batch processing of CSV files.

## Solution
The Pinecone index is now cached at the module level in `src/config/pinecone.js`. The first call to `initPinecone()` creates and stores the index instance; subsequent calls return the same instance. This ensures only a single Pinecone client/index per process, improving performance and reducing log noise.

## Implementation
```js
// src/config/pinecone.js
let pineconeIndexInstance = null;
export async function initPinecone() {
  if (pineconeIndexInstance) return pineconeIndexInstance;
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  pineconeIndexInstance = pinecone.index(process.env.PINECONE_INDEX, process.env.PINECONE_HOST);
  return pineconeIndexInstance;
}
```

## Environment Variables
Ensure `.env` or `.env.example` contains:
- `PINECONE_API_KEY`
- `PINECONE_INDEX`
- `PINECONE_HOST`

## Impact
- No repeated client initialization logs
- More efficient resource usage
- Safe for concurrent batch operations

## Related files
- `src/config/pinecone.js`
- `.env.example`
