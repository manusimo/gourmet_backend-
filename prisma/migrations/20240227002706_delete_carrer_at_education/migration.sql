/*
  Warnings:

  - You are about to drop the column `career` on the `Education` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Education" DROP COLUMN "career";

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';
