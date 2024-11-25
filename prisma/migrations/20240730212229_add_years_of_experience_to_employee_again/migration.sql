-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "yearsOfExperience" TEXT NOT NULL DEFAULT 'No experience',
ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';
