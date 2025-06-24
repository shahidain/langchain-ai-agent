const SERVER_URL = 'http://localhost:3000';

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
  const systemPrompt = systemPromptInput.value.trim();
  
  if (!message) {
    alert('Please enter a message');
    return;
  }

  // Show loading state
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  responseDiv.classList.add('show');
  responseDiv.className = 'response show';
  responseText.innerHTML = '<div class="loading">🤔 Thinking...</div>';
  
  try {
    const requestBody = { message };
    if (systemPrompt) {
      requestBody.systemPrompt = systemPrompt;
    }
    
    const response = await fetch(`${SERVER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      responseText.innerHTML = `
        <strong>Your Question:</strong><br>
        ${data.message}<br><br>
        <strong>AI Response:</strong><br>
        ${data.response.replace(/\n/g, '<br>')}
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
