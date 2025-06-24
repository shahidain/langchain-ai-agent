import express from 'express';
import cors from 'cors';
import path from 'path';
import { Agent } from './agent/langchain-agent';
import { SERVER_CONFIG, validateEnvironment } from './utils/config';

// Validate environment variables
validateEnvironment();

const app = express();
const PORT = SERVER_CONFIG.port;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from examples directory
app.use('/static', express.static(path.join(__dirname, '..', 'examples')));

// Initialize the AI Agent
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
    const { message, systemPrompt } = req.body;

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

    let response: string;

    // Use custom prompt if provided, otherwise use default
    if (systemPrompt && typeof systemPrompt === 'string') {
      response = await agent.processWithCustomPrompt(message, systemPrompt);
    } else {
      response = await agent.processQuery(message);
    }

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
        info: 'GET /agent/info'
      }
    });
  } catch (error) {
    console.error('Agent info error:', error);
    res.status(500).json({
      error: 'Failed to get agent information'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'POST /chat',
      'GET /agent/info'
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
app.listen(PORT, () => {
  console.log(`🚀 LangChain AI Agent server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/chat`);
  console.log(`ℹ️  Agent info: http://localhost:${PORT}/agent/info`);
  console.log(`🌐 Web client: http://localhost:${PORT}/static/chat-client.html`);
  console.log(`📁 Static files: http://localhost:${PORT}/static/`);
  console.log('\n📝 Example curl request:');
  console.log(`curl -X POST http://localhost:${PORT}/chat \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"message": "Hello, how are you?"}\'');
});

export default app;
