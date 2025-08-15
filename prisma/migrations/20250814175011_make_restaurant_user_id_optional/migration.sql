-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_restaurantUserId_fkey";

-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "restaurantUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_restaurantUserId_fkey" FOREIGN KEY ("restaurantUserId") REFERENCES "RestaurantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
