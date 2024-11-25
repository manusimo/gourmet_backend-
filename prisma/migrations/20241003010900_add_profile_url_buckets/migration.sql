-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "profileImageUrl" TEXT NOT NULL DEFAULT 'No photo',
ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "profileImageUrl" TEXT NOT NULL DEFAULT 'No photo';
