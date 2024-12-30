import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { csvRoutes } from './routes/csv.routes.js';
import { queryRoutes } from './routes/query.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { setupMongoDB } from './config/mongodb.js';
import { setupPinecone } from './config/pinecone.js';
import { logger } from './utils/logger.js';

dotenv.config();

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
    await setupPinecone();
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();