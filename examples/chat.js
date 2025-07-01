const SERVER_URL = 'http://localhost:3000';

// Utility function to escape HTML for security
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Check server status on page load
window.onload = function() {
  checkServerStatus();
  checkMCPStatus();
  
  // Set up periodic MCP status refresh every 10 seconds
  setInterval(checkMCPStatus, 10000);
};

async function checkServerStatus() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const data = await response.json();
    
    const statusDiv = document.getElementById('status');
    if (response.ok) {
      statusDiv.className = 'status online';
      statusDiv.textContent = `✅ Server Online - Model: ${data.agent.model}`;
    } else {
      throw new Error('Server not responding properly');
    }
  } catch (error) {
    const statusDiv = document.getElementById('status');
    statusDiv.className = 'status offline';
    statusDiv.textContent = '❌ Server Offline - Make sure to run: npm run dev';
  }
}

async function checkMCPStatus() {
  try {
    const response = await fetch(`${SERVER_URL}/mcp/status`);
    const data = await response.json();
    
    const mcpStatusDiv = document.getElementById('mcp-status');
    const mcpSessionDiv = document.getElementById('mcp-session');
    
    if (response.ok && data.mcp) {
      // Update connection status
      if (data.mcp.connected) {
        mcpStatusDiv.className = 'status online';
        mcpStatusDiv.textContent = `✅ MCP Connected - URL: ${data.mcp.mcpUrl}`;
      } else {
        mcpStatusDiv.className = 'status offline';
        mcpStatusDiv.textContent = `❌ MCP Disconnected - URL: ${data.mcp.mcpUrl}`;
      }
      
      // Update session ID
      if (data.mcp.sessionId) {
        mcpSessionDiv.className = 'status online';
        mcpSessionDiv.innerHTML = `<strong>Session ID:</strong> <code>${data.mcp.sessionId}</code>`;
      } else {
        mcpSessionDiv.className = 'status offline';
        mcpSessionDiv.textContent = 'No Session ID available';
      }
      
      // Show reconnection attempts if any
      if (data.mcp.reconnectAttempts > 0) {
        mcpStatusDiv.textContent += ` (${data.mcp.reconnectAttempts} reconnect attempts)`;
      }
    } else {
      throw new Error(data.error || 'Failed to get MCP status');
    }
  } catch (error) {
    const mcpStatusDiv = document.getElementById('mcp-status');
    const mcpSessionDiv = document.getElementById('mcp-session');
    
    mcpStatusDiv.className = 'status offline';
    mcpStatusDiv.textContent = '❌ MCP Status Error - Check server logs';
    
    mcpSessionDiv.className = 'status offline';
    mcpSessionDiv.textContent = 'Session ID unavailable';
    
    console.error('MCP Status Error:', error);
  }
}

async function sendMessage() {
  const messageInput = document.getElementById('message');
  const systemPromptInput = document.getElementById('systemPrompt');
  const sendBtn = document.getElementById('sendBtn');
  const responseDiv = document.getElementById('response');
  const responseText = document.getElementById('responseText');
  
  const message = messageInput.value.trim();
  
  if (!message) {
    alert('Please enter a message');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  responseDiv.classList.add('show');
  responseDiv.className = 'response show';
  responseText.innerHTML = '<div class="loading">🤔 Thinking...</div>';
  
  try {
    const requestBody = { message };
    const response = await fetch(`${SERVER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Parse the AI response as markdown
      const parsedResponse = marked.parse(data.response);
      
      responseText.innerHTML = `
        <strong>Your Question:</strong><br>
        ${escapeHtml(data.message)}<br><br>
        <strong>AI Response:</strong><br>
        <div class="markdown-content">${parsedResponse}</div>
      `;
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    responseDiv.className = 'response show error';
    responseText.innerHTML = `
      <strong>Error:</strong><br>
      ${error.message}<br><br>
      <strong>Troubleshooting:</strong><br>
      • Make sure the server is running with: <code>npm run dev</code><br>
      • Check that your OPENAI_API_KEY is set in the .env file<br>
      • Verify the server is accessible at ${SERVER_URL}
    `;
  } finally {
    // Reset button state
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Message';
  }
}

async function sendStreamingMessage() {
  const messageInput = document.getElementById('message');
  const streamBtn = document.getElementById('streamBtn');
  const responseDiv = document.getElementById('response');
  const responseText = document.getElementById('responseText');
  const streamingStatus = document.getElementById('streamingStatus');
  
  const message = messageInput.value.trim();
  
  if (!message) {
    alert('Please enter a message');
    return;
  }

  streamBtn.disabled = true;
  streamBtn.textContent = 'Streaming...';
  responseDiv.classList.add('show');
  responseDiv.className = 'response show';
  responseText.innerHTML = `
    <strong>Your Question:</strong><br>
    ${escapeHtml(message)}<br><br>
    <strong>AI Response:</strong><br>
    <div class="markdown-content" id="streamingContent"></div>
  `;
  
  streamingStatus.style.display = 'block';
  
  let accumulatedResponse = '';
  
  try {
    const requestBody = { message };
    const response = await fetch(`${SERVER_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'chunk' && data.content) {
              accumulatedResponse += data.content;
              const streamingContent = document.getElementById('streamingContent');
              if (streamingContent) {
                // Parse accumulated response as markdown and update
                streamingContent.innerHTML = marked.parse(accumulatedResponse);
                // Auto-scroll to keep the latest content in view
                streamingContent.scrollIntoView({ behavior: 'smooth', block: 'end' });
              }
            } else if (data.type === 'end') {
              streamingStatus.style.display = 'none';
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (parseError) {
            // Ignore parsing errors for non-JSON lines
            console.debug('Parse error for line:', line);
          }
        }
      }
    }
    
  } catch (error) {
    responseDiv.className = 'response show error';
    responseText.innerHTML = `
      <strong>Error:</strong><br>
      ${error.message}<br><br>
      <strong>Troubleshooting:</strong><br>
      • Make sure the server is running with: <code>npm run dev</code><br>
      • Check that your OPENAI_API_KEY is set in the .env file<br>
      • Verify the streaming endpoint is available at ${SERVER_URL}/chat/stream
    `;
  } finally {
    // Reset button state
    streamBtn.disabled = false;
    streamBtn.textContent = 'Send Streaming';
    streamingStatus.style.display = 'none';
  }
}

// Allow Enter key to send message (Shift+Enter for new line)
document.getElementById('message').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Manual refresh function for MCP status
async function refreshMCPStatus() {
  const refreshBtn = document.getElementById('refresh-mcp');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
  }
  
  await checkMCPStatus();
  
  if (refreshBtn) {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh Status';
  }
}
