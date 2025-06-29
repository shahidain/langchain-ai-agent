import express from 'express';
import cors from 'cors';
import path from 'path';
import { Agent } from './agent/langchain-agent';
import { SERVER_CONFIG, MCP_CONFIG, validateEnvironment } from './utils/config';
import { initializeMCPClient, getMCPClient } from './mcp/mcp-client';

// Validate environment variables
validateEnvironment();

// Initialize MCP Client
initializeMCPClient(MCP_CONFIG.url);

const app = express();
const PORT = SERVER_CONFIG.port;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from examples directory
app.use('/static', express.static(path.join(__dirname, '..', 'examples')));

// Initialize the LangChain AI Agent
const agent = new Agent();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    agent: agent.getModelInfo()
  });
});

// Chat endpoint
app.post('/chat', async(req, res) => {
  try {
    const { message } = req.body;

    // Validate request
    if (!message) {
      return res.status(400).json({
        error: 'Message is required',
        example: { message: 'Hello, how are you?' }
      });
    }

    if (typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message must be a string'
      });
    }

    let response: string | null;
    response = await agent.processQuery(message);

    res.json({
      message: message,
      response: response,
      timestamp: new Date().toISOString(),
      model: agent.getModelInfo()
    });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Get agent info endpoint
app.get('/agent/info', (req, res) => {
  try {
    const modelInfo = agent.getModelInfo();
    res.json({
      agent: 'LangChain AI Agent',
      version: '1.0.0',
      ...modelInfo,
      endpoints: {
        chat: 'POST /chat',
        health: 'GET /health',
        info: 'GET /agent/info',
        sse: 'GET /sse',
        mcpStatus: 'GET /mcp/status'
      }
    });
  } catch (error) {
    console.error('Agent info error:', error);
    res.status(500).json({
      error: 'Failed to get agent information'
    });
  }
});

// SSE endpoint for MCP connection
app.get('/sse', (req, res) => {
  try {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write('data: {"type": "connected", "message": "SSE connection established"}\n\n');

    // Get MCP client and connection info
    const client = getMCPClient();
    if (!client) {
      res.write('data: {"type": "error", "message": "MCP client not initialized"}\n\n');
      res.end();
      return;
    }

    // Send MCP connection status
    const connectionInfo = client.getConnectionInfo();
    res.write(`data: ${JSON.stringify({ type: 'mcp-status', ...connectionInfo })}\n\n`);

    // Try to connect to MCP if not already connected
    if (!client.isConnectedToMCP()) {
      client.connect()
        .then(() => {
          res.write('data: {"type": "mcp-connected", "message": "Connected to MCP server"}\n\n');
          const sessionId = client.getSessionId();
          if (sessionId) {
            res.write(`data: {"type": "session-established", "sessionId": "${sessionId}"}\n\n`);
          }
        })
        .catch((error) => {
          res.write(`data: {"type": "mcp-error", "message": "${error.message}"}\n\n`);
        });
    } else {
      const sessionId = client.getSessionId();
      if (sessionId) {
        res.write(`data: {"type": "session-available", "sessionId": "${sessionId}"}\n\n`);
      }
    }

    // Handle client disconnect
    req.on('close', () => {
      console.log('📡 SSE client disconnected');
    });

    // Keep connection alive with periodic ping
    const keepAlive = setInterval(() => {
      res.write('data: {"type": "ping"}\n\n');
    }, 30000); // 30 seconds

    req.on('close', () => {
      clearInterval(keepAlive);
    });

  } catch (error) {
    console.error('SSE endpoint error:', error);
    res.status(500).json({
      error: 'Failed to establish SSE connection',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// MCP status endpoint
app.get('/mcp/status', (req, res) => {
  try {
    const client = getMCPClient();
    if (!client) {
      return res.status(503).json({
        error: 'MCP client not initialized'
      });
    }    const connectionInfo = client.getConnectionInfo();
    const availableTools = client.getAvailableTools();

    res.json({
      mcp: connectionInfo,
      tools: {
        count: availableTools.length,
        list: availableTools
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('MCP status error:', error);
    res.status(500).json({
      error: 'Failed to get MCP status'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',    availableEndpoints: [
      'GET /health',
      'POST /chat',
      'GET /agent/info',
      'GET /sse',
      'GET /mcp/status'
    ]
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, async() => {
  console.log(`🚀 LangChain AI Agent server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/chat`);
  console.log(`ℹ️  Agent info: http://localhost:${PORT}/agent/info`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`🔧 MCP status: http://localhost:${PORT}/mcp/status`);
  console.log(`🌐 Web client: http://localhost:${PORT}/static/chat-client.html`);
  console.log(`📁 Static files: http://localhost:${PORT}/static/`);
  console.log(`\n🔌 MCP Server: ${MCP_CONFIG.url}`);

  // Connect to MCP server
  const mcpClient = getMCPClient();
  if (mcpClient) {
    try {
      console.log('🔄 Attempting to connect to MCP server...');
      await mcpClient.connect();
      console.log('✅ MCP connection established successfully!');
    } catch (error) {
      console.warn(`⚠️ MCP connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`📝 This is normal if no MCP server is running at ${MCP_CONFIG.url}`);
    }
  }

  console.log('\n📝 Example curl request:');
  console.log(`curl -X POST http://localhost:${PORT}/chat \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"message": "Hello, how are you?"}\'');
});

export default app;
