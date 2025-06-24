import EventSource from 'eventsource';
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

  constructor(mcpUrl: string) {
    this.mcpUrl = mcpUrl;
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
      const message: MCPMessage = JSON.parse(data);

      // Validate message format
      if (!this.isValidMCPMessage(message)) {
        console.warn('⚠️ Invalid MCP message format:', message);
        return;
      }

      // Extract and store sessionId from the first message
      if (!this.sessionId && message.params.sessionId) {
        this.sessionId = message.params.sessionId;
        console.log(`🔑 Session ID established: ${this.sessionId}`);
      }

      console.log('📨 MCP message received:', {
        method: message.method,
        toolName: message.params.name,
        sessionId: message.params.sessionId,
        messageId: message.id
      });

      // Process the tool call
      this.processToolCall(message);

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
   * Process tool call from MCP server
   */
  private processToolCall(message: MCPMessage): void {
    // This method can be extended to handle specific tool calls
    console.log(`🔧 Processing tool call: ${message.params.name}`);
    console.log('📋 Arguments:', message.params.arguments);
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
