
import dotenv from 'dotenv';

dotenv.config();

import { logger } from './utils/logger.js';
import express from 'express';
import cors from 'cors';

logger.info('Dotenv loaded'); //It doesnt print

//print inside csv.routes is called first
import { csvRoutes } from './routes/csv.routes.js';
import { queryRoutes } from './routes/query.routes.js';
import { logRoutes } from './routes/log.routes.js';
import { chromaRoutes } from './routes/chroma.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { setupMongoDB } from './config/mongodb.js';
import { initPinecone } from './config/pinecone.js';
import { initOpenAI, initOpenAIEmbedding } from './config/openai.js';

// Determine vector DB provider: use Chroma if CHROMA_BASE_URL is set, else Pinecone
const useChroma = Boolean(process.env.CHROMA_BASE_URL);
// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'MONGODB_URI',
  'PORT',
  'BACKEND_API_KEY'
];
if (useChroma) {
  requiredEnvVars.push('CHROMA_BASE_URL');
} else {
  requiredEnvVars.push('PINECONE_API_KEY', 'PINECONE_INDEX');
}

function validateEnv() {
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
  }
  
  logger.info('All required environment variables are set');
}

// Validate environment variables before starting the server
validateEnv();


const app = express();
const PORT = process.env.CSVTORAG_PORT||process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Bearer token authentication middleware
const authenticateApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];
  
  if (token !== process.env.BACKEND_API_KEY) {
    console.log('Invalid API key',{
      token,
      expected: process.env.BACKEND_API_KEY
    });
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
};

// Apply authentication middleware to all /api routes
app.use('/api', authenticateApiKey);

// Routes
app.use('/api/csv', csvRoutes);
app.use('/api', queryRoutes); // Now includes /completion
app.use('/api/logs', logRoutes);
// Chroma sync endpoint
app.use('/api', chromaRoutes);

app.get('/', (req, res) => {
  res.send(`CSV to RAG API running on port ${PORT}`);
});

// Error handling
app.use(errorHandler);

// Initialize databases and start server
async function startServer() {
  try {
    await setupMongoDB();
    // Initialize vector DB client based on provider
    if (useChroma) {
      const { initChromaClient } = await import('./config/chroma.js');
      await initChromaClient();
      logger.info('Using Chroma vector store');
    } else {
      await initPinecone();
      logger.info('Using Pinecone vector store');
    }
    await initOpenAI();
    await initOpenAIEmbedding();
    app.listen(PORT, () => {
      logger.info(`Server running on port http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
