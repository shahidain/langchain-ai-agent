import { getMCPClient } from '../mcp/mcp-client';
import { MCPTool } from '../mcp/tools';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

export class InfobyteAgent {
  public tools: MCPTool[] = [];

  async initialize() {
    const mcpClient = getMCPClient();
    if (mcpClient && mcpClient.isConnectedToMCP()) {
      this.tools = mcpClient.getAvailableTools();
      console.log(`InfobyteAgent: Fetched ${this.tools.length} MCP tools.`);
    } else {
      this.tools = [];
      console.log('InfobyteAgent: MCP client not connected or unavailable.');
    }
  }

  /**
   * Uses LLM to reason about which tool to invoke and with what arguments, given a user request.
   * Returns { tool: string, args: object } if a tool is identified, otherwise null.
   */
  async getToolToInvoke(userRequest: string): Promise<{ tool: string, args: object } | null> {
    if (!this.tools || this.tools.length === 0) {
      console.log('InfobyteAgent: No MCP tools available.');
      return null;
    }
    // Build system prompt with tool details
    const toolList = this.tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
    const systemPrompt = `You are an AI assistant. You have access to the following MCP tools:\n${toolList}\n\nGiven a user request, select the most appropriate tool and extract the correct arguments.\n\nReturn ONLY a JSON object in this format:\n{\n  "tool": "<tool_name>",\n  "args": { ... }\n}`;

    // Prepare LLM and prompt
    const llm = new ChatOpenAI({ temperature: 0 });
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['human', '{input}']
    ]);
    const outputParser = new StringOutputParser();
    const chain = prompt.pipe(llm).pipe(outputParser);

    // Run LLM chain
    const llmResponse = await chain.invoke({ input: userRequest });
    try {
      const parsed = JSON.parse(llmResponse);
      if (parsed.tool && parsed.args) {
        return parsed;
      }
    } catch (e) {
      console.log('InfobyteAgent: LLM did not return valid JSON:', llmResponse);
    }
    return null;
  }
}
