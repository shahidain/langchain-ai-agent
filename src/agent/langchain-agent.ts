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
   * Parse arguments based on tool schema
   */
  private parseArgumentsWithSchema(input: string, toolSchema: any): any {
    console.log(`🔍 Parsing input: "${input}" with schema:`, toolSchema);

    // First, try to parse as JSON
    try {
      const parsedInput = JSON.parse(input);
      console.log('📋 Input is valid JSON:', parsedInput);
      // Ensure we return an object for MCP
      if (typeof parsedInput === 'object' && parsedInput !== null) {
        return parsedInput;
      }
    } catch {
      // Input is not JSON, need to map to schema
      console.log('📋 Input is not JSON, mapping to schema...');
    }

    // If not JSON, analyze the schema to determine how to structure the input
    if (!toolSchema || !toolSchema.properties) {
      console.log('⚠️ No schema properties found, defaulting to {id: input}');
      // Default fallback - assume it's an ID since that's most common
      const trimmedInput = input.trim();
      if (/^\d+$/.test(trimmedInput)) {
        return { id: parseInt(trimmedInput, 10) };
      }
      return { id: trimmedInput };
    }

    const properties = toolSchema.properties;
    const propertyNames = Object.keys(properties);
    console.log('📋 Schema properties:', propertyNames);

    // If schema has only one property, map the input to that property
    if (propertyNames.length === 1) {
      const primaryParam = propertyNames[0];
      const primaryParamType = properties[primaryParam].type;

      console.log(`📋 Mapping input to primary parameter: ${primaryParam} (type: ${primaryParamType})`);

      // Convert input to appropriate type
      let value: any = input.trim();
      if (primaryParamType === 'number' || primaryParamType === 'integer') {
        value = parseInt(value, 10);
      } else if (primaryParamType === 'boolean') {
        value = value.toLowerCase() === 'true';
      }

      return { [primaryParam]: value };
    }

    // If multiple properties, look for common parameter names
    const commonParams = ['id', 'query', 'input', 'text', 'message'];
    for (const param of commonParams) {
      if (properties[param]) {
        console.log(`📋 Mapping input to common parameter: ${param}`);
        let value: any = input.trim();
        const paramType = properties[param].type;

        if (paramType === 'number' || paramType === 'integer') {
          value = parseInt(value, 10);
        } else if (paramType === 'boolean') {
          value = value.toLowerCase() === 'true';
        }

        return { [param]: value };
      }
    }

    // Fallback: use the first property
    const firstParam = propertyNames[0];
    console.log(`📋 Fallback: mapping input to first parameter: ${firstParam}`);
    return { [firstParam]: input.trim() };
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
          const callId = Date.now() + Math.random().toString(36).substr(2, 9);
          try {
            console.log(`🔧 [${callId}] Invoking MCP tool: ${mcpTool.name} with raw input: "${input}"`);
            const mcpClient = getMCPClient();
            if (!mcpClient) {
              throw new Error('MCP client not available');
            }

            if (!mcpClient.isConnectedToMCP()) {
              throw new Error('MCP client not connected');
            }

            // Use schema-based argument parsing
            const args = this.parseArgumentsWithSchema(input, mcpTool.inputSchema);
            console.log(`📋 [${callId}] Schema-parsed args for ${mcpTool.name}:`, args);

            console.log(`📋 [${callId}] Calling tool with args:`, args);
            const result = await mcpClient.callTool(mcpTool.name, args);
            console.log(`✅ [${callId}] Tool ${mcpTool.name} result:`, result);

            // Return result as string for the agent
            if (typeof result === 'string') {
              return result;
            } else {
              return JSON.stringify(result, null, 2);
            }
          } catch (error) {
            console.error(`❌ [${callId}] Tool '${mcpTool.name}' failed:`, error);

            // Log the error but don't throw - let the agent continue
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`⚠️ [${callId}] Continuing without tool result due to: ${errorMessage}`);

            // Return a structured error response that the agent can understand
            return JSON.stringify({
              error: true,
              message: `Tool '${mcpTool.name}' is currently unavailable`,
              details: errorMessage,
              suggestion: 'Please try your request without using this specific tool, or try again later.'
            });
          }
        }
      });
    });
  }

  /**
   * Build system prompt with available MCP tools
   */
  private buildSystemPromptWithTools(): string {
    // Base system prompt when no tools are available
    const basePrompt = 'You are a helpful AI assistant.';

    // If no tools available, return base prompt
    if (!this.tools || this.tools.length === 0) {
      console.log('🔧 Building system prompt: No tools available');
      return basePrompt;
    }    // Build enhanced prompt with tools information
    const detailedToolsList = this.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n');

    console.log(`🔧 Building system prompt with ${this.tools.length} tools`);
    console.log(`📋 Detailed tools list:\n${detailedToolsList}`);

    const systemPrompt = `You are a helpful AI assistant with access to various tools through an MCP (Model Context Protocol) server.

You have access to the following tools. Use them when they can help answer the user's question:
${detailedToolsList}

INSTRUCTIONS:
1. If the user's question can be answered with available tools, use the appropriate tool ONCE
2. After getting the tool result, provide your final answer based on that result
3. Do NOT call the same tool multiple times unless absolutely necessary
4. If a tool returns an error or is unavailable, acknowledge this and provide the best answer you can without that tool
5. When a tool fails, explain what you were trying to do and provide alternative information if possible
6. Always aim to provide a complete and helpful response to the user, whether tools succeed or fail

When a tool is unavailable or returns an error:
- Acknowledge the limitation
- Provide any relevant information you know from your training data
- Suggest alternative approaches if applicable
- Still try to be as helpful as possible

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

        const systemPrompt = this.buildSystemPromptWithTools();
        const prompt = ChatPromptTemplate.fromMessages([
          ['system', systemPrompt],
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
          maxIterations: 3,
          returnIntermediateSteps: false
        });

        console.log('🚀 Invoking agent executor with input:', input);
        const result = await agentExecutor.invoke({
          input: input
        });
        console.log('🎯 Agent execution completed. Output:', result.output);

        // Check if the agent stopped due to max iterations
        if (!result.output || result.output.trim() === '') {
          console.log('⚠️ Agent may have stopped due to max iterations, using tool results');
          // Try to extract meaningful response from intermediate steps if available
          return 'I was able to execute the requested action, but the response processing was incomplete. Please check the tool execution logs above for the actual results.';
        }

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
