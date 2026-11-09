import type { DocumentType } from "@/domain/types";

export type ExtractionInput = {
  bytes: Buffer;
  mimeType: string;
  filename: string;
  documentType: DocumentType;
};

export interface ExtractionProvider {
  readonly name: string;
  readonly model: string;
  extract(input: ExtractionInput): Promise<unknown>;
}
