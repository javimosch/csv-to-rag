# CSV Upload Process Flow

## Overview
This document outlines the process flow for handling CSV file uploads in the application, including data validation, processing, and storage in MongoDB and Pinecone.

## Process Flow Steps

1. **File Upload**  
   The user uploads a CSV file through the application interface.

2. **Initial Request Handling**  
   - The request headers and files are logged for debugging purposes.
   - The application extracts the original file name from the uploaded file.

3. **Asynchronous Processing Initiation**  
   - The application responds immediately with a success message and a job ID, indicating that processing has started in the background.
   - The processing includes:
     - **File Size**: Logged for monitoring.

4. **Cleanup Existing Data**  
   - The application checks for existing MongoDB documents and Pinecone vectors associated with the same `fileName`.
   - If existing data is found, it is deleted from both MongoDB and Pinecone to avoid duplicates.
   - The number of deleted records is logged.

5. **CSV Parsing**  
   - The uploaded CSV file is parsed to extract records.
   - Each record is validated, and the total number of records processed is logged.
   - If no valid records are found, an error is thrown, and processing is halted.

6. **Generate Embeddings**  
   - OpenAI embeddings are generated for the valid records.
   - The application logs the start of the embedding generation process.
   - If embedding generation fails, an error is thrown, and processing is halted.

7. **Save to MongoDB**  
   - The valid records are saved to MongoDB within a transaction to ensure data integrity.
   - The application logs the number of records saved.

8. **Save to Pinecone**  
   - The generated embeddings are saved to Pinecone, with the associated `fileName` included in the metadata.
   - The application logs the successful saving of embeddings.

9. **Transaction Commit**  
   - If all operations succeed, the transaction is committed, and the application logs the successful completion of the background processing.

10. **Error Handling**  
   - If any step fails during processing, the transaction is rolled back to maintain data integrity.
   - Relevant error messages are logged, and any necessary cleanup is performed.

## Conclusion
This process flow ensures that CSV uploads are handled efficiently, with proper validation, error handling, and data integrity across MongoDB and Pinecone.
