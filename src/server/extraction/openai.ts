import OpenAI from "openai";
import { env } from "@/lib/env";
import { extractionJsonSchema } from "@/server/extraction/schema";
import { extractionInstructions } from "@/server/extraction/prompt";
import type { ExtractionInput, ExtractionProvider } from "@/server/extraction/provider";

export class OpenAIExtractionProvider implements ExtractionProvider {
  readonly name = "openai";
  readonly model = env.openAiModel();
  private readonly client: OpenAI;

  constructor() {
    const apiKey = env.openAiKey();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    this.client = new OpenAI({ apiKey, timeout: 120_000 });
  }

  async extract(input: ExtractionInput): Promise<unknown> {
    const encoded = input.bytes.toString("base64");
    const fileContent =
      input.mimeType === "application/pdf"
        ? {
            type: "input_file" as const,
            filename: input.filename,
            file_data: `data:application/pdf;base64,${encoded}`,
          }
        : {
            type: "input_image" as const,
            image_url: `data:${input.mimeType};base64,${encoded}`,
            detail: "high" as const,
          };

    const response = await this.client.responses.create({
      model: this.model,
      store: false,
      instructions: extractionInstructions(input.documentType),
      input: [
        {
          role: "user",
          content: [
            fileContent,
            {
              type: "input_text",
              text: "Extract the attached document. Leave unknown fields missing. Do not guess.",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "customs_document_extraction",
          strict: true,
          schema: extractionJsonSchema,
        },
      },
    });

    const text = response.output_text;
    if (!text) {
      throw new Error("The model returned an empty extraction.");
    }
    return JSON.parse(text) as unknown;
  }
}

export function createExtractionProvider(): ExtractionProvider {
  if (env.aiProvider() !== "openai") {
    throw new Error("The configured AI provider is not available.");
  }
  return new OpenAIExtractionProvider();
}
