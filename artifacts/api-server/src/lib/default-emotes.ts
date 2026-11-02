import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
/** Lazy permanent ownership: no bulk account rewrite and no automatic equipment changes. */
export async function ensureDefaultEmotes(
  userId: string,
  executor: Pick<typeof db, "execute"> = db,
) {
  await executor.execute(sql`
    INSERT INTO user_cosmetics (user_id, cosmetic_id, acquisition_source)
    SELECT u.id, c.id, 'DEFAULT_EMOTE'
    FROM users u CROSS JOIN cosmetic_items c
    WHERE u.id = ${userId} AND c.type = 'IMAGE_EMOTE' AND c.is_active = true
      AND jsonb_typeof(c.image_assets -> '__defaultGrant') = 'string'
      AND c.image_assets ->> '__defaultGrant' = 'true'
      AND jsonb_typeof(c.image_assets -> 'art') = 'string'
      AND coalesce(c.image_assets ->> 'art', '') <> ''
      AND NOT EXISTS (SELECT 1 FROM user_cosmetics o WHERE o.user_id = u.id AND o.cosmetic_id = c.id)
    ON CONFLICT (user_id, cosmetic_id) DO NOTHING
  `);
}
