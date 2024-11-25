/*
  Warnings:

  - You are about to drop the column `units` on the `JobOffer` table. All the data in the column will be lost.
  - Added the required column `vacancies` to the `JobOffer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "JobOffer" DROP COLUMN "units",
ADD COLUMN     "vacancies" INTEGER NOT NULL;
