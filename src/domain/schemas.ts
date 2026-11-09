import { z } from "zod";

export const shipmentCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(31)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9][A-Z0-9-]{2,30}$/.test(value), {
    message: "Use letters, numbers, and hyphens, such as SHP-24811.",
  });

export const createShipmentSchema = z.object({
  shipmentCode: shipmentCodeSchema,
  supplierName: z.string().trim().min(1, "Enter the supplier name.").max(160),
  supplierCountry: z.string().trim().min(1, "Enter the supplier country.").max(80),
  importerName: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((value) => (value ? value : null)),
});

export const documentTypeSchema = z.enum([
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "BILL_OF_LADING",
]);

export const fieldInputSchema = z.object({
  value: z.string().trim().min(1, "Enter a value."),
  unit: z.string().trim().max(40).nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const confirmFieldSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});

export const manualFieldSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    fieldId: z.string().min(1),
    presence: z.enum(["present", "missing"]),
    value: z.string().trim().max(500).optional(),
    unit: z.string().trim().max(40).nullable().optional(),
    currency: z.string().trim().max(8).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  }),
  z.object({
    action: z.literal("add-line"),
    documentId: z.string().min(1),
  }),
]);

export const approvalSchema = z.object({
  comment: z.string().trim().max(500).nullable().optional(),
});
