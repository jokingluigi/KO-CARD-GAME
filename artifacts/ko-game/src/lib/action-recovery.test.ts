import test from "node:test";
import assert from "node:assert/strict";
import { watchActionAcknowledgement } from "./action-recovery";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("missing acknowledgements request state once, then reconnect, without replaying an action", async () => {
  const events: string[] = [];
  const stop = watchActionAcknowledgement(
    {
      stillPending: () => true,
      resync: () => events.push("resync"),
      reconnect: () => events.push("reconnect"),
    },
    15,
  );
  await wait(55);
  stop();
  assert.deepEqual(events, ["resync", "reconnect"]);
});
test("authoritative recovery prevents reconnect and cleanup cancels both stages", async () => {
  let pending = true;
  const events: string[] = [];
  let stop = watchActionAcknowledgement(
    {
      stillPending: () => pending,
      resync: () => {
        events.push("resync");
        pending = false;
      },
      reconnect: () => events.push("reconnect"),
    },
    15,
  );
  await wait(55);
  stop();
  assert.deepEqual(events, ["resync"]);
  events.length = 0;
  stop = watchActionAcknowledgement(
    {
      stillPending: () => true,
      resync: () => events.push("resync"),
      reconnect: () => events.push("reconnect"),
    },
    15,
  );
  stop();
  await wait(55);
  assert.deepEqual(events, []);
});
