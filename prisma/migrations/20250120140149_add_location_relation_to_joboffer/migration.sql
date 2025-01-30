/*
  Warnings:

  - You are about to drop the column `location` on the `JobOffer` table. All the data in the column will be lost.
  - The `latitude` column on the `Location` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `longitude` column on the `Location` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "JobOffer" DROP COLUMN "location",
ADD COLUMN     "locationId" INTEGER;

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "latitude",
ADD COLUMN     "latitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
DROP COLUMN "longitude",
ADD COLUMN     "longitude" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
