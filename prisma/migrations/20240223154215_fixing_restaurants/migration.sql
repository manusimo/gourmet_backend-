/*
  Warnings:

  - You are about to drop the column `benefitsId` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the `Benefits` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `name` to the `Restaurant` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Restaurant" DROP CONSTRAINT "Restaurant_benefitsId_fkey";

-- AlterTable
ALTER TABLE "Restaurant" DROP COLUMN "benefitsId",
ADD COLUMN     "benefits" TEXT[],
ADD COLUMN     "name" TEXT NOT NULL;

-- DropTable
DROP TABLE "Benefits";
