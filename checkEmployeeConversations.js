const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkEmployeeConversations() {
  try {
    console.log('🔍 Checking conversations for employee user...');

    // Find the employee user
    const employeeUser = await prisma.user.findUnique({
      where: { email: 'pruebaempleado@gmail.com' },
      include: {
        employee: {
          include: {
            conversations: {
              include: {
                restaurantUser: {
                  include: {
                    user: true,
                    restaurant: true
                  }
                },
                jobOffer: {
                  include: {
                    restaurant: true,
                    location: true
                  }
                },
                messages: true
              }
            }
          }
        }
      }
    });

    if (!employeeUser) {
      console.log('❌ Employee user not found');
      return;
    }

    console.log('👤 Employee User:', {
      id: employeeUser.id,
      email: employeeUser.email,
      employeeId: employeeUser.employee?.id
    });

    if (!employeeUser.employee) {
      console.log('❌ No employee profile found for this user');
      return;
    }

    console.log('💬 All conversations for employee:', employeeUser.employee.conversations.length);

    employeeUser.employee.conversations.forEach((conversation, index) => {
      console.log(`\n📝 Conversation ${index + 1}:`, {
        id: conversation.id,
        type: conversation.type,
        jobOfferId: conversation.jobOfferId,
        jobTitle: conversation.jobOffer?.position,
        restaurantName: conversation.restaurantUser?.restaurant?.name,
        restaurantUserEmail: conversation.restaurantUser?.user?.email,
        messageCount: conversation.messages.length,
        deletedAt: conversation.deletedAt
      });

      if (conversation.messages.length > 0) {
        console.log('💬 Messages:');
        conversation.messages.forEach((message, msgIndex) => {
          console.log(`  ${msgIndex + 1}. "${message.text}" (${message.createdAt})`);
        });
      }
    });

  } catch (error) {
    console.error('❌ Error checking conversations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEmployeeConversations();
