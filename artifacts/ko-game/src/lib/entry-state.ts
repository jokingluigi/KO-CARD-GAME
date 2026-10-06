import type { ServerStatus } from './startup-client';

/** A pending/failed probe is not maintenance. The API remains authoritative. */
export function isMaintenanceBlocked(status: ServerStatus | null): boolean {
  return status?.enabled === true && status.allowed === false;
}
