/*
  Warnings:

  - You are about to drop the column `receiverUserId` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `senderUserId` on the `Message` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_receiverEmployee_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_receiverUserId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderEmployee_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderUserId_fkey";

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "receiverUserId",
DROP COLUMN "senderUserId",
ADD COLUMN     "receiverEmployeeId" INTEGER,
ADD COLUMN     "receiverRestaurantUserId" INTEGER,
ADD COLUMN     "senderEmployeeId" INTEGER,
ADD COLUMN     "senderRestaurantUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderEmployeeId_fkey" FOREIGN KEY ("senderEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderRestaurantUserId_fkey" FOREIGN KEY ("senderRestaurantUserId") REFERENCES "RestaurantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverEmployeeId_fkey" FOREIGN KEY ("receiverEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverRestaurantUserId_fkey" FOREIGN KEY ("receiverRestaurantUserId") REFERENCES "RestaurantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
