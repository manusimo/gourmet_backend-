-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "surname" TEXT NOT NULL DEFAULT 'Pérez',
ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';
