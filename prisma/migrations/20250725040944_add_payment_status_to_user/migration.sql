-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "last_payment" TIMESTAMP(3),
ADD COLUMN     "payment_status" TEXT NOT NULL DEFAULT 'starter';
