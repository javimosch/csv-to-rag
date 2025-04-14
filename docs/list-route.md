# List Route Flow

## Overview
This document outlines the flow of the `/csv/list` route in the application, which is responsible for retrieving and displaying a summary of uploaded CSV files and their associated metadata.

## Process Flow Steps

1. **Route Definition**  
   The `/csv/list` route is defined in the `csv.routes.js` file. It handles GET requests to retrieve the list of uploaded files.

2. **Request Handling**  
   When a request is made to this route, the following actions occur:
   - The request is logged for debugging purposes.

3. **Database Aggregation**  
   The application performs an aggregation query on the MongoDB database to:
   - Group documents by `fileName`
   - Calculate statistics for each file:
     - Total number of rows
     - Last update timestamp
     - Sample metadata from the first row

4. **Response Preparation**  
   The response includes:
   - Total number of unique files
   - For each file:
     - File name
     - Number of rows processed
     - Last update timestamp
     - Sample metadata from one row

5. **Response Sending**  
   - The application sends the JSON response back to the client
   - The response status is set to 200 OK, indicating a successful retrieval of data

## How We Track Uploaded Files

- Each row from a CSV file is stored as a separate document in MongoDB
- Each document contains:
  - `fileName`: Identifies which file the row came from
  - `code`: Unique identifier for the row
  - `metadata_small`: Small metadata field
  - `metadata_big_1`, `metadata_big_2`, `metadata_big_3`: Larger metadata fields
  - `timestamp`: When the row was processed

- When listing files, we:
  1. Group all documents by `fileName`
  2. Calculate statistics (row count, last update)
  3. Include a sample of the data for preview purposes

## Example Response
```json
{
  "totalFiles": 2,
  "files": [
    {
      "fileName": "mysql-schemas.csv",
      "rowCount": 1000,
      "lastUpdated": "2024-12-30T21:36:31+01:00",
      "sampleMetadata": {
        "code": "example_code",
        "metadata_small": "example_metadata"
      }
    }
  ]
}
```

## Conclusion
This route provides a high-level overview of uploaded CSV files, showing meaningful statistics about each file's contents while maintaining the ability to track individual rows within the system.
