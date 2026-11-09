import { DOCUMENT_LABEL } from "@/domain/labels";
import type { DocumentType } from "@/domain/types";
import { EXTRACTION_PROMPT_VERSION } from "@/domain/types";

export { EXTRACTION_PROMPT_VERSION };

export function extractionInstructions(documentType: DocumentType) {
  return `You extract one customs document for a freight forwarder. The file was uploaded as a ${DOCUMENT_LABEL[documentType]}.

Return only the JSON schema. Do not invent values. Do not calculate a missing total. Do not reconcile this file with any other document. Do not use outside knowledge of the shipper.

For every field:
- presence "present" only when the value is clearly printed. Include confidence from 0 to 1, the 1-based page, and the printed text in rawText.
- presence "missing" when the field is not on the document. value and confidence must be null.
- presence "unreadable" when a value appears to be present but cannot be read. value and confidence must be null. Include the page and a short reason.
- If the file is blank, illegible, or not a readable document, set unreadable to true, explain why in unreadableReason, and do not invent field values.
- Readable dates must be ISO YYYY-MM-DD. If you cannot convert the printed date confidently, mark the date unreadable.
- Readable currency must be an ISO 4217 code.
- Numbers are JSON numbers. Put the printed unit on weight, quantity, and package fields. Put the currency code on money fields.
- Container numbers are the identifiers printed on the document, one string each.
- Line items are only the rows actually printed. Use an empty array when the document has no line items.`;
}
