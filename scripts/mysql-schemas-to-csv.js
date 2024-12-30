#!/usr/bin/env node

import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { program } from 'commander';

/**
 * Example:
 * node scripts/mysql-schemas-to-csv.js -h localhost -u guest -p password -d geonline -t utilisateur
 */

program
  .option('-h, --host <host>', 'MySQL host', 'localhost')
  .option('-P, --port <port>', 'MySQL port', '3306')
  .option('-u, --user <user>', 'MySQL user')
  .option('-p, --password <password>', 'MySQL password')
  .option('-d, --database <database>', 'MySQL database name')
  .option('-o, --output <file>', 'Output CSV file', 'mysql-schemas.csv')
  .option('-t, --tables <tables>', 'Comma-separated list of tables to process')
  .option('-D, --delimiter <delimiter>', 'CSV delimiter', ';')
  .parse();

const options = program.opts();

async function getTableColumns(connection, tableName) {
  const [columns] = await connection.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [options.database, tableName]
  );
  return columns.map(col => col.COLUMN_NAME);
}

async function getTableDDL(connection, tableName) {
  const [result] = await connection.query('SHOW CREATE TABLE ??', [tableName]);
  return result[0]['Create Table'];
}

async function getForeignKeysAndIndexes(connection, tableName) {
  // Get foreign keys
  const [foreignKeys] = await connection.query(`
    SELECT 
      COLUMN_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME,
      CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [options.database, tableName]
  );

  // Get indexes
  const [indexes] = await connection.query(
    'SHOW INDEX FROM ??',
    [tableName]
  );

  return {
    foreignKeys: foreignKeys.map(fk => ({
      column: fk.COLUMN_NAME,
      referencedTable: fk.REFERENCED_TABLE_NAME,
      referencedColumn: fk.REFERENCED_COLUMN_NAME,
      constraintName: fk.CONSTRAINT_NAME
    })),
    indexes: indexes.map(idx => ({
      keyName: idx.Key_name,
      columnName: idx.Column_name,
      isUnique: idx.Non_unique === 0,
      type: idx.Index_type
    }))
  };
}

async function loadExistingData(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const rows = content.trim().split('\n');
    
    // Skip header row and empty rows
    const dataRows = rows.slice(1).filter(row => row.trim());
    
    const existingData = {};
    for (const row of dataRows) {
      const [code, metadata_small, metadata_big_1, metadata_big_2] = row.split(options.delimiter);
      if (code && code.trim()) {  // Only add if code exists and is not empty
        existingData[code.trim()] = {
          metadata_small: metadata_small || '',
          metadata_big_1: metadata_big_1 || '',
          metadata_big_2: metadata_big_2 || ''
        };
      }
    }
    return existingData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, return empty object
      return {};
    }
    console.error('Error loading existing data:', error);
    return {};
  }
}

async function processTable(connection, tableName) {
  try {
    const columns = await getTableColumns(connection, tableName);
    const ddl = await getTableDDL(connection, tableName);
    const fkAndIndexes = await getForeignKeysAndIndexes(connection, tableName);
    
    // Load existing data
    const existingData = await loadExistingData(options.output);
    
    // Process table schema
    const schemaCode = tableName;
    const schemaData = {
      metadata_small: JSON.stringify({ columns }),
      metadata_big_1: JSON.stringify({ ddl }),
      metadata_big_2: JSON.stringify(fkAndIndexes)
    };
    
    // Update or add schema information
    existingData[schemaCode] = schemaData;

    // Write all data back to CSV
    const csvContent = ['code,metadata_small,metadata_big_1,metadata_big_2'];
    
    // Add all data (both updated and existing)
    Object.entries(existingData).forEach(([code, data]) => {
      csvContent.push(`${code}${options.delimiter}${data.metadata_small}${options.delimiter}${data.metadata_big_1}${options.delimiter}${data.metadata_big_2}`);
    });

    await fs.writeFile(options.output, csvContent.join('\n'));
    console.log(`Updated schema information for table ${tableName}`);

  } catch (error) {
    console.error(`Error processing table ${tableName}:`, error);
    throw error;
  }
}

async function main() {
  if (!options.database) {
    console.error('Database name is required');
    process.exit(1);
  }

  const connection = await mysql.createConnection({
    host: options.host,
    port: parseInt(options.port),
    user: options.user,
    password: options.password,
    database: options.database
  });

  try {
    // Get all tables or use whitelist
    let tables;
    if (options.tables) {
      tables = options.tables.split(',').map(t => t.trim());
    } else {
      const [rows] = await connection.query(
        'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
        [options.database]
      );
      tables = rows.map(row => row.TABLE_NAME);
    }

    // Process each table
    for (const table of tables) {
      console.log(`Processing table: ${table}`);
      await processTable(connection, table);
    }

    console.log(`Successfully wrote schema information to ${options.output}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
