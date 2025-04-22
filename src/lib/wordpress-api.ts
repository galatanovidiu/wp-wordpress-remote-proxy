/**
 * External dependencies
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WordPressRequestParams, WordPressResponse } from './types.js';

/**
 * WordPress API request function with basic auth support
 *
 * @param {Object} params - Query parameters for the request
 * @return {Promise<any>} API response as JSON
 */
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const LOG_FILE = process.env.LOG_FILE || path.join(LOG_DIR, 'mcp-proxy.log');

// Ensure log directory exists if logging to file is enabled
if (process.env.LOG_FILE || process.env.LOG_DIR) {
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}\n`;

  // Log to file only if LOG_FILE or LOG_DIR is provided
  if (process.env.LOG_FILE || process.env.LOG_DIR) {
    fs.appendFileSync(LOG_FILE, logMessage);
  }

  // Also log to console for development
  if (process.env.NODE_ENV !== 'production') {
    console.log(logMessage);
  }
}

function validateEnvironment() {
  const requiredEnvVars = ['WP_API_URL', 'WP_API_USERNAME', 'WP_API_PASSWORD'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(
        ', '
      )}. Please set these variables before starting the server.`
    );
  }
}

export async function wpRequest(
  params: WordPressRequestParams = { method: 'init' }
): Promise<WordPressResponse> {
  // Validate environment variables first
  validateEnvironment();

  const endpoint = 'wp/v2/wpmcp';
  const method = 'POST';
  const baseUrl = process.env.WP_API_URL!;
  const username = process.env.WP_API_USERNAME!;
  const password = process.env.WP_API_PASSWORD!;

  log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  log(`API URL: ${baseUrl}`);

  // Prepare authorization header
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  // Build URL with query params for GET requests
  const url = new URL(`/wp-json/${endpoint}`, baseUrl).toString();
  log(`Requesting URL: ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
    body: JSON.stringify(params),
  };

  try {
    const response = await fetch(url, fetchOptions);

    // Handle error responses
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WordPress API error (${response.status}): ${errorText}`);
    }

    return (await response.json()) as WordPressResponse;
  } catch (error) {
    log(`Error in wpRequest: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
