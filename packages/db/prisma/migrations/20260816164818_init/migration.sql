-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('FOLDER', 'FILE');

-- CreateEnum
CREATE TYPE "ShareMode" AS ENUM ('PUBLIC_LINK', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ShareRole" AS ENUM ('VIEWER');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'READY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_rooms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID NOT NULL,
    "rootNodeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" UUID NOT NULL,
    "dataRoomId" UUID NOT NULL,
    "parentId" UUID,
    "type" "NodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,
    "versionCount" INTEGER NOT NULL DEFAULT 0,
    "currentVersionId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_versions" (
    "id" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" UUID NOT NULL,
    "dataRoomId" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "mode" "ShareMode" NOT NULL,
    "role" "ShareRole" NOT NULL DEFAULT 'VIEWER',
    "token" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_grants" (
    "id" UUID NOT NULL,
    "shareId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "userId" UUID,
    "role" "ShareRole" NOT NULL DEFAULT 'VIEWER',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "data_rooms_rootNodeId_key" ON "data_rooms"("rootNodeId");

-- CreateIndex
CREATE INDEX "data_rooms_ownerId_createdAt_idx" ON "data_rooms"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "nodes_currentVersionId_key" ON "nodes"("currentVersionId");

-- CreateIndex
CREATE INDEX "nodes_parentId_type_name_idx" ON "nodes"("parentId", "type", "name");

-- CreateIndex
CREATE INDEX "nodes_dataRoomId_path_idx" ON "nodes"("dataRoomId", "path");

-- CreateIndex
CREATE INDEX "nodes_dataRoomId_type_nameKey_idx" ON "nodes"("dataRoomId", "type", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "nodes_parentId_nameKey_key" ON "nodes"("parentId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_storageKey_key" ON "file_versions"("storageKey");

-- CreateIndex
CREATE INDEX "file_versions_nodeId_createdAt_idx" ON "file_versions"("nodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_nodeId_version_key" ON "file_versions"("nodeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "shares_token_key" ON "shares"("token");

-- CreateIndex
CREATE INDEX "shares_dataRoomId_createdAt_idx" ON "shares"("dataRoomId", "createdAt");

-- CreateIndex
CREATE INDEX "shares_nodeId_idx" ON "shares"("nodeId");

-- CreateIndex
CREATE INDEX "share_grants_email_idx" ON "share_grants"("email");

-- CreateIndex
CREATE INDEX "share_grants_userId_idx" ON "share_grants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "share_grants_shareId_email_key" ON "share_grants"("shareId", "email");

-- AddForeignKey
ALTER TABLE "data_rooms" ADD CONSTRAINT "data_rooms_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_rooms" ADD CONSTRAINT "data_rooms_rootNodeId_fkey" FOREIGN KEY ("rootNodeId") REFERENCES "nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "data_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "file_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "data_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_grants" ADD CONSTRAINT "share_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
