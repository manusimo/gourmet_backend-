const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteConversationsOnly() {
  try {
    console.log('🗑️ Starting conversation cleanup...');
    
    // First, let's see what we have
    const conversationCount = await prisma.conversation.count();
    const messageCount = await prisma.message.count();
    
    console.log(`📊 Current data:`);
    console.log(`  - Conversations: ${conversationCount}`);
    console.log(`  - Messages: ${messageCount}`);
    
    if (conversationCount === 0) {
      console.log('✅ No conversations to delete. Database is clean!');
      return;
    }
    
    // Delete messages first (due to foreign key constraints)
    console.log('🗑️ Deleting messages...');
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`✅ Deleted ${deletedMessages.count} messages`);
    
    // Delete conversations
    console.log('🗑️ Deleting conversations...');
    const deletedConversations = await prisma.conversation.deleteMany({});
    console.log(`✅ Deleted ${deletedConversations.count} conversations`);
    
    // Verify cleanup
    const finalConversationCount = await prisma.conversation.count();
    const finalMessageCount = await prisma.message.count();
    
    console.log('📊 Final data:');
    console.log(`  - Conversations: ${finalConversationCount}`);
    console.log(`  - Messages: ${finalMessageCount}`);
    
    console.log('✅ Conversation cleanup completed successfully!');
    console.log('💡 You can now run: heroku run npx prisma db push --app gourmet-jobs-backend');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
deleteConversationsOnly()
  .then(() => {
    console.log('🎉 Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
