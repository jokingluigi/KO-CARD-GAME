-- Optional operator audit only. This file was NOT run on production.
-- Run each section with a role permitted to view query statistics.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

-- Locate the statistics extension schema before selecting its views.
SELECT n.nspname AS statistics_schema, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname IN ('pg_stat_statements','pg_stat_statements_info');

-- Unqualified names require the returned schema in search_path.
-- The statistics window is since reset; it is NOT automatically October 9.
SELECT stats_reset FROM pg_stat_statements_info;
SELECT queryid, calls, rows, total_exec_time, mean_exec_time,
       shared_blks_hit, shared_blks_read, left(query,1200) AS query
FROM pg_stat_statements
WHERE query ILIKE '%draft_settings%'
   OR query ILIKE '%draft_sessions%'
   OR query ILIKE '%draft_participants%'
   OR query ILIKE '%pg_advisory_xact_lock%'
   OR query ILIKE '%tower_characters%'
ORDER BY calls DESC LIMIT 30;

-- Bounded live sample: aggregate sizes only, no cards or personal records output.
WITH active AS (
 SELECT DISTINCT session_id FROM draft_participants LIMIT 20
)
SELECT count(*) AS sampled_sessions,
       avg(octet_length(s.snapshot::text))::bigint AS mean_snapshot_json_bytes,
       avg(octet_length(s.state::text))::bigint AS mean_state_json_bytes,
       max(octet_length(s.snapshot::text)) AS max_snapshot_json_bytes
FROM draft_sessions s JOIN active a ON a.session_id=s.id;

SELECT state->>'phase' AS phase, count(*)
FROM draft_sessions s
WHERE EXISTS (SELECT 1 FROM draft_participants p WHERE p.session_id=s.id)
GROUP BY state->>'phase';
COMMIT;
-- No resets, indexes, VACUUM, EXPLAIN ANALYZE, mutations or catalog exports.
