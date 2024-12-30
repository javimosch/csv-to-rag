import OpenAI from 'openai';
import { initPinecone } from '../config/pinecone.js';
import { getOpenAI, getOpenRouter } from '../config/openai.js';
import { Document } from '../models/document.model.js';
import { logger } from '../utils/logger.js';

export class QueryService {
  static async performSimilaritySearch(query, limit = 5) {
    try {
      logger.info('Starting similarity search for query:', { query });
      const pineconeIndex = await initPinecone();
      const openai = getOpenAI();
      
      logger.info('Generating query embedding');
      const queryEmbedding = await openai.embeddings.create({
        input: query,
        model: 'text-embedding-ada-002'
      });
      logger.info('Query embedding generated successfully');

      logger.info('Performing Pinecone vector search');
      const searchResults = await pineconeIndex.query({
        vector: queryEmbedding.data[0].embedding,
        topK: limit,
        includeMetadata: true
      });
      logger.info('Pinecone search completed', { 
        matchCount: searchResults.matches?.length || 0 
      });

      logger.info('Fetching documents from MongoDB');
      const documents = await Document.find({
        code: { $in: searchResults.matches.map(match => match.metadata.code) }
      });
      logger.info('MongoDB documents retrieved', { 
        documentCount: documents.length 
      });

      return { searchResults, documents };
    } catch (error) {
      logger.error('Error in similarity search:', error);
      throw error;
    }
  }

  static async generateResponse(query, context) {
    try {
      logger.info('Starting response generation', { 
        contextSize: context?.length || 0 
      });
      
      const openrouter = getOpenRouter();
      logger.info('Making completion request to OpenRouter', {
        model: process.env.LLM_MODEL || 'google/gemini-2.0-flash-exp:free'
      });
      
      const completion = await openrouter.chat.completions.create({
        model: process.env.LLM_MODEL || 'google/gemini-2.0-flash-exp:free',
        messages: [
          { role: "system", content: process.env.LLM_SYSTEM_PROMPT },
          { role: "user", content: `Context: ${JSON.stringify(context)}\n\nQuery: ${query}` }
        ]
      });
      
      logger.info('OpenRouter response received', {
        hasChoices: !!completion?.choices,
        choicesLength: completion?.choices?.length
      });

      if (!completion?.choices?.[0]?.message?.content) {
        logger.error('Invalid completion response', { completion });
        throw new Error('Invalid completion response from OpenRouter');
      }

      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error generating response:', error);
      throw error;
    }
  }
}