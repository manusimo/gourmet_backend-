-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'No mencionado',
ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';
