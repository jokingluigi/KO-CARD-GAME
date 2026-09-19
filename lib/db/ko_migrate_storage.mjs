import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { Storage } from "@google-cloud/storage";
import { createClient } from "@supabase/supabase-js";

const { Client } = pg;
const APPLY = process.env.APPLY_STORAGE_MIGRATION === "YES";
const SOURCE_URL = process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
const MANIFEST_PATH = process.env.STORAGE_MIGRATION_MANIFEST ??
  "lib/db/storage-migration-manifest.json";
const ALLOWED_PREFIXES = [
  "/objects/uploads/card-images/",
  "/objects/uploads/game-backgrounds/",
  "/objects/uploads/game-bgm/",
  "/objects/uploads/game-attack/",
  "/objects/uploads/audio/",
];

if (!SOURCE_URL) {
  throw new Error("SOURCE_DATABASE_URL 또는 DATABASE_URL이 없습니다.");
}

const sourceUrl = new URL(SOURCE_URL);
if (!sourceUrl.hostname.includes("helium")) {
  throw new Error(`SOURCE가 helium이 아닙니다: ${sourceUrl.hostname}`);
}

const source = new Client({ connectionString: SOURCE_URL });
const targetConfigured = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SECRET_KEY &&
  process.env.SUPABASE_STORAGE_BUCKET,
);

if (APPLY && !targetConfigured) {
  throw new Error(
    "실제 storage migration에는 SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_STORAGE_BUCKET이 필요합니다.",
  );
}

const target = targetConfigured
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    )
  : null;
const targetBucket = process.env.SUPABASE_STORAGE_BUCKET;

function parseStoragePath(value) {
  const normalized = value.startsWith("/") ? value : `/${value}`;
  const [, bucketName, ...objectParts] = normalized.split("/");
  if (!bucketName || objectParts.length === 0) {
    throw new Error(`잘못된 storage 경로입니다: ${value}`);
  }
  return { bucketName, objectName: objectParts.join("/") };
}

function privateObjectDir() {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR가 없습니다.");
  return value.replace(/\/$/, "");
}

function sourceStorage() {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: "http://127.0.0.1:1106/token",
      type: "external_account",
      credential_source: {
        url: "http://127.0.0.1:1106/credential",
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
}

const sourceGcs = sourceStorage();

function sourceFile(assetId) {
  const { bucketName, objectName } = parseStoragePath(
    `${privateObjectDir()}/${assetId.slice("/objects/".length)}`,
  );
  return sourceGcs.bucket(bucketName).file(objectName);
}

function contentTypeFor(assetId) {
  const extension = assetId.toLowerCase().split(".").pop();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "ogg") return "audio/ogg";
  if (extension === "wav") return "audio/wav";
  return "application/octet-stream";
}

function checksum(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function validAssetId(assetId) {
  return typeof assetId === "string" &&
    ALLOWED_PREFIXES.some((prefix) => assetId.startsWith(prefix));
}

function addReference(references, assetId, table, column, rowId) {
  if (!validAssetId(assetId)) return;
  const existing = references.get(assetId);
  if (existing) {
    existing.references.push({ table, column, rowId });
    return;
  }
  references.set(assetId, {
    assetId,
    destinationPath: assetId.slice("/objects/".length),
    references: [{ table, column, rowId }],
  });
}

async function collectReferences() {
  const references = new Map();
  const queries = [
    ["cards", "image_asset_id"],
    ["champions", "image_asset_id"],
    ["champions", "quest_completed_portrait_asset_id"],
    ["card_frame_definitions", "frame_asset_id"],
    ["game_media", "asset_id"],
  ];

  for (const [table, column] of queries) {
    const result = await source.query(
      `select id, ${column} as asset_id from "${table}" where ${column} is not null`,
    );
    for (const row of result.rows) {
      addReference(references, row.asset_id, table, column, row.id);
    }
  }
  return [...references.values()].sort((left, right) =>
    left.assetId.localeCompare(right.assetId),
  );
}

async function readSourceAsset(assetId) {
  const file = sourceFile(assetId);
  const [exists] = await file.exists();
  if (!exists) return { status: "MISSING_SOURCE" };
  const [metadata] = await file.getMetadata();
  const [buffer] = await file.download();
  return {
    status: "SOURCE_READY",
    contentType: metadata.contentType || contentTypeFor(assetId),
    size: buffer.length,
    checksum: checksum(buffer),
    buffer,
  };
}

async function readTargetAsset(destinationPath) {
  if (!target || !targetBucket) return { status: "TARGET_NOT_CONFIGURED" };
  const { data, error } = await target.storage
    .from(targetBucket)
    .download(destinationPath);
  if (error) {
    if (error.statusCode === 404 || /not found/i.test(error.message)) {
      return { status: "MISSING_DESTINATION" };
    }
    return { status: "TARGET_READ_ERROR", error: error.message };
  }
  if (!data) return { status: "MISSING_DESTINATION" };
  const buffer = Buffer.from(await data.arrayBuffer());
  return {
    status: "DESTINATION_READY",
    size: buffer.length,
    checksum: checksum(buffer),
  };
}

async function migrateReference(reference) {
  const manifest = {
    assetId: reference.assetId,
    destinationPath: reference.destinationPath,
    references: reference.references,
  };
  const sourceAsset = await readSourceAsset(reference.assetId);
  if (sourceAsset.status !== "SOURCE_READY") {
    return { ...manifest, status: sourceAsset.status };
  }

  const { buffer, ...sourceMetadata } = sourceAsset;
  Object.assign(manifest, {
    source: sourceMetadata,
    destination: targetBucket ?? null,
  });

  if (!targetConfigured) {
    return { ...manifest, status: "TARGET_NOT_CONFIGURED" };
  }

  const existing = await readTargetAsset(reference.destinationPath);
  if (existing.status === "TARGET_READ_ERROR") {
    return { ...manifest, status: existing.status, error: existing.error };
  }
  if (existing.status === "DESTINATION_READY") {
    if (
      existing.size === sourceMetadata.size &&
      existing.checksum === sourceMetadata.checksum
    ) {
      return { ...manifest, status: "SKIP_EXISTING_MATCH", destination: existing };
    }
    return { ...manifest, status: "DESTINATION_CONFLICT", destination: existing };
  }

  if (!APPLY) {
    return { ...manifest, status: "WOULD_UPLOAD" };
  }

  const { error } = await target.storage
    .from(targetBucket)
    .upload(reference.destinationPath, buffer, {
      contentType: sourceMetadata.contentType,
      upsert: false,
    });
  if (error) {
    return { ...manifest, status: "UPLOAD_FAILED", error: error.message };
  }

  const uploaded = await readTargetAsset(reference.destinationPath);
  if (
    uploaded.status !== "DESTINATION_READY" ||
    uploaded.size !== sourceMetadata.size ||
    uploaded.checksum !== sourceMetadata.checksum
  ) {
    return {
      ...manifest,
      status: "DESTINATION_VERIFY_FAILED",
      destination: uploaded,
    };
  }
  return { ...manifest, status: "UPLOADED", destination: uploaded };
}

async function writeManifest(entries) {
  const outputPath = path.resolve(process.cwd(), MANIFEST_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({
      mode: APPLY ? "APPLY" : "DRY_RUN",
      source: sourceUrl.hostname,
      destinationBucket: targetBucket ?? null,
      generatedAt: new Date().toISOString(),
      entries,
    }, null, 2)}\n`,
  );
  return outputPath;
}

async function main() {
  await source.connect();
  try {
    const references = await collectReferences();
    const entries = [];
    for (const reference of references) {
      const entry = await migrateReference(reference);
      entries.push(entry);
      console.log(`${entry.status}: ${entry.assetId}`);
    }

    const manifestPath = await writeManifest(entries);
    const counts = Object.fromEntries(
      [...new Set(entries.map((entry) => entry.status))].map((status) => [
        status,
        entries.filter((entry) => entry.status === status).length,
      ]),
    );
    console.log(JSON.stringify({
      mode: APPLY ? "APPLY" : "DRY_RUN",
      uniqueAssets: entries.length,
      counts,
      manifestPath,
      targetConfigured,
    }, null, 2));
  } finally {
    await source.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("\nSTORAGE MIGRATION FAILED:", error.message);
  process.exitCode = 1;
});