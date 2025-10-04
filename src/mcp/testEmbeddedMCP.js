const EmbeddedMCPClient = require('./embeddedClient.js');

/**
 * Test script for embedded MCP integration
 */
async function testEmbeddedMCP() {
  const client = new EmbeddedMCPClient('http://localhost:3000');
  
  try {
    console.log('🧪 [EMBEDDED MCP TEST] Starting embedded MCP client test...');
    
    // Connect to embedded MCP server
    await client.connect();
    console.log('✅ [EMBEDDED MCP TEST] Connected to embedded MCP server');
    
    // List available tools
    const tools = await client.listTools();
    console.log('🔧 [EMBEDDED MCP TEST] Available tools:', tools.map(t => t.name));
    
    // Test health check
    console.log('\n❤️ [EMBEDDED MCP TEST] Testing health check...');
    try {
      const response = await fetch('http://localhost:3000/mcp/health');
      const health = await response.json();
      console.log('✅ [EMBEDDED MCP TEST] Health check:', health);
    } catch (error) {
      console.log('⚠️ [EMBEDDED MCP TEST] Health check failed (server might not be running):', error.message);
    }
    
    // Test restaurant info (will fail if no restaurant with ID 1, but that's expected)
    console.log('\n🏢 [EMBEDDED MCP TEST] Testing getRestaurantInfo...');
    try {
      const restaurantInfo = await client.getRestaurantInfo(1);
      console.log('✅ [EMBEDDED MCP TEST] Restaurant info:', restaurantInfo);
    } catch (error) {
      console.log('⚠️ [EMBEDDED MCP TEST] Restaurant info test failed (expected if no restaurant with ID 1):', error.message);
    }
    
    console.log('\n🎉 [EMBEDDED MCP TEST] All tests completed!');
    console.log('📋 [EMBEDDED MCP TEST] Summary:');
    console.log(`   - Connected to embedded MCP server: ✅`);
    console.log(`   - Available tools: ${tools.length}`);
    console.log(`   - MCP endpoint: http://localhost:3000/mcp`);
    console.log(`   - Health check: http://localhost:3000/mcp/health`);
    
  } catch (error) {
    console.error('❌ [EMBEDDED MCP TEST] Test failed:', error);
    console.log('\n💡 [EMBEDDED MCP TEST] Make sure your backend server is running on port 3000');
    console.log('   Start your server with: npm start');
  } finally {
    await client.disconnect();
    console.log('🔌 [EMBEDDED MCP TEST] Disconnected from embedded MCP server');
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testEmbeddedMCP().catch(console.error);
}

module.exports = testEmbeddedMCP;
