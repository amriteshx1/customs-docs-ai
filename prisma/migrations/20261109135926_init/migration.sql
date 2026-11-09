-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('AWAITING_DOCUMENTS', 'READY', 'PROCESSING', 'FAILED', 'MANUAL_ENTRY_REQUIRED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_READY', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('COMMERCIAL_INVOICE', 'PACKING_LIST', 'BILL_OF_LADING');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'EXTRACTED', 'FAILED', 'UNREADABLE', 'PARTIAL', 'MANUALLY_COMPLETED');

-- CreateEnum
CREATE TYPE "FieldPresence" AS ENUM ('PRESENT', 'MISSING', 'UNREADABLE');

-- CreateEnum
CREATE TYPE "FieldSource" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "FieldReviewState" AS ENUM ('UNREVIEWED', 'CONFIRMED', 'EDITED');

-- CreateEnum
CREATE TYPE "EditType" AS ENUM ('CONFIRMATION', 'CORRECTION', 'MANUAL_ENTRY');

-- CreateEnum
CREATE TYPE "ValidationResult" AS ENUM ('PASS', 'WARNING', 'MISMATCH', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "IssueState" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'DOCUMENT_UPLOADED', 'EXTRACTION_STARTED', 'EXTRACTION_COMPLETED', 'EXTRACTION_FAILED', 'EXTRACTION_UNREADABLE', 'FIELD_EDITED', 'FIELD_CONFIRMED', 'MANUAL_ENTRY', 'VALIDATION_RERUN', 'SUBMITTED', 'APPROVED', 'APPROVAL_REVOKED', 'EXPORTED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'DOCUMENTATION_EXECUTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "shipmentCode" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierCountry" TEXT NOT NULL,
    "importerName" TEXT,
    "contentRevision" INTEGER NOT NULL DEFAULT 1,
    "submittedRevision" INTEGER,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'AWAITING_DOCUMENTS',
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'NOT_READY',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "unreadablePages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "unreadableReason" TEXT,
    "extractionError" TEXT,
    "extractedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL,
    "validatedJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedField" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "lineIndex" INTEGER,
    "originalValueJson" JSONB,
    "originalRawText" TEXT,
    "confidence" DECIMAL(4,3),
    "presence" "FieldPresence" NOT NULL,
    "pageNumber" INTEGER,
    "source" "FieldSource" NOT NULL,
    "valueJson" JSONB,
    "reviewState" "FieldReviewState" NOT NULL DEFAULT 'UNREVIEWED',
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractedField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldEdit" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "editType" "EditType" NOT NULL,
    "previousJson" JSONB,
    "newJson" JSONB,
    "note" TEXT,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationIssue" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "result" "ValidationResult" NOT NULL,
    "state" "IssueState" NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "contentRevision" INTEGER NOT NULL,
    "comment" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportRecord" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "exportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "ActivityType" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shipmentCode_key" ON "Shipment"("shipmentCode");

-- CreateIndex
CREATE INDEX "Shipment_createdAt_idx" ON "Shipment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_shipmentId_documentType_key" ON "Document"("shipmentId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExtraction_documentId_key" ON "DocumentExtraction"("documentId");

-- CreateIndex
CREATE INDEX "ExtractedField_shipmentId_fieldKey_idx" ON "ExtractedField"("shipmentId", "fieldKey");

-- CreateIndex
CREATE INDEX "ExtractedField_documentId_idx" ON "ExtractedField"("documentId");

-- CreateIndex
CREATE INDEX "FieldEdit_fieldId_idx" ON "FieldEdit"("fieldId");

-- CreateIndex
CREATE INDEX "FieldEdit_shipmentId_idx" ON "FieldEdit"("shipmentId");

-- CreateIndex
CREATE INDEX "ValidationIssue_shipmentId_state_idx" ON "ValidationIssue"("shipmentId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_shipmentId_key" ON "Approval"("shipmentId");

-- CreateIndex
CREATE INDEX "ActivityEvent_shipmentId_createdAt_idx" ON "ActivityEvent"("shipmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldEdit" ADD CONSTRAINT "FieldEdit_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ExtractedField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
