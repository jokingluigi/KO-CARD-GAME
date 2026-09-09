import { randomUUID } from "node:crypto";
import { type File, Storage } from "@google-cloud/storage";
import sharp from "sharp";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateObjectDir(): string {
  const value = process.env["PRIVATE_OBJECT_DIR"];
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  return value.replace(/\/$/, "");
}

function parseStoragePath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const [, bucketName, ...objectParts] = normalized.split("/");
  if (!bucketName || objectParts.length === 0) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName, objectName: objectParts.join("/") };
}

async function signedPutUrl(bucketName: string, objectName: string) {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error("Failed to generate object upload URL");
  const body = (await response.json()) as { signed_url: string };
  return body.signed_url;
}

export class CardImageStorage {
  async createUpload(extension: string) {
    const assetId = randomUUID();
    const relativePath = `uploads/card-images/${assetId}.${extension}`;
    const { bucketName, objectName } = parseStoragePath(
      `${privateObjectDir()}/${relativePath}`,
    );
    return {
      assetId,
      objectPath: `/objects/${relativePath}`,
      uploadURL: await signedPutUrl(bucketName, objectName),
    };
  }

  file(objectPath: string): File {
    if (!objectPath.startsWith("/objects/uploads/card-images/")) {
      throw new Error("Invalid card image path");
    }
    const relativePath = objectPath.slice("/objects/".length);
    const { bucketName, objectName } = parseStoragePath(
      `${privateObjectDir()}/${relativePath}`,
    );
    return storage.bucket(bucketName).file(objectName);
  }

  async verifyImage(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ): Promise<boolean> {
    const file = this.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return false;
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    if (
      size <= 0 ||
      size > maxBytes ||
      metadata.contentType !== expectedContentType
    ) {
      return false;
    }
    const [buffer] = await file.download();
    try {
      const metadata = await sharp(buffer, {
        failOn: "error",
        limitInputPixels: 40_000_000,
      }).metadata();
      const expectedFormat =
        expectedContentType === "image/png"
          ? "png"
          : expectedContentType === "image/jpeg"
            ? "jpeg"
            : "webp";
      const matches =
        metadata.format === expectedFormat &&
        Boolean(metadata.width) &&
        Boolean(metadata.height);
      if (!matches) return false;
      await sharp(buffer, {
        failOn: "error",
        limitInputPixels: 40_000_000,
      })
        .rotate()
        .toBuffer();
      return true;
    } catch {
      return false;
    }
  }

  async staleUploads(olderThan: Date): Promise<string[]> {
    const { bucketName, objectName } = parseStoragePath(
      `${privateObjectDir()}/uploads/card-images`,
    );
    const [files] = await storage
      .bucket(bucketName)
      .getFiles({ prefix: `${objectName}/` });
    return files
      .filter((file) => {
        const createdAt = file.metadata.timeCreated;
        return createdAt && new Date(createdAt) < olderThan;
      })
      .map((file) => {
        const relative = file.name.slice(
          `${parseStoragePath(privateObjectDir()).objectName}/`.length,
        );
        return `/objects/${relative}`;
      });
  }

  async remove(objectPath: string): Promise<void> {
    await this.file(objectPath).delete({ ignoreNotFound: true });
  }

  async stream(objectPath: string, response: import("express").Response) {
    const file = this.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return false;
    const [metadata] = await file.getMetadata();
    response.setHeader(
      "Content-Type",
      String(metadata.contentType ?? "application/octet-stream"),
    );
    response.setHeader("Cache-Control", "public, max-age=3600");
    if (metadata.size) response.setHeader("Content-Length", String(metadata.size));
    file.createReadStream().pipe(response);
    return true;
  }
}

export class AudioStorage {
  async createUpload(extension: string) {
    const assetId = randomUUID();
    const relativePath = `uploads/audio/${assetId}.${extension}`;
    const { bucketName, objectName } = parseStoragePath(
      `${privateObjectDir()}/${relativePath}`,
    );
    return {
      assetId,
      objectPath: `/objects/${relativePath}`,
      uploadURL: await signedPutUrl(bucketName, objectName),
    };
  }

  file(objectPath: string): File {
    if (!objectPath.startsWith("/objects/uploads/audio/")) {
      throw new Error("Invalid audio path");
    }
    const relativePath = objectPath.slice("/objects/".length);
    const { bucketName, objectName } = parseStoragePath(
      `${privateObjectDir()}/${relativePath}`,
    );
    return storage.bucket(bucketName).file(objectName);
  }

  async verifyAudio(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ): Promise<boolean> {
    const file = this.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return false;
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    return size > 0 &&
      size <= maxBytes &&
      metadata.contentType === expectedContentType;
  }

  async remove(objectPath: string): Promise<void> {
    await this.file(objectPath).delete({ ignoreNotFound: true });
  }

  async save(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
    const file = this.file(objectPath);
    await file.save(buffer, {
      resumable: false,
      metadata: { contentType },
    });
  }

  async stream(objectPath: string, response: import("express").Response) {
    const file = this.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return false;
    const [metadata] = await file.getMetadata();
    response.setHeader(
      "Content-Type",
      String(metadata.contentType ?? "application/octet-stream"),
    );
    response.setHeader("Cache-Control", "public, max-age=3600");
    if (metadata.size) response.setHeader("Content-Length", String(metadata.size));
    file.createReadStream().pipe(response);
    return true;
  }
}