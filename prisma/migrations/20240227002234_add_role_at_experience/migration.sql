/*
  Warnings:

  - You are about to drop the column `position` on the `Experience` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Experience" DROP COLUMN "position",
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'No position';
