import OpenAI from 'openai';
import { setupPinecone } from '../config/pinecone.js';
import { Document } from '../models/document.model.js';
import { logger } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export class QueryService {
  static async performSimilaritySearch(query, limit = 5) {
    try {
      const pineconeIndex = await setupPinecone();
      
      const queryEmbedding = await openai.embeddings.create({
        input: query,
        model: 'text-embedding-ada-002'
      });

      const searchResults = await pineconeIndex.query({
        vector: queryEmbedding.data[0].embedding,
        topK: limit,
        includeMetadata: true
      });

      const documents = await Document.find({
        code: { $in: searchResults.matches.map(match => match.metadata.code) }
      });

      return { searchResults, documents };
    } catch (error) {
      logger.error('Error in similarity search:', error);
      throw error;
    }
  }

  static async generateResponse(query, context) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: process.env.LLM_SYSTEM_PROMPT },
          { role: "user", content: `Context: ${JSON.stringify(context)}\n\nQuery: ${query}` }
        ]
      });

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error generating response:', error);
      throw error;
    }
  }
}