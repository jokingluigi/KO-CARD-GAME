import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { queryRows } from "../lib/usage-statistics-store";
import { Router, type IRouter } from "express";
import { getAuthenticatedUser } from "../lib/auth";
import {
  readUsageStatistics,
  statisticsQuery,
  type StatisticsKind,
} from "../lib/usage-statistics-query";
const router: IRouter = Router();
router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (user.role !== "ADMIN") {
      response.status(403).json({ message: "관리자만 접근할 수 있습니다." });
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    next();
  } catch (error) {
    next(error);
  }
});
// Administrator-only operational verification; no user identities or raw match rows.
router.get("/status", async (_request, response, next) => {
  try {
    const [collection] = await queryRows(
      db,
      sql`SELECT started_at AS "collectionStartedAt",refreshed_at AS "lastAggregatedAt",last_error_at AS "lastErrorAt" FROM usage_collection WHERE id='global'`,
    );
    const [statistics] = await queryRows(
      db,
      sql`SELECT COUNT(*)::int AS tables,COUNT(*) FILTER(WHERE c.relrowsecurity)::int AS protected FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'usage_%'`,
    );
    const sources = await queryRows(
      db,
      sql`SELECT c.relname AS name,c.relrowsecurity AS rls,b.was_enabled AS "previouslyEnabled" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN usage_source_rls_baseline b ON b.table_name=c.relname WHERE n.nspname='public' ORDER BY c.relname`,
    );
    const [failures] = await queryRows(
      db,
      sql`SELECT COUNT(*)::int AS pending FROM usage_collection_failures`,
    );
    response.json({
      ...collection,
      privacy: { statistics, sources },
      failedSources: failures?.pending ?? 0,
    });
  } catch (error) {
    next(error);
  }
});
router.get(["/:kind", "/:kind/:id"], async (request, response, next) => {
  const kind = request.params.kind;
  const id =
    typeof request.params.id === "string" ? request.params.id : undefined;
  if (kind !== "cards" && kind !== "champions") {
    response.status(400).json({ message: "통계 종류를 확인해 주세요." });
    return;
  }
  let query;
  try {
    query = statisticsQuery(request.query);
    if (id && id.length > 200) throw new Error("INVALID_ID");
  } catch {
    response
      .status(400)
      .json({ message: "기간·정렬·페이지·검색 조건을 확인해 주세요." });
    return;
  }
  try {
    const data = await readUsageStatistics(kind as StatisticsKind, query, id);
    if (id && !data.detail) {
      response.status(404).json({ message: "콘텐츠를 찾을 수 없습니다." });
      return;
    }
    response.json(data);
  } catch (error) {
    next(error);
  }
});
export default router;
