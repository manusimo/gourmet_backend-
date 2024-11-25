/*
  Warnings:

  - You are about to drop the column `googleMapsUrl` on the `Location` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "googleMapsUrl",
ADD COLUMN     "latitude" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "longitude" TEXT NOT NULL DEFAULT '0';
