import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { csvRoutes } from './routes/csv.routes.js';
import { queryRoutes } from './routes/query.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { setupMongoDB } from './config/mongodb.js';
import { initPinecone } from './config/pinecone.js';
import { initOpenAI } from './config/openai.js';
import { logger } from './utils/logger.js';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX', //ENVIRONMENT is not required
  'MONGODB_URI',
  'PORT'
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

// Routes
app.use('/csv', csvRoutes);
app.use('/query', queryRoutes);

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