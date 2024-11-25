/*
  Warnings:

  - You are about to drop the column `coverLetter` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Application` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Application" DROP COLUMN "coverLetter",
DROP COLUMN "email",
DROP COLUMN "name";

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- CreateTable
CREATE TABLE "Answer" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "applicationId" INTEGER NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
