-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "JobOffer" ADD COLUMN     "salary" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tips" BOOLEAN NOT NULL DEFAULT true;
