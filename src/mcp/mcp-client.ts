import EventSource from 'eventsource';
import axios from 'axios';
import { MCPToolsManager, MCPTool } from './tools';
/**
 * MCP Message interface based on JSON-RPC 2.0
 */
export interface MCPMessage {
  jsonrpc: '2.0';
  method: 'tools/call';
  params: {
    name: string;
    arguments: object;
    sessionId: string;
  };
  id: string;
}

/**
 * MCP Client for handling Server-Sent Events connection
 */
export class MCPClient {
  private eventSource: any | null = null;
  private sessionId: string | null = null;
  private mcpUrl: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private toolsManager: MCPToolsManager;
  private availableTools: MCPTool[] = [];
  // Request correlation map for SSE responses
  private pendingRequests: Map<string, {
    resolve: (_value: any) => void;
    reject: (_reason?: any) => void;
    timestamp: number;
  }> = new Map();

  constructor(mcpUrl: string) {
    this.mcpUrl = mcpUrl;
    this.toolsManager = new MCPToolsManager(mcpUrl);
  }

  /**
   * Establish SSE connection to MCP server
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`🔌 Connecting to MCP server at: ${this.mcpUrl}/sse`);
        this.eventSource = new EventSource (`${this.mcpUrl}/sse`);

        if (this.eventSource) {
          this.eventSource.onopen = () => {
            console.log('✅ MCP SSE connection established');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            resolve();
          };
          this.eventSource.onmessage = (event: any) => {
            this.handleMessage(event.data);
          };

          this.eventSource.onerror = (error: any) => {
            console.error('❌ MCP SSE connection error:', error);
            this.isConnected = false;

            // Reset session ID on disconnection for fresh session on reconnect
            if (this.sessionId) {
              console.log(`🔄 Resetting session ID (${this.sessionId}) due to disconnection`);
              this.sessionId = null;
            }
          };
        } else {
          reject(new Error('Failed to create EventSource'));
        }

      } catch (error) {
        console.error('❌ Failed to establish MCP connection:', error);
        reject(error);
      }
    });
  }
  /**
   * Handle incoming SSE messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Check if this is a response to one of our requests
      if (message.id && this.pendingRequests.has(message.id)) {
        const pendingRequest = this.pendingRequests.get(message.id);
        if (pendingRequest) {
          this.pendingRequests.delete(message.id);
          if (message.error) {
            pendingRequest.reject(new Error(`MCP Error: ${message.error.message}`));
          } else {
            pendingRequest.resolve(message);
          }
        }
        return;
      }

      // Handle incoming tool calls from MCP server
      if (this.isValidMCPMessage(message)) {
        // Extract and store sessionId from the first message
        if (!this.sessionId && message.params.sessionId) {
          this.sessionId = message.params.sessionId;
          console.log(`🔑 Session ID established: ${this.sessionId}`);
          // Automatically fetch available tools when session is established
          this.fetchToolsAfterSessionEstablished();
        }
      } else {
        console.warn('⚠️ Unknown MCP message format:', message);
      }

    } catch (error) {
      console.error('❌ Error processing MCP message:', error);
    }
  }

  /**
   * Validate MCP message format
   */
  private isValidMCPMessage(message: any): message is MCPMessage {
    return (
      message &&
      message.jsonrpc === '2.0' &&
      message.method === 'tools/call' &&
      message.params &&
      typeof message.params.name === 'string' &&
      typeof message.params.sessionId === 'string' &&
      typeof message.id === 'string'
    );
  }

  /**
   * Automatically fetch tools after session is established
   */  private async fetchToolsAfterSessionEstablished(): Promise<void> {
    try {
      console.log('🔍 Fetching available tools after session establishment...');
      this.availableTools = await this.toolsManager.fetchAvailableTools(true);
      console.log(`✅ Successfully fetched ${this.availableTools.length} tools from MCP server`);

      // Log available tools for debugging
      if (this.availableTools.length > 0) {
        this.availableTools.forEach(tool => {
          console.log(`  🔧 Available tool: ${tool.name} - ${tool.description}`);
        });
      } else {
        console.log('  ℹ️ No tools available from MCP server');
      }
    } catch (error) {
      console.error('❌ Failed to fetch tools after session establishment:', error);
      console.error('  📝 This may indicate an issue with the MCP server or network connectivity');
      // Don't throw the error - let the connection continue even if tools fetch fails
    }
  }

  /**
   * Disconnect from MCP server
   */
  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.sessionId = null; // Reset session ID on manual disconnection
      console.log('🔌 Disconnected from MCP server');
    }
  }

  /**
   * Get current session ID
   */
  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if connected to MCP server
   */
  public isConnectedToMCP(): boolean {
    return this.isConnected && this.eventSource !== null;
  }

  /**
   * Get available tools from cache
   */
  public getAvailableTools(): MCPTool[] {
    return this.availableTools;
  }

  /**
   * Call a tool using the tools manager
   */
  public async callTool(toolName: string, toolArguments: object = {}): Promise<any> {
    if (!this.sessionId) {
      throw new Error('MCP session not established. Cannot call tools.');
    }
    return await this.toolsManager.callTool(toolName, toolArguments);
  }

  /**
   * Refresh available tools from MCP server
   */
  public async refreshTools(): Promise<MCPTool[]> {
    if (!this.sessionId) {
      throw new Error('MCP session not established. Cannot refresh tools.');
    }
    try {
      this.availableTools = await this.toolsManager.fetchAvailableTools(true);
      return this.availableTools;
    } catch (error) {
      console.error('❌ Failed to refresh tools:', error);
      throw error;
    }
  }

  /**
   * Get connection status info
   */
  public getConnectionInfo(): object {
    return {
      connected: this.isConnected,
      sessionId: this.sessionId,
      mcpUrl: this.mcpUrl,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send tools list request via SSE and wait for response
   */
  public async sendToolsListRequest(): Promise<MCPTool[]> {
    if (!this.sessionId) {
      throw new Error('MCP session not established');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      const timeout = 30000; // 30 seconds timeout

      // Store the promise resolvers
      this.pendingRequests.set(requestId, {
        resolve: (response: any) => {
          if (response.result && response.result.tools) {
            resolve(response.result.tools);
          } else {
            reject(new Error('Invalid tools list response'));
          }
        },
        reject,
        timestamp: Date.now()
      });

      // Prepare the request
      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {
          sessionId: this.sessionId
        },
        id: requestId
      };

      // Send request via HTTP to /messages endpoint
      this.sendMessageToMCP(request)
        .catch((error) => {
          this.pendingRequests.delete(requestId);
          reject(error);
        });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Tools list request timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Send tool call request via SSE and wait for response
   */
  public async sendToolCallRequest(toolName: string, toolArguments: object): Promise<any> {
    if (!this.sessionId) {
      throw new Error('MCP session not established');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      const timeout = 60000; // 60 seconds timeout for tool calls

      // Store the promise resolvers
      this.pendingRequests.set(requestId, {
        resolve: (response: any) => {
          if (response.error) {
            reject(new Error(`Tool call error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        },
        reject,
        timestamp: Date.now()
      });

      // Prepare the request
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArguments,
          sessionId: this.sessionId
        },
        id: requestId
      };

      // Send request via HTTP to /messages endpoint
      this.sendMessageToMCP(request)
        .catch((error) => {
          this.pendingRequests.delete(requestId);
          reject(error);
        });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Tool call request timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }
  /**
   * Send message to MCP server via HTTP
   */
  private async sendMessageToMCP(message: object): Promise<void> {
    try {
      await axios.post(`${this.mcpUrl}/messages`, message, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('❌ Failed to send MCP message:', error);
      throw error;
    }
  }
}

// Global MCP client instance
export let mcpClient: MCPClient | null = null;

/**
 * Initialize MCP client with URL from environment
 */
export function initializeMCPClient(mcpUrl: string): MCPClient {
  console.log(`🌐 Initializing MCP client with URL: ${mcpUrl}`);
  if (!mcpClient) {
    mcpClient = new MCPClient(mcpUrl);
  }
  return mcpClient;
}

/**
 * Get the global MCP client instance
 */
export function getMCPClient(): MCPClient | null {
  return mcpClient;
}
