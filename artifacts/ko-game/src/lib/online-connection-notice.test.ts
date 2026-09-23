import assert from "node:assert/strict";
import test from "node:test";
import { onlineConnectionNotice } from "./online-connection-notice";

test("B1/B2/B3/B4/B5/B6/B7/B8: connected snapshots and normal actions never look like reconnects", () => {
  assert.equal(onlineConnectionNotice(null, "CONNECTED"), null);
  let previous: "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED" = "CONNECTED";
  for (const normalUpdate of [
    "CONNECTED",
    "CONNECTED",
    "CONNECTED",
    "CONNECTED",
    "CONNECTED",
    "CONNECTED",
    "CONNECTED",
  ] as const) {
    assert.equal(onlineConnectionNotice(previous, normalUpdate), null);
    previous = normalUpdate;
  }
});

test("B9/B10/B11/B12: only a confirmed disconnect followed by reconnect creates one notice", () => {
  assert.equal(onlineConnectionNotice("CONNECTED", "DISCONNECTED_GRACE"), "OPPONENT_DISCONNECTED");
  assert.equal(onlineConnectionNotice("DISCONNECTED_GRACE", "DISCONNECTED_GRACE"), null);
  assert.equal(onlineConnectionNotice("DISCONNECTED_GRACE", "CONNECTED"), "OPPONENT_RECONNECTED");
  assert.equal(onlineConnectionNotice("CONNECTED", "CONNECTED"), null);
  assert.equal(onlineConnectionNotice("FORFEITED", "CONNECTED"), null);
});