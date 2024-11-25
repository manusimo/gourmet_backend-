-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "restaurantUserId" INTEGER NOT NULL,
    "jobOfferId" INTEGER NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantUser" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',

    CONSTRAINT "RestaurantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderUserId" INTEGER NOT NULL,
    "receiverUserId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_restaurantUserId_fkey" FOREIGN KEY ("restaurantUserId") REFERENCES "RestaurantUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_jobOfferId_fkey" FOREIGN KEY ("jobOfferId") REFERENCES "JobOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantUser" ADD CONSTRAINT "RestaurantUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantUser" ADD CONSTRAINT "RestaurantUser_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverUserId_fkey" FOREIGN KEY ("receiverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
