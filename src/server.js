
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
import { errorHandler } from './middleware/error.middleware.js';
import { setupMongoDB } from './config/mongodb.js';
import { initPinecone } from './config/pinecone.js';
import { initOpenAI } from './config/openai.js';

// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX', //ENVIRONMENT is not required
  'MONGODB_URI',
  'PORT',
  'BACKEND_API_KEY'
];

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
const PORT = process.env.PORT || 3000;

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

// Error handling
app.use(errorHandler);

// Initialize databases and start server
async function startServer() {
  try {
    await setupMongoDB();
    await initPinecone();
    await initOpenAI();
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
