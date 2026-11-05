/** Existing reward regression suite runs only against a disposable DB. */
import { after } from "node:test";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
const fixture = await startTutorialFixture();
after(() => fixture.close());
await fixture.db
  .update(fixture.schema.packDefinitionsTable)
  .set({ starterRewardQuantity: 1 })
  .where(eq(fixture.schema.packDefinitionsTable.id, "normal-pack"));
await import("../../artifacts/api-server/src/lib/rewards-progress.test.ts");
