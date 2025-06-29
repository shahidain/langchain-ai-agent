import { InfobyteAgent } from '../agent/ai-agent';

async function testGetToolToInvoke(userRequest: string) {
  const agent = new InfobyteAgent();
  await agent.initialize();
  const result = await agent.getToolToInvoke(userRequest);
  console.log('Test result:', result);
  return result;
}

// Example usage for testing
(async() => {
  const userRequest = 'Fetch the latest 5 products and skip the first 2.';
  await testGetToolToInvoke(userRequest);
})();
