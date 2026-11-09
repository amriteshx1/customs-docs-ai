import { DOCUMENT_LABEL } from "@/domain/labels";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError, logError } from "@/server/http";
import { getStorage } from "@/server/storage/s3";
import { createExtractionProvider } from "@/server/extraction/openai";
import { fieldsFromExtraction, extractionVersions } from "@/server/extraction/persist";
import { extractionSchema } from "@/server/extraction/schema";
import { bumpRevision, recomputeShipment, rerunValidation } from "@/server/shipments/workflow";

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return "The document could not be read.";
}

export async function beginExtraction(shipmentId: string, actorId: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { documents: true, events: { where: { type: "EXTRACTION_STARTED" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!shipment) throw new HttpError(404, "Shipment not found.");
  if (shipment.documents.length < 3) {
    throw new HttpError(400, "Upload the invoice, packing list, and bill of lading first.");
  }
  const started = shipment.events[0]?.createdAt;
  const busy =
    shipment.processingStatus === "PROCESSING" &&
    started &&
    Date.now() - started.getTime() < 3 * 60 * 1000;
  if (busy) throw new HttpError(409, "Extraction is already running.");

  await prisma.$transaction(async (tx) => {
    await bumpRevision(tx, shipmentId, actorId);
    await tx.document.updateMany({
      where: { shipmentId },
      data: { extractionStatus: "PROCESSING", extractionError: null },
    });
    await tx.activityEvent.create({
      data: { shipmentId, actorId, type: "EXTRACTION_STARTED", payload: {} },
    });
    await recomputeShipment(tx, shipmentId);
  });
}

export async function runExtraction(shipmentId: string, actorId: string) {
  const documents = await prisma.document.findMany({ where: { shipmentId } });
  let provider;
  try {
    provider = createExtractionProvider();
  } catch (error) {
    const message = errorMessage(error);
    await prisma.document.updateMany({
      where: { shipmentId },
      data: { extractionStatus: "FAILED", extractionError: message },
    });
    await prisma.activityEvent.create({
      data: { shipmentId, actorId, type: "EXTRACTION_FAILED", payload: { error: message } },
    });
    await prisma.$transaction(async (tx) => {
      await rerunValidation(tx, shipmentId, actorId);
      await recomputeShipment(tx, shipmentId);
    });
    return;
  }

  for (const document of documents) {
    try {
      await prisma.extractedField.deleteMany({ where: { documentId: document.id } });
      await prisma.documentExtraction.deleteMany({ where: { documentId: document.id } });
      const file = await getStorage().get(document.storageKey);
      const raw = await provider.extract({
        bytes: file.body,
        mimeType: document.mimeType,
        filename: document.originalFileName,
        documentType: document.documentType,
      });
      const parsed = extractionSchema.parse(raw);
      const mapped = fieldsFromExtraction(parsed, document.documentType);
      await prisma.$transaction(async (tx) => {
        await tx.documentExtraction.create({
          data: {
            documentId: document.id,
            schemaVersion: extractionVersions.schemaVersion,
            promptVersion: extractionVersions.promptVersion,
            provider: provider.name,
            model: provider.model,
            rawJson: parsed as Prisma.InputJsonValue,
            validatedJson: parsed as Prisma.InputJsonValue,
          },
        });
        if (mapped.fields.length > 0) {
          await tx.extractedField.createMany({
            data: mapped.fields.map((field) => ({
              shipmentId,
              documentId: document.id,
              fieldKey: field.fieldKey,
              lineIndex: field.lineIndex,
              presence: field.presence,
              source: field.source,
              confidence: field.confidence,
              pageNumber: field.pageNumber,
              originalRawText: field.originalRawText,
              originalValueJson: field.originalValueJson,
              valueJson: field.valueJson,
              reviewState: field.reviewState,
            })),
          });
        }
        await tx.document.update({
          where: { id: document.id },
          data: {
            extractionStatus: mapped.status,
            unreadablePages: mapped.unreadablePages,
            unreadableReason: mapped.unreadableReason,
            extractionError: null,
            extractedAt: new Date(),
          },
        });
        await tx.activityEvent.create({
          data: {
            shipmentId,
            actorId,
            type: mapped.status === "EXTRACTED" ? "EXTRACTION_COMPLETED" : "EXTRACTION_UNREADABLE",
            payload: {
              documentType: document.documentType,
              documentLabel: DOCUMENT_LABEL[document.documentType],
              reason: mapped.unreadableReason,
            },
          },
        });
      });
    } catch (error) {
      logError("Extraction failed", error);
      await prisma.document.update({
        where: { id: document.id },
        data: { extractionStatus: "FAILED", extractionError: errorMessage(error) },
      });
      await prisma.activityEvent.create({
        data: {
          shipmentId,
          actorId,
          type: "EXTRACTION_FAILED",
          payload: {
            documentType: document.documentType,
            documentLabel: DOCUMENT_LABEL[document.documentType],
            error: errorMessage(error),
          },
        },
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await rerunValidation(tx, shipmentId, actorId);
    await recomputeShipment(tx, shipmentId);
  });
}
