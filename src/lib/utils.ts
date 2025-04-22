import { EventEmitter } from 'events';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHash } from 'crypto';
import { createServer } from 'http';
import { log as consoleLog } from 'console';
import { WordPressRequestParams, WordPressResponse } from './types.js';

// Version of the package
export const MCP_WORDPRESS_REMOTE_VERSION = '1.0.0';

/**
 * Log a message to the console
 */
export function log(message: string, ...args: any[]): void {
  consoleLog(message, ...args);
}

/**
 * Set up signal handlers for cleanup
 */
export function setupSignalHandlers(cleanup: () => Promise<void>): void {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  signals.forEach(signal => {
    process.on(signal, async () => {
      log(`\nReceived ${signal}, cleaning up...`);
      await cleanup();
      process.exit(0);
    });
  });
}

/**
 * Get a hash of the server URL for use in file paths
 */
export function getServerUrlHash(serverUrl: string): string {
  return createHash('sha256').update(serverUrl).digest('hex').substring(0, 8);
}

/**
 * Create a simple HTTP server for coordination
 */
export function createCoordinatorServer(port: number): { server: any; port: number } {
  const server = createServer();
  server.listen(port, () => {
    log(`Coordinator server listening on port ${port}`);
  });

  return { server, port };
}

/**
 * Connect to a remote MCP server
 */
export async function connectToRemoteServer(
  serverUrl: string,
  headers: Record<string, string>
): Promise<SSEClientTransport> {
  const url = new URL(serverUrl);
  const transport = new SSEClientTransport(url, { requestInit: { headers } });

  // Set up message and error handlers
  transport.onmessage = message => {
    log('Received message:', JSON.stringify(message, null, 2));
  };

  transport.onerror = error => {
    log('Transport error:', error);
  };

  transport.onclose = () => {
    log('Connection closed.');
  };

  return transport;
}

interface ProxyConfig {
  transportToClient: StdioServerTransport;
  wpRequest: (params: WordPressRequestParams) => Promise<WordPressResponse>;
}

export function mcpProxy({ transportToClient, wpRequest }: ProxyConfig) {
  // Handle incoming messages from the client
  transportToClient.onmessage = async (message: any) => {
    try {
      // Check if this is a request message
      if (message.method) {
        // Forward the request to WordPress API
        const response = await wpRequest({
          method: message.method,
          ...message.params,
        });

        // Send the response back to the client
        transportToClient.send({
          jsonrpc: '2.0',
          id: message.id,
          result: response,
        });
      }
    } catch (error) {
      // Handle errors and send error response to client
      transportToClient.send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };
}
