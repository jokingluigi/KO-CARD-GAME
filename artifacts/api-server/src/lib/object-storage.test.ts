import assert from "node:assert/strict";
import test from "node:test";
import {
  CardImageStorage,
  storageProviderName,
} from "./object-storage";

const originalProvider = process.env.STORAGE_PROVIDER;
const originalUrl = process.env.SUPABASE_URL;
const originalSecret = process.env.SUPABASE_SECRET_KEY;
const originalBucket = process.env.SUPABASE_STORAGE_BUCKET;

function restoreEnvironment() {
  if (originalProvider === undefined) delete process.env.STORAGE_PROVIDER;
  else process.env.STORAGE_PROVIDER = originalProvider;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSecret;
  if (originalBucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
  else process.env.SUPABASE_STORAGE_BUCKET = originalBucket;
}

test.afterEach(restoreEnvironment);

test("defaults to the Replit provider for Preview compatibility", () => {
  delete process.env.STORAGE_PROVIDER;
  assert.equal(storageProviderName(), "replit");
  assert.doesNotThrow(() => new CardImageStorage());
});

test("selects Supabase only when explicitly configured", () => {
  process.env.STORAGE_PROVIDER = "supabase";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "server-only-test-key";
  process.env.SUPABASE_STORAGE_BUCKET = "ko-game-assets";
  assert.equal(storageProviderName(), "supabase");
  assert.doesNotThrow(() => new CardImageStorage());
});

test("fails explicitly for an unknown provider", () => {
  process.env.STORAGE_PROVIDER = "filesystem";
  assert.throws(() => storageProviderName(), /STORAGE_PROVIDER must be one of/);
});

test("requires Supabase server configuration when selected", () => {
  process.env.STORAGE_PROVIDER = "supabase";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_STORAGE_BUCKET;
  assert.throws(
    () => new CardImageStorage(),
    /SUPABASE_URL, SUPABASE_SECRET_KEY, and SUPABASE_STORAGE_BUCKET/,
  );
});