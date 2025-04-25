# Generic CSV Format for Uploads

This document describes the required CSV format for uploads, as inferred from the code in `scripts/mysql-schemas-to-csv.js` and `scripts/md-to-csv.js`.

## Required Columns (Header)

For MySQL schemas:
```
code,metadata_small,metadata_big_1,metadata_big_2
```

For Markdown conversion:
```
code,metadata_small,metadata_big_1,metadata_big_2,metadata_big_3
```

- **code**: Unique identifier for the row (e.g., table name, content chunk ID).
- **metadata_small**: Short summary or snippet (JSON-encoded or plain text, often a preview or summary).
- **metadata_big_1**: Main content or DDL (JSON-encoded or plain text, e.g., full content, table DDL).
- **metadata_big_2**: Additional metadata (JSON-encoded or plain text, e.g., foreign keys, indexes, or empty).
- **metadata_big_3**: (Optional, for markdown) More metadata (often empty for MySQL schema CSVs).

## Example (MySQL Schema)
```
code,metadata_small,metadata_big_1,metadata_big_2
users,"{\"columns\":[\"id\",\"name\"]}","{\"ddl\":\"CREATE TABLE ...\"}","{\"foreignKeys\":[],\"indexes\":[]}" 
```

## Example (Markdown)
```
code,metadata_small,metadata_big_1,metadata_big_2,metadata_big_3
content_intro_12345678,"This is a summary...","Full content here...",,
```

## Format Rules
- The file must start with the correct header row.
- Fields must be separated by the chosen delimiter (default: `;` but often `,` for uploads).
- All required columns must be present, even if some values are empty.
- JSON fields must be stringified and escaped properly.
- No extra columns or missing columns are allowed.

## Validation
Files not matching this structure will be rejected by the upload UI/API.

_Last updated: 2025-04-25_
