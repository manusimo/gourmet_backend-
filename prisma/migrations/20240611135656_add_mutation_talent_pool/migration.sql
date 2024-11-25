-- DropForeignKey
ALTER TABLE "TalentPool" DROP CONSTRAINT "TalentPool_addedByUserId_fkey";

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "TalentPool" ALTER COLUMN "addedByUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TalentPool" ADD CONSTRAINT "TalentPool_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "RestaurantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
