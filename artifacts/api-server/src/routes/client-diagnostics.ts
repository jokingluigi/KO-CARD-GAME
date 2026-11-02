import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
const router = Router();
const schema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
  kind: z.enum(["RENDER", "SCRIPT", "NETWORK"]),
  screen: z.enum([
    "HOME",
    "BATTLE",
    "DECKS",
    "COLLECTION",
    "SHOP",
    "REWARDS",
    "ACCOUNT",
    "OTHER",
  ]),
  build: z.string().max(80),
  online: z.boolean(),
  faultType: z
    .enum(["TypeError", "ReferenceError", "RangeError", "SyntaxError", "Other"])
    .default("Other"),
  source: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]{1,100}:\d{1,8}:\d{1,8}$/)
    .optional(),
});
const windows = new Map<string, { at: number; count: number }>();
router.post("/", (req, res) => {
  const input = schema.safeParse(req.body);
  if (!input.success) {
    res.sendStatus(400);
    return;
  }
  const now = Date.now(),
    key = req.ip ?? "unknown";
  if (windows.size >= 2000)
    for (const [k, v] of windows) if (now - v.at > 60000) windows.delete(k);
  const entry = windows.get(key);
  if (entry && now - entry.at < 60000 && entry.count >= 10) {
    res.sendStatus(429);
    return;
  }
  if (!entry || now - entry.at >= 60000) {
    if (windows.size >= 2000) {
      res.sendStatus(429);
      return;
    }
    windows.set(key, { at: now, count: 1 });
  } else entry.count++;
  // No error text, credentials, URLs, query strings, user content or gameplay payloads.
  req.log.error(
    { clientDiagnostic: input.data, receipt: randomUUID() },
    "Client screen failure",
  );
  res.sendStatus(202);
});
export default router;
