-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "civilState" TEXT NOT NULL DEFAULT 'single',
ADD COLUMN     "genre" TEXT NOT NULL DEFAULT 'not declared',
ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';
