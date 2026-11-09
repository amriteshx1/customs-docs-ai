import { z } from "zod";

const presenceSchema = z.enum(["present", "missing", "unreadable"]);

function refinePresence(
  data: { presence: "present" | "missing" | "unreadable"; value: unknown; confidence: number | null },
  ctx: z.RefinementCtx,
) {
  if (data.presence === "present") {
    if (data.value === null || data.value === undefined) {
      ctx.addIssue({ code: "custom", message: "A present field needs a value.", path: ["value"] });
    }
    if (data.confidence === null) {
      ctx.addIssue({ code: "custom", message: "A present field needs a confidence score.", path: ["confidence"] });
    }
    return;
  }
  if (data.value !== null || data.confidence !== null) {
    ctx.addIssue({
      code: "custom",
      message: "Missing and unreadable fields cannot include a value or a confidence score.",
      path: ["value"],
    });
  }
}

const stringFieldSchema = z
  .object({
    presence: presenceSchema,
    value: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    page: z.number().int().nullable(),
    rawText: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .superRefine(refinePresence);

const numberFieldSchema = z
  .object({
    presence: presenceSchema,
    value: z.number().finite().nullable(),
    unit: z.string().nullable(),
    currency: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    page: z.number().int().nullable(),
    rawText: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .superRefine(refinePresence);

const listFieldSchema = z
  .object({
    presence: presenceSchema,
    value: z.array(z.string()).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    page: z.number().int().nullable(),
    rawText: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    refinePresence(data, ctx);
    if (data.presence === "present" && data.value && data.value.length === 0) {
      ctx.addIssue({ code: "custom", message: "A present list needs at least one value.", path: ["value"] });
    }
  });

const lineItemSchema = z.object({
  description: stringFieldSchema,
  hsnCode: stringFieldSchema,
  quantity: numberFieldSchema,
  unitPrice: numberFieldSchema,
  lineTotal: numberFieldSchema,
});

export const extractionSchema = z.object({
  documentType: z.enum(["commercial_invoice", "packing_list", "bill_of_lading"]),
  unreadable: z.boolean(),
  unreadableReason: z.string().nullable(),
  unreadablePages: z.array(z.number().int()).max(50),
  parties: z.object({
    importer: stringFieldSchema,
    exporter: stringFieldSchema,
    consignee: stringFieldSchema,
    notifyParty: stringFieldSchema,
  }),
  invoice: z.object({
    number: stringFieldSchema,
    date: stringFieldSchema,
    currency: stringFieldSchema,
    incoterm: stringFieldSchema,
    totalAmount: numberFieldSchema,
  }),
  lineItems: z.array(lineItemSchema).max(100),
  packing: z.object({
    packageCount: numberFieldSchema,
    packageType: stringFieldSchema,
    grossWeight: numberFieldSchema,
    netWeight: numberFieldSchema,
    containerNumbers: listFieldSchema,
  }),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;
export type ExtractedScalar =
  | z.infer<typeof stringFieldSchema>
  | z.infer<typeof numberFieldSchema>
  | z.infer<typeof listFieldSchema>;

function nullable(type: Record<string, unknown>) {
  return { anyOf: [type, { type: "null" }] };
}

function stringFieldJson() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      presence: { type: "string", enum: ["present", "missing", "unreadable"] },
      value: nullable({ type: "string" }),
      confidence: nullable({ type: "number" }),
      page: nullable({ type: "integer" }),
      rawText: nullable({ type: "string" }),
      reason: nullable({ type: "string" }),
    },
    required: ["presence", "value", "confidence", "page", "rawText", "reason"],
  };
}

function numberFieldJson() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      presence: { type: "string", enum: ["present", "missing", "unreadable"] },
      value: nullable({ type: "number" }),
      unit: nullable({ type: "string" }),
      currency: nullable({ type: "string" }),
      confidence: nullable({ type: "number" }),
      page: nullable({ type: "integer" }),
      rawText: nullable({ type: "string" }),
      reason: nullable({ type: "string" }),
    },
    required: ["presence", "value", "unit", "currency", "confidence", "page", "rawText", "reason"],
  };
}

function listFieldJson() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      presence: { type: "string", enum: ["present", "missing", "unreadable"] },
      value: nullable({ type: "array", items: { type: "string" } }),
      confidence: nullable({ type: "number" }),
      page: nullable({ type: "integer" }),
      rawText: nullable({ type: "string" }),
      reason: nullable({ type: "string" }),
    },
    required: ["presence", "value", "confidence", "page", "rawText", "reason"],
  };
}

const lineJson = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: stringFieldJson(),
    hsnCode: stringFieldJson(),
    quantity: numberFieldJson(),
    unitPrice: numberFieldJson(),
    lineTotal: numberFieldJson(),
  },
  required: ["description", "hsnCode", "quantity", "unitPrice", "lineTotal"],
};

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentType: { type: "string", enum: ["commercial_invoice", "packing_list", "bill_of_lading"] },
    unreadable: { type: "boolean" },
    unreadableReason: nullable({ type: "string" }),
    unreadablePages: { type: "array", items: { type: "integer" } },
    parties: {
      type: "object",
      additionalProperties: false,
      properties: {
        importer: stringFieldJson(),
        exporter: stringFieldJson(),
        consignee: stringFieldJson(),
        notifyParty: stringFieldJson(),
      },
      required: ["importer", "exporter", "consignee", "notifyParty"],
    },
    invoice: {
      type: "object",
      additionalProperties: false,
      properties: {
        number: stringFieldJson(),
        date: stringFieldJson(),
        currency: stringFieldJson(),
        incoterm: stringFieldJson(),
        totalAmount: numberFieldJson(),
      },
      required: ["number", "date", "currency", "incoterm", "totalAmount"],
    },
    lineItems: { type: "array", items: lineJson },
    packing: {
      type: "object",
      additionalProperties: false,
      properties: {
        packageCount: numberFieldJson(),
        packageType: stringFieldJson(),
        grossWeight: numberFieldJson(),
        netWeight: numberFieldJson(),
        containerNumbers: listFieldJson(),
      },
      required: ["packageCount", "packageType", "grossWeight", "netWeight", "containerNumbers"],
    },
  },
  required: ["documentType", "unreadable", "unreadableReason", "unreadablePages", "parties", "invoice", "lineItems", "packing"],
} as const;
