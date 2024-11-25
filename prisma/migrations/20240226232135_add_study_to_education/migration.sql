-- AlterTable
ALTER TABLE "Education" ADD COLUMN     "study" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';
