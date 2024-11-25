/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `RestaurantUser` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantUser_userId_key" ON "RestaurantUser"("userId");
