-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_receiverUserId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderUserId_fkey";

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "senderUserId" DROP NOT NULL,
ALTER COLUMN "receiverUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "RestaurantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderEmployee_fkey" FOREIGN KEY ("senderUserId") REFERENCES "Employee"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverUserId_fkey" FOREIGN KEY ("receiverUserId") REFERENCES "RestaurantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverEmployee_fkey" FOREIGN KEY ("receiverUserId") REFERENCES "Employee"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
