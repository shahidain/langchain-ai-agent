import { ChatOpenAI } from '@langchain/openai';
import { DEFAULT_CONFIG } from '../utils/config';
import { getMCPClient, mcpClient } from '../mcp/mcp-client';
import { MCPTool } from '../mcp/tools';
import { RunnableSequence } from '@langchain/core/runnables';

/**
 * A minimal AI Agent using LangChain and OpenAI
 */
export class Agent {
  private llm: ChatOpenAI;
  private tools: MCPTool[] = [];

  constructor() {
    // Initialize the OpenAI LLM
    this.llm = new ChatOpenAI({
      modelName: DEFAULT_CONFIG.modelName,
      temperature: DEFAULT_CONFIG.temperature,
      openAIApiKey: DEFAULT_CONFIG.apiKey,
      maxTokens: DEFAULT_CONFIG.maxTokens
    });
  }
  /**
   * Update available tools from MCP client
  */
  private async updateAvailableTools(): Promise<void> {
    try {
      const mcpClient = getMCPClient();
      if (mcpClient && mcpClient.isConnectedToMCP()) {
        this.tools = mcpClient.getAvailableTools();
      } else {
        this.tools = [];
        console.log('⚠️ MCP client not connected, no tools available');
      }
    } catch (error) {
      console.error('❌ Failed to update available tools:', error);
      this.tools = [];
    }
  }

  private selectTool = async(input: string) => {
    await this.updateAvailableTools();
    const toolList = this.tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
    const systemPrompt = `You are an AI router. You have access to the following MCP tools:
    ${toolList}
    Given a user request, select the only one most appropriate tool and extract the correct arguments.
    Return a JSON object in this format:{"tool": "<tool_name>","args": {}}
    If no tool is available then reply your best capable answer`;

    const selectToolLLM = new ChatOpenAI({
      modelName: DEFAULT_CONFIG.deepLLMModel,
      temperature: 0,
      openAIApiKey: DEFAULT_CONFIG.apiKey,
      maxTokens: DEFAULT_CONFIG.maxTokens
    });

    const response = await selectToolLLM.invoke([
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: input
      }
    ]);
    try {
      const content = JSON.parse(response.content as string);
      return { tool: content.tool, args: content.args, input };
    } catch (error) {
      console.info('No tool avaialble to process message, continuing with LLM response');
      return { tool: undefined, args: undefined, input, response: response.content as string };
    }
  };

  private runTool = async({ tool, args, input, response }: { tool: string, args: Record<string, any>, input: string, response: string }) => {
    console.log(`🔧 Received tool: ${tool} with args:`, args);
    if (!tool || this.tools.some(t => t.name === tool) === false)
      return { result: response, input };
    const result = await mcpClient?.callTool(tool, args);
    return { result: result?.content[0].text, input };
  };

  private finalLLM = async({ result, input }: { result: string, input: string }) => {
    const prompt = `You are an expert data converter, convert provided data as user has instructed. data: ${result}`;
    const response = await this.llm.invoke([
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ]);
    return response.content;
  };

  private pipeline = RunnableSequence.from([
    this.selectTool,
    this.runTool,
    this.finalLLM
  ]);

  async processInput(input: string): Promise<string | null> {
    try {
      const result = await this.pipeline.invoke(input);
      return result as string;
    } catch (error) {
      console.error('❌ Failed to process message:', error);
      return error instanceof Error ? error.message : 'Unknown error occurred';
    }
  }

  async *processInputStream(input: string): AsyncGenerator<string, void, unknown> {
    async function* errorGen(message: string) { yield message; }

    try {
      // Execute tool selection
      const selectResult = await this.selectTool(input);

      // Execute tool run
      const runResult = await this.runTool({
        tool: selectResult.tool,
        args: selectResult.args,
        input: selectResult.input,
        response: selectResult.response ?? ''
      });

      // Stream the final LLM response
      const prompt = `You are an expert data converter, convert provided data as user has instructed. data: ${runResult.result}`;
      const stream = await this.llm.stream([
        { role: 'system', content: prompt },
        { role: 'user', content: runResult.input }
      ]);

      for await (const chunk of stream) {
        if (typeof chunk === 'string') {
          yield chunk;
        } else if (chunk && typeof chunk.content === 'string') {
          yield chunk.content;
        }
      }
    } catch (error) {
      console.error('❌ Failed to process message (stream):', error);
      yield* errorGen(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }

  /**
   * Get the model configuration
   */
  getModelInfo(): { model: string; temperature: number } {
    return {
      model: this.llm.modelName,
      temperature: this.llm.temperature
    };
  }
}
