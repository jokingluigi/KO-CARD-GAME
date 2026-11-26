import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { streamAudio } from "./audio-stream";
function output(range?: string) {
  const headers = new Map<string, string>();
  const chunks: Buffer[] = [];
  let status = 200;
  const stream = Object.assign(new PassThrough(), {
    req: Object.assign(new EventEmitter(), { headers: { range } }),
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(value: number) {
      status = value;
      return this;
    },
  });
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  return {
    stream: stream as unknown as import("express").Response,
    headers,
    chunks,
    status: () => status,
  };
}
test("audio sends the first chunk before the upstream file finishes downloading", async () => {
  const out = output();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(new TextEncoder().encode("first"));
    },
  });
  let first!: () => void;
  const received = new Promise<void>((resolve) => {
    first = resolve;
  });
  out.stream.once("data", first);
  const serving = streamAudio(
    "https://private.invalid/audio",
    out.stream,
    async () =>
      new Response(body, { headers: { "Content-Type": "audio/mpeg" } }),
  );
  const deadline = setTimeout(() => first(), 1000);
  try {
    await received;
    assert.equal(Buffer.concat(out.chunks).toString(), "first");
    controller.enqueue(new TextEncoder().encode("-last"));
    controller.close();
    assert.equal(await serving, true);
    assert.equal(Buffer.concat(out.chunks).toString(), "first-last");
  } finally {
    clearTimeout(deadline);
  }
});
test("browser byte ranges and partial content headers survive the proxy", async () => {
  const out = output("bytes=5-8");
  let requested = "";
  await streamAudio(
    "https://private.invalid/audio",
    out.stream,
    async (_url, init) => {
      requested = (init!.headers as Record<string, string>).Range;
      return new Response("part", {
        status: 206,
        headers: {
          "Content-Range": "bytes 5-8/100",
          "Content-Length": "4",
          "Accept-Ranges": "bytes",
          "Content-Type": "audio/mpeg",
        },
      });
    },
  );
  assert.equal(requested, "bytes=5-8");
  assert.equal(out.status(), 206);
  assert.equal(out.headers.get("content-range"), "bytes 5-8/100");
  assert.equal(Buffer.concat(out.chunks).toString(), "part");
});
test("unsatisfiable byte ranges remain 416 and cannot be cached as music", async () => {
  const out = output("bytes=999-");
  await streamAudio(
    "https://private.invalid/audio",
    out.stream,
    async () =>
      new Response(null, {
        status: 416,
        headers: { "Content-Range": "bytes */100" },
      }),
  );
  assert.equal(out.status(), 416);
  assert.equal(out.headers.get("Cache-Control"), "no-store");
});
test("missing audio stays a 404 instead of an empty successful stream", async () => {
  assert.equal(
    await streamAudio(
      "https://private.invalid/audio",
      output().stream,
      async () => new Response(null, { status: 404 }),
    ),
    false,
  );
});
test("disconnect aborts the upstream download", async () => {
  const out = output();
  let signal: AbortSignal | undefined;
  const serving = streamAudio(
    "https://private.invalid/audio",
    out.stream,
    async (_url, init) => {
      signal = init!.signal as AbortSignal;
      out.stream.emit("close");
      throw new DOMException("Closed", "AbortError");
    },
  );
  assert.equal(await serving, true);
  assert.equal(signal?.aborted, true);
});

test('Supabase audio storage authorizes a byte stream without buffering through download()',async()=>{
 const {AudioStorage}=await import('./object-storage');
 const keys=['STORAGE_PROVIDER','SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_STORAGE_BUCKET'];
 const saved=keys.map(key=>process.env[key]);const original=globalThis.fetch;const calls:{url:string;method:string;range:string|null}[]=[];
 try{
  process.env.STORAGE_PROVIDER='supabase';process.env.SUPABASE_URL='https://stream-test.supabase.co';process.env.SUPABASE_SECRET_KEY='server-only-test-key';process.env.SUPABASE_STORAGE_BUCKET='assets';
  globalThis.fetch=async(input,init)=>{const url=String(input),method=init?.method??'GET';calls.push({url,method,range:new Headers(init?.headers).get('range')});if(method==='POST'&&url.includes('/object/sign/'))return new Response(JSON.stringify({signedURL:'/object/sign/assets/uploads/audio/test.mp3?token=test-private-token'}),{headers:{'Content-Type':'application/json'}});return new Response('abc',{status:206,headers:{'Content-Range':'bytes 0-2/100','Content-Length':'3','Content-Type':'audio/mpeg'}});};
  const out=output('bytes=0-2');assert.equal(await new AudioStorage().stream('/objects/uploads/audio/test.mp3',out.stream),true);assert.equal(out.status(),206);assert.equal(Buffer.concat(out.chunks).toString(),'abc');assert.equal(calls.length,2);assert.equal(calls[0].method,'POST');assert.equal(calls[1].range,'bytes=0-2');assert.ok(calls[1].url.includes('token=test-private-token'));assert.ok(![...out.headers.values()].some(v=>v.includes('test-private-token')));
 }finally{globalThis.fetch=original;keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});}
});
test("a listener closing mid-song never leaves an unhandled stream error behind (server crash 2026-11-26)", async () => {
  const out = output("bytes=0-");
  const errors: unknown[] = [];
  const onUncaught = (e: unknown) => errors.push(e);
  process.on("uncaughtException", onUncaught);
  let upstreamSignal: AbortSignal | undefined;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; c.enqueue(new TextEncoder().encode("part")); } });
  try {
    const serving = streamAudio("https://private.invalid/song", out.stream, async (_url, init) => {
      upstreamSignal = (init as RequestInit).signal ?? undefined;
      upstreamSignal?.addEventListener("abort", () => { try { controller.error(upstreamSignal!.reason); } catch { /* 이미 끝남 */ } });
      return new Response(body, { status: 206, headers: { "Content-Type": "audio/mpeg" } });
    });
    await new Promise((r) => setTimeout(r, 20));
    out.stream.destroy(); // 플레이어가 창을 닫음
    assert.equal(await serving, true);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(upstreamSignal?.aborted, true, "Supabase 쪽 전송도 멈춤");
    assert.deepEqual(errors, []);
  } finally {
    process.off("uncaughtException", onUncaught);
  }
});
