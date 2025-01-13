# Database Health Check and Repair Tool

The `db-health.js` script is a utility tool designed to monitor and maintain the health of MongoDB documents and Pinecone vectors. It provides functionality to check the synchronization between MongoDB and Pinecone, and repair any inconsistencies in metadata. This can also be used to upload/embed new files to both databases by using the repair mode.

## Features

- Health check of MongoDB documents and Pinecone vectors
- Repair of missing or inconsistent metadata
- Automatic fixing of orphaned vectors (vectors without fileName)
- Batch processing with configurable sizes
- Interactive or automated repair mode

## Usage

### Basic Health Check

To run a health check without making any changes:

```bash
node scripts/db-health.js
```

This will:
1. Check MongoDB document counts by fileName
2. Check Pinecone vector counts and metadata
3. Report any discrepancies between the two databases
4. Identify orphaned vectors (vectors without fileName metadata)

### Repair Mode

To repair metadata using a CSV file:

```bash
node scripts/db-health.js --repair --file=./path/to/file.csv [--auto]
```

Options:
- `--repair`: Enables repair mode
- `--file`: Path to the CSV file containing the records to repair
- `--auto`: (Optional) Run in automatic mode without prompting for confirmation

The repair process will:
1. Extract fileName from the CSV path
2. Update MongoDB documents with correct fileName and metadata
3. Fix orphaned vectors by setting their fileName metadata
4. Update all vector metadata to ensure consistency

Note: This mode can be used to upload/embed new files to both databases even if no data is present in mongo/pinecone.

## Health Check Output

The script provides detailed health information:

```
=== MongoDB Health ===
Total Documents: XXX

Documents by File:
  file1.csv          XXX documents
  file2.csv          XXX documents

=== Pinecone Health ===
Total Vectors:          XXX
Vectors with fileName:  XXX
Orphaned Vectors:       XXX

Vectors by File:
  file1.csv          XXX vectors
  file2.csv          XXX vectors

=== Discrepancies ===
  file1.csv:
    MongoDB:       XXX documents
    Pinecone:      XXX vectors
    Difference:    XXX missing in Pinecone
```

## Data Model

### MongoDB Document Schema
```javascript
{
  code: String,          // Required, indexed
  fileName: String,      // Required, indexed
  metadata_small: String // Required
  source: String        // Optional
}
```

### Pinecone Vector Metadata
```javascript
{
  code: String,
  fileName: String,
  metadata_small: String
}
```

## Error Handling

The script includes comprehensive error handling:
- Connection errors for both MongoDB and Pinecone
- CSV parsing errors
- Invalid vector dimensions
- Failed metadata updates
- Batch processing errors

## Implementation Details

### Batch Processing
- Records are processed in batches to optimize performance
- Default batch size is calculated to ensure max 5 parallel batches
- Each batch can be manually confirmed in interactive mode

### Orphan Vector Repair
- Identifies vectors missing fileName metadata
- Uses Pinecone's update API to fix metadata without re-embedding
- Maintains vector values while updating metadata

### Metadata Synchronization
- Ensures consistency between MongoDB documents and Pinecone vectors
- Updates both databases in a single operation
- Preserves existing vector embeddings when possible

## Best Practices

1. Always run a health check before repairs
2. Use `--auto` mode for large datasets
3. Keep CSV files organized by domain/purpose
4. Monitor logs for any failed updates
5. Verify health check after repairs

## Troubleshooting

Common issues and solutions:

1. **MongoDB Connection Errors**
   - Verify MongoDB connection string
   - Check database permissions

2. **Pinecone API Errors**
   - Verify API key and environment
   - Check rate limits

3. **Missing Files**
   - Ensure CSV file paths are correct
   - Check file permissions

4. **Orphaned Vectors**
   - Run repair with correct CSV file
   - Check fileName extraction logic

## Logging

The script uses a structured logging system with different levels:
- INFO: General progress and statistics
- DEBUG: Detailed operation information
- ERROR: Failed operations and exceptions

Logs include:
- Operation timestamps
- Batch processing progress
- Vector metadata updates
- Error details with stack traces
