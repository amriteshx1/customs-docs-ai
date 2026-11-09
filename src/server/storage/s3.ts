import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

export type StoredObject = {
  body: Buffer;
  contentType: string;
};

export interface StorageAdapter {
  ensureBucket(): Promise<void>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

function client() {
  return new S3Client({
    region: env.s3Region(),
    endpoint: env.s3Endpoint(),
    forcePathStyle: env.s3ForcePathStyle(),
    credentials: {
      accessKeyId: env.s3AccessKeyId(),
      secretAccessKey: env.s3SecretAccessKey(),
    },
  });
}

export class S3Storage implements StorageAdapter {
  private readonly s3 = client();
  private readonly bucket = env.s3Bucket();

  async ensureBucket() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.ensureBucket();
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!result.Body) {
      throw new Error("Stored document is empty.");
    }
    const bytes = await result.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: result.ContentType || "application/octet-stream",
    };
  }

  async delete(key: string) {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

let storage: StorageAdapter | null = null;

export function getStorage() {
  storage ??= new S3Storage();
  return storage;
}
