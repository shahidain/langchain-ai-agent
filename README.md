# LangChain AI Agent - Express Server

A minimal, production-ready LangChain-based AI Agent built with TypeScript and Express server, featuring a REST API for chat interactions.

## Features

- 🤖 **AI Agent**: Clean, minimal implementation using LangChain
- 🌐 **Express Server**: RESTful API with chat endpoint
- 🔧 **TypeScript Support**: Fully typed with modern TypeScript
- ⚡ **OpenAI Integration**: Uses OpenAI's GPT models via LangChain
- 🛡️ **Error Handling**: Robust error handling and validation
- 🎨 **Web Client**: Beautiful HTML interface for testing
- � **Static Files**: Serves CSS, JS, and HTML files via Express
- �📦 **Ready to Deploy**: Production-ready structure
- 🔗 **CORS Enabled**: Cross-origin requests supported

## API Endpoints

- `GET /health` - Health check and agent status
- `POST /chat` - Chat with the AI agent
- `GET /agent/info` - Get agent information
- `GET /static/*` - Serve static files (HTML, CSS, JS)

## Web Interface

The server includes a built-in web interface accessible at:
- **Chat Interface**: `http://localhost:3000/static/chat-client.html`
- **CSS Styles**: `http://localhost:3000/static/style.css`

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- OpenAI API Key

## Installation

1. **Clone or download the project**
   ```bash
   cd langchain-ai-agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env` file and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=3000
   ```

## Usage

### Development Mode (Recommended)
```bash
npm run dev
```
The server will start at `http://localhost:3000`

### Production Build
```bash
npm run build
npm start
```

### Clean Build
```bash
npm run clean
```

## Testing the API

### 1. Using the Web Client

**Option A: Via Static Server (Recommended)**
With the server running, visit: `http://localhost:3000/static/chat-client.html`

**Option B: Direct File**
Open `examples/chat-client.html` in your browser for a beautiful chat interface.

### 2. Using curl
```bash
# Simple chat
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is TypeScript?"}'

# Chat with custom system prompt
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Explain recursion", 
    "systemPrompt": "You are a programming tutor. Use simple examples."
  }'

# Health check
curl http://localhost:3000/health

# Agent info
curl http://localhost:3000/agent/info
```

### 3. Using the Test Client
```bash
# Run the automated test client
npx ts-node examples/test-client.ts
```

## Project Structure

```
src/
├── agent/
│   └── langchain-agent.ts   # Main AI Agent class
├── utils/
│   └── config.ts           # Configuration and utilities
└── server.ts               # Express server with API endpoints

examples/
├── chat-client.html        # Web-based chat interface
├── style.css              # Styles for web interface
└── test-client.ts          # Automated API test client
```

## API Reference

### POST /chat
Chat with the AI agent.

**Request Body:**
```json
{
  "message": "Your question here",
  "systemPrompt": "Optional custom system prompt"
}
```

**Response:**
```json
{
  "message": "Your question here", 
  "response": "AI agent's response",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "model": {
    "model": "gpt-3.5-turbo",
    "temperature": 0.7
  }
}
```

### GET /health
Check server and agent status.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z", 
  "agent": {
    "model": "gpt-3.5-turbo",
    "temperature": 0.7
  }
}
```

### GET /agent/info
Get detailed agent information.

**Response:**
```json
{
  "agent": "LangChain AI Agent",
  "version": "1.0.0",
  "model": "gpt-3.5-turbo",
  "temperature": 0.7,
  "endpoints": {
    "chat": "POST /chat",
    "health": "GET /health", 
    "info": "GET /agent/info"
  }
}
```

## Configuration

You can customize the agent behavior by modifying the configuration in `src/utils/config.ts`:

- **Model**: Change the OpenAI model (default: gpt-3.5-turbo)
- **Temperature**: Adjust creativity (0.0 - 1.0)
- **Max Tokens**: Set response length limit

## Extending the Agent

### Adding New Methods
1. Add methods to the `AIAgent` class
2. Create new prompt templates for specific use cases
3. Implement error handling

### Adding New Tools
1. Install LangChain tool packages
2. Integrate tools in the agent workflow
3. Update the chain composition

### Adding Memory
```typescript
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';

// Add memory to your agent
const memory = new BufferMemory();
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes | - |
| `PORT` | Server port number | No | 3000 |

## Scripts

- `npm run dev` - Run server in development mode with ts-node
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run the built server application
- `npm run clean` - Clean the build directory

## Dependencies

### Core Dependencies
- **langchain**: LangChain framework
- **@langchain/openai**: OpenAI integration
- **@langchain/core**: Core LangChain utilities
- **express**: Web application framework
- **cors**: Cross-Origin Resource Sharing middleware
- **dotenv**: Environment variable management

### Development Dependencies
- **typescript**: TypeScript compiler
- **ts-node**: TypeScript execution
- **@types/node**: Node.js type definitions
- **@types/express**: Express type definitions
- **@types/cors**: CORS type definitions
- **rimraf**: Cross-platform file removal

## Error Handling

The agent includes comprehensive error handling:
- API key validation
- Network error handling
- Invalid query handling
- Graceful degradation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project for your own applications.

## Next Steps

- [ ] Add conversation memory/history
- [ ] Implement streaming responses
- [ ] Add authentication middleware
- [ ] Create WebSocket support for real-time chat
- [ ] Add rate limiting
- [ ] Implement caching layer
- [ ] Add more LLM providers (Anthropic, Google, etc.)
- [ ] Create Docker setup
- [ ] Add automated tests
- [ ] Implement agent planning capabilities
- [ ] Add vector store integration
- [ ] Create admin dashboard

## Deployment

### Using Docker (Coming Soon)
```bash
# Build image
docker build -t langchain-agent .

# Run container
docker run -p 3000:3000 --env-file .env langchain-agent
```

### Using PM2
```bash
npm install -g pm2
npm run build
pm2 start dist/server.js --name "langchain-agent"
```

## Troubleshooting

### Common Issues

1. **"Cannot find module" errors**
   ```bash
   npm install
   ```

2. **"OPENAI_API_KEY is required" error**
   - Make sure your `.env` file has the correct API key
   - Verify the `.env` file is in the project root

3. **Server not starting**
   - Check if port 3000 is available
   - Try changing the PORT in `.env`

4. **CORS errors in browser**
   - The server includes CORS middleware
   - Make sure you're making requests to the correct URL

### Debug Mode
Set `NODE_ENV=development` in your `.env` for detailed error messages.

## Support

If you encounter any issues or have questions, please create an issue in the repository.
