#!/usr/bin/env node

import { marked } from 'marked';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Command } from 'commander';

const program = new Command();

program
  .option('-i, --input <file>', 'Input markdown file')
  .option('-o, --output <file>', 'Output CSV file', 'output.csv')
  .option('-d, --delimiter <delimiter>', 'CSV delimiter', ';')
  .option('-m, --media-dir <dir>', 'Directory to save media files', 'images')
  .option('--group-by-md-tag <tag>', 'Group content by markdown heading level (e.g., ##)', '')
  .option('--encode-metadata', 'Encode metadata fields in base64')
  .option('--format-codefetch', 'Convert markdown representing a codebase')
  .parse();

const options = program.opts();

if (!options.input) {
  console.error('Error: Input file is required');
  process.exit(1);
}

if (options.formatCodefetch && options.groupByMdTag) {
  console.error('Error: --format-codefetch cannot be used in conjunction with --group-by-md-tag');
  process.exit(1);
}

// Get heading level from markdown tag (e.g., "##" -> 2)
function getHeadingLevel(mdTag) {
  return mdTag.length;
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

class Section {
  constructor(heading) {
    this.heading = heading;
    this.content = [];
    this.subsections = [];
  }

  addContent(item) {
    this.content.push(item);
  }

  addSubsection(section) {
    this.subsections.push(section);
  }

  toCSVRow() {
    const title = this.heading ? this.heading.text : 'Untitled Section';
    const headingLevel = this.heading ? this.heading.depth : 0;
    
    // Combine all content into structured metadata
    const contentByType = {
      text: [],
      list: [],
      code: [],
      table: [],
      image: []
    };

    // Process main content
    this.content.forEach(item => {
      if (contentByType[item.type]) {
        contentByType[item.type].push(item);
      }
    });

    // Process subsections recursively if not being grouped
    this.subsections.forEach(subsection => {
      subsection.content.forEach(item => {
        if (contentByType[item.type]) {
          contentByType[item.type].push(item);
        }
      });
    });

    // Create a summary for metadata_small
    const summary = [
      title,
      contentByType.text.length > 0 ? `${contentByType.text.length} paragraphs` : null,
      contentByType.list.length > 0 ? `${contentByType.list.length} lists` : null,
      contentByType.code.length > 0 ? `${contentByType.code.length} code blocks` : null,
      contentByType.table.length > 0 ? `${contentByType.table.length} tables` : null,
      contentByType.image.length > 0 ? `${contentByType.image.length} images` : null
    ].filter(Boolean).join(' | ');

    return {
      code: generateHumanReadableId('section', title),
      metadata_small: summary,
      metadata_big_1: JSON.stringify({
        title,
        headingLevel,
        paragraphs: contentByType.text.map(t => t.text)
      }),
      metadata_big_2: JSON.stringify({
        lists: contentByType.list.map(l => l.items),
        code: contentByType.code.map(c => c.text)
      }),
      metadata_big_3: JSON.stringify({
        tables: contentByType.table.map(t => t.rows),
        images: contentByType.image.map(i => i.href)
      })
    };
  }
}

function processMarkdownGrouped(tokens, targetLevel) {
  let currentSection = new Section(null);
  let sections = [currentSection];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (token.type === 'heading') {
      if (token.depth === targetLevel) {
        // Start a new main section
        currentSection = new Section(token);
        sections.push(currentSection);
      } else if (token.depth > targetLevel) {
        // This is a subsection
        const subsection = new Section(token);
        currentSection.addSubsection(subsection);
        currentSection = subsection;
      } else {
        // Reset to top level for higher-level headings
        currentSection = new Section(token);
        sections.push(currentSection);
      }
    } else {
      // Process regular content
      const processedElement = processToken(token);
      if (processedElement) {
        currentSection.addContent(processedElement);
      }
    }
  }

  // Convert sections to CSV rows and ensure all required fields are present
  return sections
    .map(section => section.toCSVRow())
    .filter(row => row.code && row.metadata_small);
}

function processToken(token) {
  switch (token.type) {
    case 'heading':
      return {
        type: 'heading',
        text: token.text,
        depth: token.depth
      };
    case 'paragraph':
      return {
        type: 'text',
        text: token.text
      };
    case 'list':
      return {
        type: 'list',
        items: token.items.map(item => item.text)
      };
    case 'code':
      return {
        type: 'code',
        text: token.text,
        lang: token.lang
      };
    case 'table':
      return {
        type: 'table',
        rows: token.rows
      };
    case 'image':
      return {
        type: 'image',
        href: token.href,
        text: token.text
      };
    default:
      return null;
  }
}

// Function to parse the markdown structure and convert it to the desired format
function parseCodebaseMarkdown(markdownContent) {
  const tokens = marked.lexer(markdownContent);
  let projectStructure = {};
  let dirStack = [projectStructure];
  let currentDepth = 0;
  let csvRows = [];
  let fileContents = {};

  // First pass: Extract file contents from code blocks
  let currentFile = null;
  tokens.forEach(token => {
    if (token.type === 'heading') {
      currentFile = token.text.trim();
    } else if (token.type === 'code' && currentFile) {
      fileContents[currentFile] = token.text;
      currentFile = null;
    }
  });

  // Second pass: Parse directory structure from first code block
  const structureBlock = tokens.find(t => t.type === 'code' && t.text.includes('Project Structure'));
  if (!structureBlock) {
    throw new Error('Could not find project structure in markdown');
  }

  const lines = structureBlock.text.split('\n');
  lines.forEach(line => {
    const trimmedLine = line.trim();
    
    if (line.startsWith('├──') || line.startsWith('└──')) {
      const fileName = line.replace(/^[├└]──\s*/, '').trim();
      dirStack[dirStack.length - 1][fileName] = 'file';
      const path = dirStack.map(d => Object.keys(d)[0]).join('/');
      const content = fileContents[fileName] || '';
      addCSVRow(fileName, 'file', path, content);
    } else if (line.startsWith('│')) {
      // Continue in the current directory
    } else if (trimmedLine) {
      // New directory detected
      const dirName = trimmedLine;
      const depth = line.search(/\S/); // Get indentation level
      
      if (depth > currentDepth) {
        // Going deeper - create new directory
        const newDir = {};
        dirStack[dirStack.length - 1][dirName] = newDir;
        dirStack.push(newDir);
        currentDepth = depth;
        addCSVRow(dirName, 'directory', dirStack.map(d => Object.keys(d)[0]).join('/'));
      } else if (depth < currentDepth) {
        // Going up - pop directories until we reach the correct level
        while (dirStack.length > 1 && depth < currentDepth) {
          dirStack.pop();
          currentDepth = line.search(/\S/);
        }
        // Create new directory at current level
        const newDir = {};
        dirStack[dirStack.length - 1][dirName] = newDir;
        dirStack.push(newDir);
        currentDepth = depth;
        addCSVRow(dirName, 'directory', dirStack.map(d => Object.keys(d)[0]).join('/'));
      } else {
        // Same level - replace current directory
        const newDir = {};
        dirStack[dirStack.length - 1][dirName] = newDir;
        dirStack[dirStack.length - 1] = newDir;
        addCSVRow(dirName, 'directory', dirStack.map(d => Object.keys(d)[0]).join('/'));
      }
    }
  });

  return csvRows;

  function addCSVRow(name, type, path, content = '') {
    if (type === 'file') {
      console.log(`Parsing ${name} into row (Mode: codebase)`);
    }
    csvRows.push({
      code: generateHumanReadableId(type, name),
      metadata_small: `${type}: ${name}`,
      metadata_big_1: JSON.stringify({
        name,
        type,
        path,
        content: type === 'file' ? content : undefined
      }),
      metadata_big_2: JSON.stringify({}),
      metadata_big_3: JSON.stringify({})
    });
  }
}

async function processMarkdown(inputPath, mediaDir) {
  try {
    const content = await fs.readFile(inputPath, 'utf-8');
    const tokens = marked.lexer(content);
    
    // Ensure media directory exists
    await fs.mkdir(mediaDir, { recursive: true });

    if (options.groupByMdTag) {
      const targetLevel = getHeadingLevel(options.groupByMdTag);
      return processMarkdownGrouped(tokens, targetLevel);
    }

    if (options.formatCodefetch) {
      return parseCodebaseMarkdown(content);
    }

    // Original non-grouped processing
    const results = [];
    for (const token of tokens) {
      const processedElement = processToken(token);
      if (processedElement) {
        const row = {
          code: generateHumanReadableId(processedElement.type, processedElement.text || ''),
          metadata_small: processedElement.text || '',
          metadata_big_1: JSON.stringify({
            type: processedElement.type,
            content: processedElement.text || ''
          }),
          metadata_big_2: JSON.stringify({}),
          metadata_big_3: JSON.stringify({})
        };
        
        // Only add rows that have required fields
        if (row.code && row.metadata_small) {
          results.push(row);
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error processing markdown:', error);
    throw error;
  }
}

async function writeCSV(data, outputPath, delimiter) {
  const headers = ['code', 'metadata_small', 'metadata_big_1', 'metadata_big_2', 'metadata_big_3'];
  
  const csvContent = [
    headers.join(delimiter),
    ...data.map(row => {
      return headers.map(header => {
        let value = row[header] || '';
        
        // Convert objects to strings if necessary
        if (typeof value === 'object') {
          value = JSON.stringify(value);
        }
        
        // Encode metadata fields if --encode-metadata is enabled
        if (options.encodeMetadata && header.startsWith('metadata_')) {
          value = Buffer.from(value).toString('base64');
        }
        
        // Escape delimiter in values
        return value.includes(delimiter) ? `"${value}"` : value;
      }).join(delimiter);
    })
  ].join('\n');

  await fs.writeFile(outputPath, csvContent, 'utf-8');
  console.log(`CSV file written to ${outputPath}`);
}

async function main() {
  try {
    const data = await processMarkdown(options.input, options.mediaDir);
    await writeCSV(data, options.output, options.delimiter);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
