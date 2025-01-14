#!/usr/bin/env node

import fs from 'fs/promises';
import crypto from 'crypto';
import { Command } from 'commander';

const program = new Command();

program
  .option('-i, --input <file>', 'Input markdown file')
  .option('-o, --output <file>', 'Output CSV file', 'output.csv')
  .option('-d, --delimiter <delimiter>', 'CSV delimiter', ';')
  .option('-m, --media-dir <dir>', 'Directory to save media files', 'images')
  .option('--overlap-percentage <percentage>', 'Percentage of context overlap between chunks', '20')
  .option('--max-metadata-size <size>', 'Maximum metadata size in tokens', '4860')
  .option('--encode-metadata', 'Encode metadata fields in base64')
  .option('--format-codefetch', 'Convert markdown representing a codebase')
  .parse();

const options = program.opts();

if (!options.input) {
  console.error('Error: Input file is required');
  process.exit(1);
}

// Validate overlap percentage
const overlapPercentage = parseInt(options.overlapPercentage);
if (isNaN(overlapPercentage) || overlapPercentage < 0 || overlapPercentage > 100) {
  console.error('Error: Overlap percentage must be between 0 and 100');
  process.exit(1);
}

// Validate metadata size
const maxMetadataSize = parseInt(options.maxMetadataSize);
if (isNaN(maxMetadataSize) || maxMetadataSize <= 0) {
  console.error('Error: Maximum metadata size must be a positive number');
  process.exit(1);
}

function generateHumanReadableId(type, content) {
  const sanitized = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, '_')
    .substring(0, 30);

  const hash = crypto
    .createHash('md5')
    .update(type + content)
    .digest('hex')
    .substring(0, 8);

  return `${type}_${sanitized}_${hash}`;
}

function parseTreeView(treeContent) {
  const fileMap = new Map();
  const lines = treeContent.split('\n');
  let currentPath = [];
  let currentDepth = 0;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const depth = line.search(/\S/);
    
    if (trimmed.startsWith('├──') || trimmed.startsWith('└──')) {
      const fileName = trimmed.replace(/^[├└]──\s*/, '').trim();
      const fullPath = [...currentPath, fileName].join('/');
      fileMap.set(fileName, fullPath);
    } else if (trimmed.startsWith('│')) {
      // Continue in current directory
    } else {
      // Directory change
      if (depth > currentDepth) {
        // Going deeper
        const dirName = trimmed;
        currentPath.push(dirName);
        currentDepth = depth;
      } else if (depth < currentDepth) {
        // Going up
        const levelsUp = (currentDepth - depth) / 4;
        currentPath = currentPath.slice(0, -levelsUp);
        currentDepth = depth;
      }
    }
  });

  return fileMap;
}

function parseMarkdownContent(content) {
  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = '';
  let currentTitle = '';
  let inParagraph = false;
  let overlapSize = 0;
  let previousChunkEnd = '';

  // Calculate overlap size based on max metadata size
  const maxChunkSize = options.maxMetadataSize * 4; // Approximate token to character ratio
  overlapSize = Math.floor(maxChunkSize * (options.overlapPercentage / 100));

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;

    // Handle titles
    if (trimmed.startsWith('#')) {
      // Save current chunk if exists
      if (currentChunk) {
        const chunkContent = currentChunk.trim();
        chunks.push({
          title: currentTitle,
          content: previousChunkEnd + chunkContent
        });
        
        // Store the end of this chunk for overlap
        previousChunkEnd = chunkContent.slice(-overlapSize);
        currentChunk = '';
      }
      currentTitle = trimmed.replace(/^#+\s*/, '');
      continue;
    }

    // Handle paragraphs
    if (!inParagraph) {
      currentChunk += `${currentTitle ? `${currentTitle}\n` : ''}`;
      inParagraph = true;
    }
    currentChunk += `${line}\n`;

    // Check if we need to split the chunk
    if (currentChunk.length >= maxChunkSize) {
      const chunkContent = currentChunk.trim();
      chunks.push({
        title: currentTitle,
        content: previousChunkEnd + chunkContent
      });
      
      // Store the end of this chunk for overlap
      previousChunkEnd = chunkContent.slice(-overlapSize);
      currentChunk = '';
      inParagraph = false;
    }
  }

  // Add final chunk
  if (currentChunk) {
    chunks.push({
      title: currentTitle,
      content: previousChunkEnd + currentChunk.trim()
    });
  }

  return chunks;
}

async function parseMarkdownFile(inputPath) {
  const content = await fs.readFile(inputPath, 'utf-8');
  
  if (options.formatCodefetch) {
    const lines = content.split('\n');
    const csvRows = [];
    let state = 'start';
    let treeViewLines = [];
    let currentFilePath = '';
    let codeLines = [];
    let fileMap = new Map();

    for (const line of lines) {
      if (state === 'start' && line.startsWith('```')) {
        state = 'tree-view';
        continue;
      }

      if (state === 'tree-view') {
        if (line.startsWith('```')) {
          state = 'file-path';
          fileMap = parseTreeView(treeViewLines.join('\n'));
          continue;
        }
        treeViewLines.push(line);
        continue;
      }

      if (state === 'file-path') {
        if (!line.trim()) continue;
        
        if (line.startsWith('```')) {
          state = 'code-block';
          continue;
        }
        
        currentFilePath = line.trim();
        continue;
      }

      if (state === 'code-block') {
        if (line.startsWith('```')) {
          // End of code block
          const fullPath = fileMap.get(currentFilePath) || currentFilePath;
          const codeContent = codeLines.join('\n');
          
          const row = {
            code: generateHumanReadableId('file', fullPath),
            metadata_small: codeContent.split('\n').slice(0, 3).join('\n'),
            metadata_big_1: codeContent,
            metadata_big_2: currentFilePath,
            metadata_big_3: fullPath
          };
          
          // Skip row if only code field has value
          if (row.metadata_small || row.metadata_big_1 || row.metadata_big_2 || row.metadata_big_3) {
            csvRows.push(row);
          }
          
          // Reset for next file
          currentFilePath = '';
          codeLines = [];
          state = 'file-path';
          continue;
        }
        
        codeLines.push(line);
      }
    }

    return csvRows;
  }

  // Handle regular markdown content
  const chunks = parseMarkdownContent(content);
  return chunks
    .map(chunk => ({
      code: generateHumanReadableId('content', chunk.title || chunk.content),
      metadata_small: chunk.content.substring(0, options.maxMetadataSize),
      metadata_big_1: chunk.content,
      metadata_big_2: '',
      metadata_big_3: ''
    }))
    .filter(row => row.metadata_small || row.metadata_big_1 || row.metadata_big_2 || row.metadata_big_3);
}

async function writeCSV(data, outputPath, delimiter) {
  const headers = ['code', 'metadata_small', 'metadata_big_1', 'metadata_big_2', 'metadata_big_3'];
  
  const csvContent = [
    headers.join(delimiter),
    ...data.map(row => {
      return headers.map(header => {
        let value = row[header] || '';
        if (options.encodeMetadata && header.startsWith('metadata_')) {
          value = Buffer.from(value.toString()).toString('base64');
        }
        
        // Escape line breaks and quotes
        value = value.toString()
          .replace(/\n/g, '\\n')
          .replace(/"/g, '""');
          
        return value.includes(delimiter) || value.includes('"') ? `"${value}"` : value;
        return value.includes(delimiter) ? `"${value}"` : value;
      }).join(delimiter);
    })
  ].join('\n');

  await fs.writeFile(outputPath, csvContent, 'utf-8');
  console.log(`CSV file written to ${outputPath}`);
}

async function main() {
  try {
    const data = await parseMarkdownFile(options.input);
    await writeCSV(data, options.output, options.delimiter);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
