-- AlterTable TopicSpaceDriveSync
ALTER TABLE "TopicSpaceDriveSync" ADD COLUMN "driveFolderName" TEXT,
ADD COLUMN "authMode" TEXT NOT NULL DEFAULT 'user_oauth',
ADD COLUMN "configuredByUserId" TEXT;

-- CreateTable
CREATE TABLE "UserGoogleDriveConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGoogleDriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserGoogleDriveConnection_userId_key" ON "UserGoogleDriveConnection"("userId");

-- AddForeignKey
ALTER TABLE "TopicSpaceDriveSync" ADD CONSTRAINT "TopicSpaceDriveSync_configuredByUserId_fkey" FOREIGN KEY ("configuredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserGoogleDriveConnection" ADD CONSTRAINT "UserGoogleDriveConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
