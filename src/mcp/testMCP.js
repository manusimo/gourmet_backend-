const GourmetMCPClient = require('./mcpClient.js');

/**
 * Test script for MCP integration
 */
async function testMCP() {
  const client = new GourmetMCPClient();
  
  try {
    console.log('🧪 [MCP TEST] Starting MCP client test...');
    
    // Connect to MCP server
    await client.connect();
    console.log('✅ [MCP TEST] Connected to MCP server');
    
    // List available tools
    const tools = await client.listTools();
    console.log('🔧 [MCP TEST] Available tools:', tools.map(t => t.name));
    
    // Test restaurant info
    console.log('\n🏢 [MCP TEST] Testing getRestaurantInfo...');
    try {
      const restaurantInfo = await client.getRestaurantInfo(1);
      console.log('✅ [MCP TEST] Restaurant info:', restaurantInfo);
    } catch (error) {
      console.log('⚠️ [MCP TEST] Restaurant info test failed (expected if no restaurant with ID 1):', error.message);
    }
    
    // Test employee info
    console.log('\n👤 [MCP TEST] Testing getEmployeeInfo...');
    try {
      const employeeInfo = await client.getEmployeeInfo(1);
      console.log('✅ [MCP TEST] Employee info:', employeeInfo);
    } catch (error) {
      console.log('⚠️ [MCP TEST] Employee info test failed (expected if no employee with ID 1):', error.message);
    }
    
    // Test job applications
    console.log('\n📋 [MCP TEST] Testing getJobApplications...');
    try {
      const applications = await client.getJobApplications(1);
      console.log('✅ [MCP TEST] Job applications:', applications);
    } catch (error) {
      console.log('⚠️ [MCP TEST] Job applications test failed (expected if no job post with ID 1):', error.message);
    }
    
    // Test notification
    console.log('\n📧 [MCP TEST] Testing sendNotification...');
    try {
      const notificationResult = await client.sendNotification({
        recipientEmail: 'test@example.com',
        recipientName: 'Test User',
        subject: 'MCP Test Notification',
        message: 'This is a test notification from MCP'
      });
      console.log('✅ [MCP TEST] Notification sent:', notificationResult);
    } catch (error) {
      console.log('⚠️ [MCP TEST] Notification test failed:', error.message);
    }
    
    console.log('\n🎉 [MCP TEST] All tests completed!');
    
  } catch (error) {
    console.error('❌ [MCP TEST] Test failed:', error);
  } finally {
    await client.disconnect();
    console.log('🔌 [MCP TEST] Disconnected from MCP server');
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testMCP().catch(console.error);
}

module.exports = testMCP;
