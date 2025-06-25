import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { DynamicTool } from '@langchain/core/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { DEFAULT_CONFIG } from '../utils/config';
import { getMCPClient } from '../mcp/mcp-client';
import { MCPTool } from '../mcp/tools';

/**
 * A minimal AI Agent using LangChain and OpenAI
 */
export class Agent {
  private llm: ChatOpenAI;
  private outputParser: StringOutputParser;
  private tools: MCPTool[] = [];
  private langChainTools: DynamicTool[] = [];

  constructor() {
    // Initialize the OpenAI LLM
    this.llm = new ChatOpenAI({
      modelName: DEFAULT_CONFIG.modelName,
      temperature: DEFAULT_CONFIG.temperature,
      openAIApiKey: DEFAULT_CONFIG.apiKey,
      maxTokens: DEFAULT_CONFIG.maxTokens
    });    // Initialize the output parser
    this.outputParser = new StringOutputParser();
  }
  /**
   * Update available tools from MCP client
   */
  private async updateAvailableTools(): Promise<void> {
    try {
      const mcpClient = getMCPClient();
      if (mcpClient && mcpClient.isConnectedToMCP()) {
        this.tools = mcpClient.getAvailableTools();
        this.langChainTools = this.convertMCPToolsToLangChain();
        console.log(`🔧 Agent updated with ${this.tools.length} MCP tools`);
      } else {
        this.tools = [];
        this.langChainTools = [];
        console.log('⚠️ MCP client not connected, no tools available');
      }
    } catch (error) {
      console.error('❌ Failed to update available tools:', error);
      this.tools = [];
      this.langChainTools = [];
    }
  }
  /**
   * Convert MCP tools to LangChain DynamicTools
   */
  private convertMCPToolsToLangChain(): DynamicTool[] {
    return this.tools.map(mcpTool => {
      return new DynamicTool({
        name: mcpTool.name,
        description: mcpTool.description,
        func: async(input: string) => {
          try {
            console.log(`🔧 Invoking MCP tool: ${mcpTool.name} with input: ${input}`);
            const mcpClient = getMCPClient();
            if (!mcpClient) {
              throw new Error('MCP client not available');
            }

            if (!mcpClient.isConnectedToMCP()) {
              throw new Error('MCP client not connected');
            }

            // Parse input if it's JSON, otherwise use as simple object
            let args: any;
            try {
              args = JSON.parse(input);
            } catch {
              // If not valid JSON, treat as a simple string input
              args = { query: input, input: input };
            }

            console.log('📋 Calling tool with args:', args);
            const result = await mcpClient.callTool(mcpTool.name, args);
            console.log(`✅ Tool ${mcpTool.name} result:`, result);

            // Return result as string for the agent
            if (typeof result === 'string') {
              return result;
            } else {
              return JSON.stringify(result, null, 2);
            }
          } catch (error) {
            console.error(`❌ Error calling tool ${mcpTool.name}:`, error);
            return `Error calling tool ${mcpTool.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        }
      });
    });
  }

  /**
   * Build system prompt with available MCP tools
   */
  private buildSystemPromptWithTools(): string {    // Base system prompt when no tools are available
    const basePrompt = 'You are a helpful AI assistant.';

    // If no tools available, return base prompt
    if (!this.tools || this.tools.length === 0) {
      return basePrompt;
    }

    // Build enhanced prompt with tools information
    const toolsList = this.tools.map(tool => `${tool.name}: ${tool.description}`).join(', ');
    const detailedToolsList = this.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n');

    const systemPrompt = `You are a helpful AI assistant with access to various tools through an MCP (Model Context Protocol) server.

    Available tools: ${toolsList}

    You have access to the following tools. Use them when they can help answer the user's question:
    ${detailedToolsList}

    IMPORTANT: You MUST use tools when they can help answer the question. When you see a tool call is needed, you should use the tool and wait for the result before providing your final answer.

    Be helpful and accurate in your responses.`;

    return systemPrompt;
  }  /**
   * Process a user input and return a response
   */
  async processQuery(input: string): Promise<string> {
    try {
      // Update available MCP tools
      await this.updateAvailableTools();      // If we have tools, use the agent executor
      if (this.langChainTools.length > 0) {
        console.log(`🤖 Using agent with ${this.langChainTools.length} tools`);

        const prompt = ChatPromptTemplate.fromMessages([
          ['system', `You are a helpful AI assistant with access to various tools through an MCP (Model Context Protocol) server.

You have access to the following tools. Use them when they can help answer the user's question.

IMPORTANT: You MUST use the appropriate tools when they can help answer the question. When you see a tool call is needed, you should use the tool and wait for the result before providing your final answer.

Be helpful and accurate in your responses.`],
          ['human', '{input}'],
          ['placeholder', '{agent_scratchpad}']
        ]);

        const agent = await createToolCallingAgent({
          llm: this.llm,
          tools: this.langChainTools,
          prompt
        });

        const agentExecutor = new AgentExecutor({
          agent,
          tools: this.langChainTools,
          verbose: true,
          maxIterations: 3
        });

        const result = await agentExecutor.invoke({
          input: input
        });

        return result.output;
      } else {
        // Fallback to simple prompt when no tools available
        console.log('� No tools available, using simple prompt...');
        const systemPrompt = this.buildSystemPromptWithTools();
        const promptTemplate = ChatPromptTemplate.fromMessages([
          ['system', systemPrompt],
          ['human', '{input}']
        ]);

        const chain = promptTemplate.pipe(this.llm).pipe(this.outputParser);
        const response = await chain.invoke({ input });
        return response;
      }
    } catch (error) {
      console.error('Error processing input:', error);

      // Fallback to simple prompt if MCP integration fails
      console.log('🔄 Falling back to simple prompt due to error...');
      try {
        const fallbackTemplate = ChatPromptTemplate.fromTemplate(
          'You are a helpful AI assistant. {input}'
        );
        const fallbackChain = fallbackTemplate.pipe(this.llm).pipe(this.outputParser);
        const fallbackResponse = await fallbackChain.invoke({
          input: input
        });
        return fallbackResponse;
      } catch (fallbackError) {
        console.error('Error in fallback processing:', fallbackError);
        throw new Error(`Failed to process input: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Process input with custom system prompt
   */
  async processWithCustomPrompt(input: string, systemPrompt: string): Promise<string> {
    try {
      const promptTemplate = ChatPromptTemplate.fromTemplate(
        '{systemPrompt}\n\n{input}'
      );

      const chain = promptTemplate.pipe(this.llm).pipe(this.outputParser);
      const response = await chain.invoke({
        systemPrompt: systemPrompt,
        input: input
      });

      return response;
    } catch (error) {
      console.error('Error processing input with custom prompt:', error);
      throw new Error(`Failed to process input: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
