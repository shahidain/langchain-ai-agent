import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

/**
 * Configuration interface for the AI Agent
 */
export interface AgentConfig {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

/**
 * Default configuration values from environment variables
 */
export const DEFAULT_CONFIG: Required<AgentConfig> = {
  modelName: process.env.MODEL_NAME || 'gpt-3.5-turbo',
  temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
  maxTokens: parseInt(process.env.MAX_TOKENS || '1000', 10),
  apiKey: process.env.OPENAI_API_KEY || ''
};

/**
 * Server configuration
 */
export const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10)
};

/**
 * MCP configuration
 */
export const MCP_CONFIG = {
  url: process.env.MCP_URL || 'http://localhost:8000'
};

/**
 * Validate that required environment variables are set
 */
export function validateEnvironment(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  // Validate numeric values
  if (isNaN(DEFAULT_CONFIG.temperature) || DEFAULT_CONFIG.temperature < 0 || DEFAULT_CONFIG.temperature > 2) {
    throw new Error('TEMPERATURE must be a number between 0 and 2');
  }

  if (isNaN(DEFAULT_CONFIG.maxTokens) || DEFAULT_CONFIG.maxTokens < 1) {
    throw new Error('MAX_TOKENS must be a positive number');
  }

  if (isNaN(SERVER_CONFIG.port) || SERVER_CONFIG.port < 1 || SERVER_CONFIG.port > 65535) {
    throw new Error('PORT must be a valid port number (1-65535)');
  }
}

/**
 * Helper function to format responses
 */
export function formatResponse(response: string, query: string): string {
  return `Query: "${query}"\nResponse: ${response}\n`;
}
