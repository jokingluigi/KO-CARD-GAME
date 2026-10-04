import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
test("socket error reconnects even when close event is delayed; stale events do not replace recovered connection", async () => {
  let source = await readFile(new URL("./online-lobby-client.ts", import.meta.url), "utf8");
  source = source.replace(/import[\s\S]*?from "\.\/online-transport";/, 'const ONLINE_WS_TICKET_PATH="/ticket"; const onlineApiUrl=(p)=>p; const onlineWebSocketUrl=()=>"ws://test";');
  source = source.replace(/import\.meta\.env\.PROD/g, 'false').replace(/import\.meta\.env\.BASE_URL/g, '"/"');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sockets: any[] = []; let retry: (() => void) | undefined;
  class Socket {
    static OPEN = 1; static CONNECTING = 0; readyState = 0; listeners = new Map<string, Function>(); closed = false;
    constructor() { sockets.push(this); }
    addEventListener(type: string, fn: Function) { this.listeners.set(type, fn); }
    close() { this.closed = true; this.readyState = 3; }
    send() {}
    emit(type: string) { if(type === "open") this.readyState = 1; this.listeners.get(type)?.({}); }
  }
  const module = { exports: {} as any };
  new Function('module', 'exports', 'WebSocket', 'window', 'setTimeout', 'clearTimeout', 'console', code)(module, module.exports, Socket, { location: { protocol: 'http:', host: 'test' } }, (fn: () => void) => { retry = fn; return 1; }, () => {}, { info() {} });
  const client = module.exports.getOnlineLobbyClient(); client.connect(); sockets[0].emit('open'); assert.equal(client.state, 'open');
  sockets[0].emit('error'); assert.equal(client.state, 'error'); assert.equal(sockets[0].closed, true); assert.ok(retry);
  retry!(); assert.equal(sockets.length, 2); sockets[1].emit('open'); assert.equal(client.state, 'open');
  sockets[0].emit('close'); assert.equal(client.state, 'open'); client.close();
});
