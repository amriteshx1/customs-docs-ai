function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

function numberFrom(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  s3Endpoint: () => required("S3_ENDPOINT"),
  s3Region: () => process.env.S3_REGION || "us-east-1",
  s3Bucket: () => required("S3_BUCKET"),
  s3AccessKeyId: () => required("S3_ACCESS_KEY_ID"),
  s3SecretAccessKey: () => required("S3_SECRET_ACCESS_KEY"),
  s3ForcePathStyle: () => process.env.S3_FORCE_PATH_STYLE !== "false",
  aiProvider: () => process.env.AI_PROVIDER || "openai",
  openAiKey: () => process.env.OPENAI_API_KEY || "",
  openAiModel: () => process.env.OPENAI_MODEL || "gpt-4o",
  confidenceThreshold: () => numberFrom("EXTRACTION_CONFIDENCE_THRESHOLD", 0.85),
  maxUploadBytes: () => numberFrom("MAX_UPLOAD_BYTES", 20 * 1024 * 1024),
  authUrl: () => process.env.BETTER_AUTH_URL || "http://localhost:3000",
};
