import { initPinecone } from '../config/pinecone.js';
import { getOpenAIEmbedding } from '../config/openai.js';
import { Document } from '../models/document.model.js';
import { logger, completionLogger } from '../utils/logger.js';

export class QueryService {
  static async performSimilaritySearch(query, limit = 5, namespace = 'default') {
    try {
      logger.info('Starting similarity search for query:', { query, namespace });
      const pineconeIndex = await initPinecone();
      const openai = getOpenAIEmbedding();
      
      logger.info('Generating query embedding',{
        model: process.env.EMBEDDING_OPENAI_MODEL||"text-embedding-ada-002"
      });
      const queryEmbedding = await openai.embeddings.create({
        input: query,
        model: process.env.EMBEDDING_OPENAI_MODEL||"text-embedding-ada-002"
      });
      logger.info('Query embedding generated successfully');

      logger.info('Performing Pinecone vector search');
      const searchResults = await pineconeIndex.namespace(namespace).query({
        vector: queryEmbedding.data[0].embedding,
        topK: limit,
        includeMetadata: true
      });
      logger.info('Pinecone search completed', { 
        matchCount: searchResults.matches?.length || 0,
        namespace 
      });

      logger.info('Fetching documents from MongoDB');
      const documents = await Document.find({
        code: { $in: searchResults.matches.map(match => match.metadata.code) },
        namespace
      });
      logger.info('MongoDB documents retrieved', { 
        documentCount: documents.length,
        namespace 
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
      
      const openaiInstance = getOpenAI();
      const primaryModel = process.env.CSVTORAG_OPENAI_MODEL||process.env.OPENAI_MODEL || 'google/gemini-2.0-flash-exp:free';
      const fallbackModel = process.env.CSVTORAG_OPENAI_MODEL_FALLBACK||process.env.OPENAI_MODEL_FALLBACK || 'openai/gpt-4o-mini-2024-07-18';
      
      try {
        logger.info('Making completion request to openaiInstance', {
          model: primaryModel,
          timestamp: new Date().toISOString()
        });
        
        const messages = [
          { role: "system", content: process.env.LLM_SYSTEM_PROMPT },
          { role: "user", content: `Context: ${JSON.stringify(context)}\n\nQuery: ${query}` }
        ];

        completionLogger.info('Sending messages to completions:', {
          messages: [
            { role: 'system', content: process.env.LLM_SYSTEM_PROMPT },
            { role: 'user', content: `Context: ${JSON.stringify(context)}\n\nQuery: ${query}` }
          ],
          timestamp: new Date().toISOString()
        });

        const completion = await openaiInstance.chat.completions.create({
          model: primaryModel,
          messages
        });
        
        logger.info('openaiInstance response received', {
          hasChoices: !!completion?.choices,
          choicesLength: completion?.choices?.length
        });

        if (!completion?.choices?.[0]?.message?.content) {
          logger.error('Invalid completion response', { completion });
          throw new Error('Invalid completion response from openaiInstance Code: '+completion?.error?.code);
        }

        return completion.choices[0].message.content;
        
      } catch (error) {
        logger.error('Initial model error:', {
          error: error?.message,
          code: error?.error?.code || error?.code,
          metadata: error?.metadata,
          timestamp: new Date().toISOString()
        });

        // Check for various rate limit and resource exhaustion scenarios
        const isRateLimitError = 
          error?.status === 429 || 
          error?.error?.code === 429 ||
          error?.code === 429 ||
          (error?.metadata?.raw && JSON.parse(error.metadata.raw)?.error?.code === 429) ||
          (error?.message && error.message.includes('429'));

        if (isRateLimitError) {
          logger.warn('Rate limit or resource exhaustion detected - Activating fallback model', {
            primaryModel,
            fallbackModel,
            errorDetails: {
              message: error?.message,
              code: error?.error?.code,
              raw: error?.metadata?.raw,
              provider: error?.metadata?.provider_name
            },
            timestamp: new Date().toISOString()
          });
          
          try {
            logger.info('Attempting fallback model request', {
              model: fallbackModel,
              timestamp: new Date().toISOString()
            });

            const fallbackMessages = [
              { role: "system", content: process.env.LLM_SYSTEM_PROMPT },
              { role: "user", content: `Context: ${JSON.stringify(context)}\n\nQuery: ${query}` }
            ];

            completionLogger.info('Sending messages to completions:', {
              messages: fallbackMessages,
              timestamp: new Date().toISOString()
            });

            const fallbackCompletion = await openaiInstance.chat.completions.create({
              model: fallbackModel,
              messages: fallbackMessages
            });
            
            logger.info('Fallback model response received', {
              hasChoices: !!fallbackCompletion?.choices,
              choicesLength: fallbackCompletion?.choices?.length
            });

            if (!fallbackCompletion?.choices?.[0]?.message?.content) {
              logger.error('Invalid fallback completion response', { fallbackCompletion });
              throw new Error('Invalid completion response from fallback model');
            }

            return fallbackCompletion.choices[0].message.content;
          } catch (error) {
            logger.error('Fallback model error:', {
              error: error?.message,
              code: error?.error?.code,
              metadata: error?.metadata,
              timestamp: new Date().toISOString()
            });
            throw error;
          }
        }
        
        // If it's not a rate limit error, rethrow
        throw error;
      }
    } catch (error) {
      logger.error('Error generating response:', error);
      throw error;
    }
  }
}