import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { DEFAULT_CONFIG } from '../utils/config';

/**
 * A minimal AI Agent using LangChain and OpenAI
 */
export class Agent {
  private llm: ChatOpenAI;
  private outputParser: StringOutputParser;

  constructor() {
    // Initialize the OpenAI LLM
    this.llm = new ChatOpenAI({
      modelName: DEFAULT_CONFIG.modelName,
      temperature: DEFAULT_CONFIG.temperature,
      openAIApiKey: DEFAULT_CONFIG.apiKey,
      maxTokens: DEFAULT_CONFIG.maxTokens
    });
    // Initialize the output parser
    this.outputParser = new StringOutputParser();
  }  /**
   * Process a user input and return a response
   */
  async processQuery(input: string): Promise<string> {
    try {
      // Create a simple prompt template
      const promptTemplate = ChatPromptTemplate.fromTemplate(
        'You are a helpful AI assistant. {input}'
      );

      // Create the chain
      const chain = promptTemplate.pipe(this.llm).pipe(this.outputParser);

      // Execute the chain
      const response = await chain.invoke({
        input: input
      });

      return response;
    } catch (error) {
      console.error('Error processing input:', error);
      throw new Error(`Failed to process input: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
