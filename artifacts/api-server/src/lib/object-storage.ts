import { randomUUID } from "node:crypto";
import { type File, Storage } from "@google-cloud/storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const SUPPORTED_STORAGE_PROVIDERS = ["replit", "supabase"] as const;
type StorageProviderName = (typeof SUPPORTED_STORAGE_PROVIDERS)[number];

type ExpressResponse = import("express").Response;

type DownloadedObject = {
  buffer: Buffer;
  contentType: string | null;
};

type AssetStorageProvider = {
  createUpload(extension: string, folder: string): Promise<{
    assetId: string;
    objectPath: string;
    uploadURL: string;
  }>;
  verifyImage(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ): Promise<boolean>;
  verifyAudio(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ): Promise<boolean>;
  staleUploads(folder: string, olderThan: Date): Promise<string[]>;
  remove(objectPath: string): Promise<void>;
  stream(objectPath: string, response: ExpressResponse): Promise<boolean>;
  save(objectPath: string, buffer: Buffer, contentType: string): Promise<void>;
};

function configuredStorageProvider(): StorageProviderName {
  const configured = (process.env["STORAGE_PROVIDER"] ?? "replit")
    .trim()
    .toLowerCase();
  if (
    !SUPPORTED_STORAGE_PROVIDERS.includes(
      configured as StorageProviderName,
    )
  ) {
    throw new Error(
      `STORAGE_PROVIDER must be one of: ${SUPPORTED_STORAGE_PROVIDERS.join(", ")}`,
    );
  }
  return configured as StorageProviderName;
}

export function storageProviderName(): StorageProviderName {
  return configuredStorageProvider();
}

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

let replitStorageClient: Storage | null = null;

function replitStorage(): Storage {
  if (!replitStorageClient) {
    replitStorageClient = new Storage({
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
  }
  return replitStorageClient;
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

function objectNameForFolder(objectPath: string, folder: string): string {
  const prefix = `/objects/uploads/${folder}/`;
  if (!objectPath.startsWith(prefix)) {
    throw new Error("Invalid asset path");
  }
  const objectName = objectPath.slice("/objects/".length);
  if (!objectName || objectName.endsWith("/")) {
    throw new Error("Invalid asset path");
  }
  return objectName;
}

function mimeTypeForExtension(objectPath: string): string | null {
  const extension = objectPath.toLowerCase().split(".").pop();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "ogg") return "audio/ogg";
  if (extension === "wav") return "audio/wav";
  return null;
}

async function verifyImageBuffer(
  buffer: Buffer,
  expectedContentType: string,
  maxBytes: number,
  actualContentType: string | null,
): Promise<boolean> {
  if (
    buffer.length <= 0 ||
    buffer.length > maxBytes ||
    (actualContentType && actualContentType !== expectedContentType)
  ) {
    return false;
  }

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
    if (
      metadata.format !== expectedFormat ||
      !metadata.width ||
      !metadata.height
    ) {
      return false;
    }
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

class ReplitAssetStorageProvider implements AssetStorageProvider {
  private file(objectPath: string, folder: string): File {
    const objectName = objectNameForFolder(objectPath, folder);
    const path = parseStoragePath(`${privateObjectDir()}/${objectName}`);
    return replitStorage().bucket(path.bucketName).file(path.objectName);
  }

  async createUpload(extension: string, folder: string) {
    const assetId = randomUUID();
    const relativePath = `uploads/${folder}/${assetId}.${extension}`;
    const path = parseStoragePath(`${privateObjectDir()}/${relativePath}`);
    return {
      assetId,
      objectPath: `/objects/${relativePath}`,
      uploadURL: await signedPutUrl(path.bucketName, path.objectName),
    };
  }

  async download(
    objectPath: string,
    folder: string,
  ): Promise<DownloadedObject | null> {
    const file = this.file(objectPath, folder);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();
    return {
      buffer,
      contentType: metadata.contentType ?? null,
    };
  }

  async verifyImage(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ): Promise<boolean> {
    const folder = objectPath.split("/")[3] ?? "";
    const downloaded = await this.download(objectPath, folder);
    return downloaded
      ? verifyImageBuffer(
          downloaded.buffer,
          expectedContentType,
          maxBytes,
          downloaded.contentType,
        )
      : false;
  }

  async verifyAudio(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ): Promise<boolean> {
    const folder = objectPath.split("/")[3] ?? "";
    const downloaded = await this.download(objectPath, folder);
    return Boolean(
      downloaded &&
        downloaded.buffer.length > 0 &&
        downloaded.buffer.length <= maxBytes &&
        downloaded.contentType === expectedContentType,
    );
  }

  async staleUploads(folder: string, olderThan: Date): Promise<string[]> {
    const { bucketName, objectName } = parseStoragePath(
      `${privateObjectDir()}/uploads/${folder}`,
    );
    const [files] = await replitStorage()
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
    const folder = objectPath.split("/")[3] ?? "";
    await this.file(objectPath, folder).delete({ ignoreNotFound: true });
  }

  async stream(objectPath: string, response: ExpressResponse): Promise<boolean> {
    const folder = objectPath.split("/")[3] ?? "";
    const file = this.file(objectPath, folder);
    const [exists] = await file.exists();
    if (!exists) return false;
    const [metadata] = await file.getMetadata();
    response.setHeader(
      "Content-Type",
      String(metadata.contentType ?? "application/octet-stream"),
    );
    response.setHeader("Cache-Control", "public, max-age=86400");
    if (metadata.size) response.setHeader("Content-Length", String(metadata.size));
    file.createReadStream().pipe(response);
    return true;
  }

  async save(
    objectPath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const folder = objectPath.split("/")[3] ?? "";
    await this.file(objectPath, folder).save(buffer, {
      resumable: false,
      metadata: { contentType },
    });
  }
}

let supabaseStorageClient:
  { client: SupabaseClient; bucket: string; configKey: string } | null = null;

function supabaseStorage(): { client: SupabaseClient; bucket: string } {
  const url = process.env["SUPABASE_URL"];
  const secretKey = process.env["SUPABASE_SECRET_KEY"];
  const bucket = process.env["SUPABASE_STORAGE_BUCKET"];
  if (!url || !secretKey || !bucket) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_SECRET_KEY, and SUPABASE_STORAGE_BUCKET are required when STORAGE_PROVIDER=supabase",
    );
  }
  const configKey = `${url}\u0000${bucket}\u0000${secretKey}`;
  const cached = supabaseStorageClient as {
    client: SupabaseClient;
    bucket: string;
    configKey: string;
  } | null;
  if (cached && cached.configKey === configKey) {
    return cached;
  }
  supabaseStorageClient = {
    client: createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }),
    bucket,
    configKey,
  };
  return supabaseStorageClient;
}

class SupabaseAssetStorageProvider implements AssetStorageProvider {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    const storage = supabaseStorage();
    this.client = storage.client;
    this.bucket = storage.bucket;
  }

  private objectName(objectPath: string, folder: string): string {
    return objectNameForFolder(objectPath, folder);
  }

  private async download(
    objectPath: string,
    folder: string,
  ): Promise<DownloadedObject | null> {
    const objectName = this.objectName(objectPath, folder);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(objectName);
    if (error) {
      if (String(error.statusCode) === "404" || /not found/i.test(error.message)) {
        return null;
      }
      throw new Error(`Supabase Storage download failed: ${error.message}`);
    }
    if (!data) return null;
    return {
      buffer: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || mimeTypeForExtension(objectPath),
    };
  }

  async createUpload(extension: string, folder: string) {
    const assetId = randomUUID();
    const relativePath = `uploads/${folder}/${assetId}.${extension}`;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(relativePath, { upsert: false });
    if (error || !data?.signedUrl) {
      throw new Error(
        `Failed to generate Supabase upload URL: ${error?.message ?? "missing signed URL"}`,
      );
    }
    return {
      assetId,
      objectPath: `/objects/${relativePath}`,
      uploadURL: data.signedUrl,
    };
  }

  async verifyImage(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ): Promise<boolean> {
    const folder = objectPath.split("/")[3] ?? "";
    const downloaded = await this.download(objectPath, folder);
    return downloaded
      ? verifyImageBuffer(
          downloaded.buffer,
          expectedContentType,
          maxBytes,
          downloaded.contentType,
        )
      : false;
  }

  async verifyAudio(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ): Promise<boolean> {
    const folder = objectPath.split("/")[3] ?? "";
    const downloaded = await this.download(objectPath, folder);
    return Boolean(
      downloaded &&
        downloaded.buffer.length > 0 &&
        downloaded.buffer.length <= maxBytes &&
        downloaded.contentType === expectedContentType,
    );
  }

  async staleUploads(folder: string, olderThan: Date): Promise<string[]> {
    const prefix = `uploads/${folder}`;
    const stale: string[] = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
      const { data, error } = await this.client.storage
        .from(this.bucket)
        .list(prefix, { limit, offset, sortBy: { column: "created_at", order: "asc" } });
      if (error) {
        throw new Error(`Supabase Storage listing failed: ${error.message}`);
      }
      if (!data || data.length === 0) break;
      for (const item of data) {
        if (item.name && item.created_at && new Date(item.created_at) < olderThan) {
          stale.push(`/objects/${prefix}/${item.name}`);
        }
      }
      if (data.length < limit) break;
      offset += data.length;
    }
    return stale;
  }

  async remove(objectPath: string): Promise<void> {
    const folder = objectPath.split("/")[3] ?? "";
    const objectName = this.objectName(objectPath, folder);
    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([objectName]);
    if (error && !/not found/i.test(error.message)) {
      throw new Error(`Supabase Storage delete failed: ${error.message}`);
    }
  }

  async stream(objectPath: string, response: ExpressResponse): Promise<boolean> {
    const folder = objectPath.split("/")[3] ?? "";
    const downloaded = await this.download(objectPath, folder);
    if (!downloaded) return false;
    response.setHeader(
      "Content-Type",
      downloaded.contentType ?? "application/octet-stream",
    );
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.setHeader("Content-Length", String(downloaded.buffer.length));
    response.end(downloaded.buffer);
    return true;
  }

  async save(
    objectPath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const folder = objectPath.split("/")[3] ?? "";
    const objectName = this.objectName(objectPath, folder);
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(objectName, buffer, { contentType, upsert: false });
    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }
  }
}

function createAssetStorageProvider(): AssetStorageProvider {
  return configuredStorageProvider() === "supabase"
    ? new SupabaseAssetStorageProvider()
    : new ReplitAssetStorageProvider();
}

class ImageAssetStorage {
  private readonly provider = createAssetStorageProvider();

  constructor(private readonly folder: string) {}

  createUpload(extension: string) {
    return this.provider.createUpload(extension, this.folder);
  }

  verifyImage(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ) {
    return this.provider.verifyImage(objectPath, expectedContentType, maxBytes);
  }

  staleUploads(olderThan: Date) {
    return this.provider.staleUploads(this.folder, olderThan);
  }

  remove(objectPath: string) {
    return this.provider.remove(objectPath);
  }

  stream(objectPath: string, response: ExpressResponse) {
    return this.provider.stream(objectPath, response);
  }
}

export class CardImageStorage extends ImageAssetStorage {
  constructor() {
    super("card-images");
  }
}

export class BackgroundImageStorage extends ImageAssetStorage {
  constructor() {
    super("game-backgrounds");
  }
}

class AudioAssetStorage {
  private readonly provider = createAssetStorageProvider();

  constructor(private readonly folder: string) {}

  createUpload(extension: string) {
    return this.provider.createUpload(extension, this.folder);
  }

  verifyAudio(
    objectPath: string,
    expectedContentType: string,
    maxBytes: number,
  ) {
    return this.provider.verifyAudio(objectPath, expectedContentType, maxBytes);
  }

  remove(objectPath: string) {
    return this.provider.remove(objectPath);
  }

  save(objectPath: string, buffer: Buffer, contentType: string) {
    return this.provider.save(objectPath, buffer, contentType);
  }

  stream(objectPath: string, response: ExpressResponse) {
    return this.provider.stream(objectPath, response);
  }
}

export class AudioStorage extends AudioAssetStorage {
  constructor() {
    super("audio");
  }
}

export class GameBgmStorage extends AudioAssetStorage {
  constructor() {
    super("game-bgm");
  }
}

export class GameAttackStorage extends AudioAssetStorage {
  constructor() {
    super("game-attack");
  }
}
