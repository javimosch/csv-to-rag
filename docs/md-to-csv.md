# Markdown to CSV Conversion Script

## Overview

The `md-to-csv.js` script is designed to convert any markdown file into the generic CSV format used by the `csv-to-rag` project. This allows markdown content to be integrated into the existing data processing pipeline, enabling seamless storage and retrieval through the system's database integrations.

## CSV Format

The CSV format expected by the project includes the following columns:

- `code`: Unique identifier for each entry.
- `metadata_small`: A brief metadata string extracted from the markdown.
- `metadata_big_1`: JSON-stringified data, potentially containing more detailed metadata or content.
- `metadata_big_2`: JSON-stringified data for additional content or metadata.
- `metadata_big_3`: JSON-stringified data for further content or metadata.

## Script Functionality

- **Input**: A markdown file.
- **Output**: A CSV file conforming to the project's format.

### Steps

1. **Parse Markdown**: Extract headings, paragraphs, lists, and other relevant content from the markdown file.
2. **Generate Unique Code**: Create a unique identifier for each entry based on the content or a hash of the file.
3. **Extract Metadata**: Identify key pieces of information to populate `metadata_small`. This could be the title or a summary.
4. **Structure Content**: Convert sections of the markdown into JSON-stringified objects for `metadata_big_1`, `metadata_big_2`, and `metadata_big_3`.
5. **Write CSV**: Output the processed data into a CSV file with the specified columns.

## Usage Example

```bash
node scripts/md-to-csv.js -i /path/to/markdown.md -o /path/to/output.csv
```

- `-i, --input <file>`: Path to the input markdown file.
- `-o, --output <file>`: Path to the output CSV file.

## Considerations

- Ensure markdown is well-structured to facilitate accurate parsing.
- Customize metadata extraction logic to suit specific project needs.
