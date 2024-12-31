# csv-to-rag

## Project Overview
This Node.js application implements a Retrieval-Augmented Generation (RAG) system that processes CSV files and integrates with Pinecone and MongoDB for data storage and retrieval.

## Data Processing
- Accepts CSV files with the following columns:
  - `code`: Unique identifier
  - `metadata_small`: Small metadata string
  - `metadata_big_1`: JSON-stringified data
  - `metadata_big_2`: JSON-stringified data
  - `metadata_big_3`: JSON-stringified data

## Database Integration
- Stores document embeddings in Pinecone vector database.
- Stores complete records in MongoDB with the following schema:
  - `code`: String (unique identifier)
  - `metadata_small`: String
  - `metadata_big_1`: JSON
  - `metadata_big_2`: JSON
  - `metadata_big_3`: JSON
  - `timestamp`: Date

## API Endpoints

### Upload CSV File
- **POST** `/csv/upload`
- **Description**: Upload and process new CSV files.
- **Curl Example**:
  ```bash
  curl -X POST http://localhost:3000/csv/upload \
    -F "file=@/home/jarancibia/Documents/repos/csv-to-rag/mysql-schemas.csv"
  ```

### List Processed CSV Files
- **GET** `/csv/list`
- **Description**: Retrieve a list of processed CSV files.
- **Curl Example**:
  ```bash
  curl -X GET http://localhost:3000/csv/list
  ```

### Update CSV Data
- **PUT** `/csv/update/:id`
- **Description**: Update existing CSV data.
- **Curl Example**:
  ```bash
  curl -X PUT http://localhost:3000/csv/update/12345 \
    -H "Content-Type: application/json" \
    -d '{"metadata_small": "Updated value"}'
  ```

### Delete CSV Data
- **DELETE** `/csv/delete/:id`
- **Description**: Remove CSV data.
- **Curl Example**:
  ```bash
  curl -X DELETE http://localhost:3000/csv/delete/12345
  ```

### Perform Similarity Search
- **POST** `/query`
- **Description**: Perform similarity search and LLM interaction.
- **Curl Example**:
  ```bash
  curl -X POST http://localhost:3000/query \
    -H "Content-Type: application/json" \
    -d '{"query": "Your search query here"}'
  ```

## Environment Configuration
- `OPENAI_API_KEY`: OpenAI API authentication
- `OPENROUTER_API_KEY`: OpenRouter API authentication
- `MONGODB_URI`: MongoDB connection string
- `PINECONE_API_KEY`: Pinecone API key
- `PINECONE_INDEX`: Pinecone index name
- `LLM_SYSTEM_PROMPT`: Customizable system prompt for LLM interactions

## Error Handling
Comprehensive error handling is implemented for all API requests to ensure proper feedback and logging.

## UI

There is a standalone UI that can be run with the following command:

```bash
deno run --allow-net --allow-env --allow-read --allow-run --watch scripts/deno-ui.js 
```

Note: Requires Deno to be installed.

## Docker image 

```bash
docker build -t javimosch/csv-to-rag-backend:
1.0 -f Dockerfile.backend .
```