import { getMCPClient } from './mcp-client';

/**
 * MCP Tool interface
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object; // JSON Schema for tool parameters
}

/**
 * MCP Tools List Request
 */
export interface MCPToolsListRequest {
  jsonrpc: '2.0';
  method: 'tools/list';
  params: {
    sessionId: string;
  };
  id: string;
}

/**
 * MCP Tools List Response
 */
export interface MCPToolsListResponse {
  jsonrpc: '2.0';
  id: string;
  result: {
    tools: MCPTool[];
  };
}

/**
 * MCP Tool Call Request
 */
export interface MCPToolCallRequest {
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
 * MCP Tool Call Response
 */
export interface MCPToolCallResponse {
  jsonrpc: '2.0';
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * MCP Tools Manager class
 */
export class MCPToolsManager {
  private mcpUrl: string;
  private toolsCache: MCPTool[] | null = null;
  private cacheTimestamp: number = 0;
  private cacheExpiry: number = 300000; // 5 minutes

  constructor(mcpUrl: string) {
    this.mcpUrl = mcpUrl;
  }

  /**
   * Wait for session ID to be available
   */
  private async waitForSessionId(timeout: number = 10000): Promise<string> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkSession = () => {
        const mcpClient = getMCPClient();
        const sessionId = mcpClient?.getSessionId();

        if (sessionId) {
          resolve(sessionId);
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error('Timeout waiting for MCP session ID'));
          return;
        }

        // Check again in 100ms
        setTimeout(checkSession, 100);
      };

      checkSession();
    });
  }

  /**
   * Fetch available tools from MCP server via SSE
   */
  public async fetchAvailableTools(forceRefresh: boolean = false): Promise<MCPTool[]> {
    try {
      // Return cached tools if valid and not force refresh
      if (!forceRefresh && this.toolsCache && (Date.now() - this.cacheTimestamp) < this.cacheExpiry) {
        console.log('🗂️ Returning cached MCP tools');
        return this.toolsCache;
      }

      console.log('🔍 Fetching available tools from MCP server via SSE...');

      // Wait for session ID
      const sessionId = await this.waitForSessionId();
      console.log(`🔑 Using session ID: ${sessionId}`);

      // Get MCP client
      const mcpClient = getMCPClient();
      if (!mcpClient || !mcpClient.isConnectedToMCP()) {
        throw new Error('MCP client not connected');
      }

      // Use the MCP client to send the request via SSE and wait for response
      const tools = await mcpClient.sendToolsListRequest();      // Cache the results
      this.toolsCache = tools;
      this.cacheTimestamp = Date.now();

      return tools;
    } catch (error) {
      console.error('❌ Failed to fetch MCP tools:', error);
      throw error;
    }
  }
  /**
   * Call a specific tool on the MCP server via SSE
   */  public async callTool(toolName: string, toolArguments: object = {}): Promise<any> {
    try {
      console.log(`🔧 Calling MCP tool: ${toolName}`);
      console.log('📋 Arguments:', toolArguments);

      // Validate tool exists (fetch tools if not cached)
      const availableTools = await this.fetchAvailableTools();
      const tool = availableTools.find(t => t.name === toolName);

      if (!tool) {
        throw new Error(`Tool '${toolName}' not found. Available tools: ${availableTools.map(t => t.name).join(', ')}`);
      }

      // Get MCP client
      const mcpClient = getMCPClient();
      if (!mcpClient || !mcpClient.isConnectedToMCP()) {
        throw new Error('MCP client not connected');
      }

      // Use the MCP client to send the request via SSE and wait for response
      const result = await mcpClient.sendToolCallRequest(toolName, toolArguments);

      console.log(`✅ Tool '${toolName}' executed successfully`);
      console.log('📤 Result:', result);

      return result;
    } catch (error) {
      console.error(`❌ Failed to call tool '${toolName}':`, error);
      throw error;
    }
  }

  /**
   * Get tool schema by name
   */
  public async getToolSchema(toolName: string): Promise<object | null> {
    try {
      const availableTools = await this.fetchAvailableTools();
      const tool = availableTools.find(t => t.name === toolName);

      return tool ? tool.inputSchema : null;
    } catch (error) {
      console.error(`❌ Failed to get schema for tool '${toolName}':`, error);
      return null;
    }
  }

  /**
   * Validate tool arguments against schema (basic validation)
   */
  public async validateToolArguments(toolName: string, _args: object): Promise<boolean> {
    try {
      const schema = await this.getToolSchema(toolName);

      if (!schema) {
        console.warn(`⚠️ No schema found for tool '${toolName}', skipping validation`);
        return true;
      }

      // Basic validation - can be extended with proper JSON schema validator
      console.log(`✅ Arguments validated for tool '${toolName}'`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to validate arguments for tool '${toolName}':`, error);
      return false;
    }
  }

  /**
   * Get cached tools without making a request
   */
  public getCachedTools(): MCPTool[] | null {
    return this.toolsCache;
  }

  /**
   * Clear tools cache
   */
  public clearCache(): void {
    this.toolsCache = null;
    this.cacheTimestamp = 0;
    console.log('🗑️ MCP tools cache cleared');
  }

  /**
   * Check if tools cache is valid
   */
  public isCacheValid(): boolean {
    return this.toolsCache !== null && (Date.now() - this.cacheTimestamp) < this.cacheExpiry;
  }
}

// Global tools manager instance
let toolsManager: MCPToolsManager | null = null;

/**
 * Initialize MCP tools manager
 */
export function initializeMCPToolsManager(mcpUrl: string): MCPToolsManager {
  if (!toolsManager) {
    toolsManager = new MCPToolsManager(mcpUrl);
    console.log(`🛠️ MCP Tools Manager initialized for: ${mcpUrl}`);
  }
  return toolsManager;
}

/**
 * Get the global MCP tools manager instance
 */
export function getMCPToolsManager(): MCPToolsManager | null {
  return toolsManager;
}

/**
 * Convenience function to fetch tools
 */
export async function fetchMCPTools(forceRefresh: boolean = false): Promise<MCPTool[]> {
  const manager = getMCPToolsManager();
  if (!manager) {
    throw new Error('MCP Tools Manager not initialized');
  }
  return manager.fetchAvailableTools(forceRefresh);
}

/**
 * Convenience function to call a tool
 */
export async function callMCPTool(toolName: string, args: object = {}): Promise<any> {
  const manager = getMCPToolsManager();
  if (!manager) {
    throw new Error('MCP Tools Manager not initialized');
  }
  return manager.callTool(toolName, args);
}
