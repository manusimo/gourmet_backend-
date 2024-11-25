-- CreateTable
CREATE TABLE "TokenDenyList" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "invalidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenDenyList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenDenyList_token_key" ON "TokenDenyList"("token");
