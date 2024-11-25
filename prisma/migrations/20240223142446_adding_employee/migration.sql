-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "aboutMe" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL,
    "skills" TEXT[],
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" SERIAL NOT NULL,
    "companyName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "position" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Education" (
    "id" SERIAL NOT NULL,
    "institution" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "career" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" SERIAL NOT NULL,
    "specialty" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "numberOfRestaurants" INTEGER NOT NULL,
    "workers" INTEGER NOT NULL,
    "weeklyAverageClients" INTEGER NOT NULL,
    "benefitsId" INTEGER NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benefits" (
    "id" SERIAL NOT NULL,
    "insurance" BOOLEAN NOT NULL,
    "vacations" BOOLEAN NOT NULL,
    "birthday" BOOLEAN NOT NULL,
    "educationPackage" BOOLEAN NOT NULL,

    CONSTRAINT "Benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "googleMapsUrl" TEXT NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOffer" (
    "id" SERIAL NOT NULL,
    "position" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "contract" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "yearsOfExperience" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_benefitsId_fkey" FOREIGN KEY ("benefitsId") REFERENCES "Benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
