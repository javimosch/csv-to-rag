#!/usr/bin/env node

import { program } from 'commander';
import inquirer from 'inquirer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.csv-to-rag');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const defaultConfig = {
  API_URL: 'http://localhost:3000',
  API_KEY: '' // Added default API_KEY
};

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    return defaultConfig;
  } catch (error) {
    console.log('Error loading config:', { message: error.message, stack: error.stack });
    return defaultConfig;
  }
}

// Save config
function saveConfig(config) {
  try {
    console.log('cli/index.js saveConfig', { config });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.log('Error saving config:', { message: error.message, stack: error.stack });
    throw error;
  }
}

program
  .name('ctr')
  .description('CSV to RAG CLI')
  .version('1.0.0');

program
  .command('config')
  .description('Configure the CLI')
  .action(async () => {
    try {
      console.log('cli/index.js config command', { currentConfig: loadConfig() });
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'API_URL',
          message: 'Enter API URL:',
          default: loadConfig().API_URL
        },
        {
          type: 'input',
          name: 'API_KEY',
          message: 'Enter API Key:',
          default: loadConfig().API_KEY
        }
      ]);
      saveConfig(answers);
      console.log('Configuration saved successfully');
    } catch (error) {
      console.log('Error in config command:', { message: error.message, stack: error.stack });
    }
  });

program
  .command('query <text>')
  .description('Query the RAG system')
  .option('--ctx', 'Only return context without LLM completion')
  .action(async (text, options) => {
    try {
      console.log('cli/index.js query command', { text, options });
      const config = loadConfig();
      const response = await axios.post(`${config.API_URL}/api/query${options.ctx ? '?onlyContext=true' : ''}`, {
        query: text
      }, {
        headers: {
          'Authorization': `Bearer ${config.API_KEY}`
        }
      });
      
      if (options.ctx) {
        console.log('\nAnswer:','\n', response.data);
      } else {
        // Display answer and sources as before
        console.log('\nAnswer:', response.data.answer);
        console.log('\nSources:');
        response.data.sources.forEach(source => {
          console.log(`- ${source.fileName} (${source.namespace})`);
          console.log(`  Context: ${source.context}`);
        });
      }
    } catch (error) {
      if (error.isAxiosError) {
        console.log('Error in query command:', { 
          message: error.message, 
          stack: error.stack,
          data: error.response?.data 
        });
      } else {
        console.log('Error in query command:', { message: error.message, stack: error.stack });
      }
    }
  });

program.parse();
