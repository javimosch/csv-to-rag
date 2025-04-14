Create a Node.js application that implements a RAG (Retrieval-Augmented Generation) system with the following specifications:

Data Processing:
Accept CSV files with columns: code (unique ID), metadata_small, metadata_big_1, metadata_big_2, metadata_big_3
Process and validate CSV files to ensure proper formatting and data integrity
Handle JSON-stringified data in metadata_big columns
Database Integration:
Store document embeddings in Pinecone vector database
Store complete records in MongoDB with the following schema:
code: String (unique identifier)
metadata_small: String
metadata_big_1: JSON
metadata_big_2: JSON
metadata_big_3: JSON
timestamp: Date
API Endpoints:
POST /csv/upload: Upload and process new CSV files
GET /csv/list: Retrieve list of processed CSV files
PUT /csv/update/:id: Update existing CSV data
DELETE /csv/delete/:id: Remove CSV data
POST /query: Perform similarity search and LLM interaction
Environment Configuration:
OPENAI_API_KEY: OpenAI API authentication
OPENROUTER_API_KEY: OpenRouter API authentication
MONGODB_URI: MongoDB connection string
PINECONE_API_KEY: Pinecone API key
PINECONE_ENVIRONMENT: Pinecone environment
PINECONE_INDEX: Pinecone index name
LLM_SYSTEM_PROMPT: Customizable system prompt for LLM interactions
Error Handling:
Implement comprehensive error handling for API requests
Validate input data formats
Handle service interruptions gracefully
Security:
Use CORS *
The application should follow RESTful principles and include appropriate logging and monitoring capabilities