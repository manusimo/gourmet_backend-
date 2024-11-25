/*
  Warnings:

  - You are about to drop the column `prerequisites` on the `JobOffer` table. All the data in the column will be lost.
  - You are about to drop the column `responsabilities` on the `JobOffer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "JobOffer" DROP COLUMN "prerequisites",
DROP COLUMN "responsabilities",
ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'Sin información';
