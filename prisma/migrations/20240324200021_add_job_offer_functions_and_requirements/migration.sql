-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "JobOffer" ADD COLUMN     "functions" TEXT NOT NULL DEFAULT 'No functions to shows',
ADD COLUMN     "requirements" TEXT NOT NULL DEFAULT 'No requirements to show';
