/*
  Warnings:

  - You are about to drop the column `text` on the `Question` table. All the data in the column will be lost.
  - Added the required column `answer` to the `Question` table without a default value. This is not possible if the table is not empty.
  - Added the required column `question` to the `Question` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "text",
ADD COLUMN     "answer" TEXT NOT NULL,
ADD COLUMN     "question" TEXT NOT NULL;
