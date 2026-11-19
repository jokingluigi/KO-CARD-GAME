/** Fixed-purpose monitor for our one API. Never accepts SQL, URLs or cron from callers. */
export const KEEPALIVE_JOB = "ko-card-game-render-keepalive-v1";
export const KEEPALIVE_URL = "https://ko-card-game.onrender.com/api/healthz";
export const KEEPALIVE_SCHEDULE = "*/5 * * * *";
export interface MonitorConnection {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, any>[] }>;
}
export async function keepaliveStatus(connection: MonitorConnection) {
  const extensions = (await connection.query(`SELECT a.name, e.extversion AS installed
    FROM pg_available_extensions a LEFT JOIN pg_extension e ON e.extname=a.name
    WHERE a.name IN ('pg_cron','pg_net') ORDER BY a.name`)).rows;
  const installed = (name: string) => extensions.some(e => e.name === name && e.installed);
  const job = installed('pg_cron') ? (await connection.query(
    'SELECT jobid,schedule,active FROM cron.job WHERE jobname=$1 AND username=current_user', [KEEPALIVE_JOB])).rows[0] ?? null : null;
  const tables = (await connection.query(`SELECT to_regclass('ko_render_keepalive.requests') AS requests,
    to_regclass('net._http_response') AS responses`)).rows[0];
  const requests = tables?.requests && tables?.responses ? (await connection.query(`
    SELECT r.request_id,r.requested_at,h.status_code,h.timed_out,
      CASE WHEN h.error_msg IS NOT NULL THEN true ELSE false END AS failed
    FROM ko_render_keepalive.requests r LEFT JOIN net._http_response h ON h.id=r.request_id
    ORDER BY r.requested_at DESC LIMIT 10`)).rows : [];
  const runs = job ? (await connection.query(`SELECT status,start_time,end_time
    FROM cron.job_run_details WHERE jobid=$1 ORDER BY runid DESC LIMIT 5`, [job.jobid])).rows : [];
  return { url: KEEPALIVE_URL, extensions, job, runs, requests };
}
export async function configureKeepalive(connection: MonitorConnection, enabled: boolean) {
  await connection.query('BEGIN');
  try {
    await connection.query("SET LOCAL statement_timeout='15s'");
    await connection.query("SELECT pg_advisory_xact_lock(hashtext('ko-render-keepalive-config'))");
    if (enabled) {
      const available = (await connection.query("SELECT name FROM pg_available_extensions WHERE name IN ('pg_cron','pg_net')")).rows;
      if (available.length !== 2) throw new Error('SCHEDULER_UNAVAILABLE');
      await connection.query('CREATE EXTENSION IF NOT EXISTS pg_cron');
      await connection.query('CREATE EXTENSION IF NOT EXISTS pg_net');
      await connection.query('CREATE SCHEMA IF NOT EXISTS ko_render_keepalive');
      await connection.query('REVOKE ALL ON SCHEMA ko_render_keepalive FROM PUBLIC');
      await connection.query(`CREATE TABLE IF NOT EXISTS ko_render_keepalive.requests (
        request_id bigint PRIMARY KEY, requested_at timestamptz NOT NULL DEFAULT now())`);
      await connection.query('REVOKE ALL ON ko_render_keepalive.requests FROM PUBLIC');
      // One tiny public GET per five minutes, independent of Render's Node process.
      // No tokens, player data, response bodies, or changes to game tables.
      const command = `INSERT INTO ko_render_keepalive.requests(request_id)
        SELECT net.http_get(url := '${KEEPALIVE_URL}',
          params := jsonb_build_object('keepalive',extract(epoch from clock_timestamp())::bigint),
          headers := '{"Cache-Control":"no-cache","User-Agent":"KO-CARD-GAME-keepalive"}'::jsonb,
          timeout_milliseconds := 60000);
        DELETE FROM ko_render_keepalive.requests WHERE requested_at < now()-interval '1 day';
        DELETE FROM cron.job_run_details WHERE jobid=(SELECT jobid FROM cron.job
          WHERE jobname='${KEEPALIVE_JOB}' AND username=current_user)
          AND end_time < now()-interval '7 days';`;
      await connection.query('SELECT cron.schedule($1,$2,$3)', [KEEPALIVE_JOB, KEEPALIVE_SCHEDULE, command]);
    } else {
      const installed = (await connection.query("SELECT 1 FROM pg_extension WHERE extname='pg_cron'")).rows.length;
      if (installed) await connection.query(`SELECT cron.unschedule(jobid) FROM cron.job
        WHERE jobname=$1 AND username=current_user`, [KEEPALIVE_JOB]);
    }
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  }
}
