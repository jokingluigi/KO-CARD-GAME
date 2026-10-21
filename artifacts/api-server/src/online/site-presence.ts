/** One API process, shared with the existing lobby. No database/Reatime polling. */
export class SitePresence {
  private users = new Map<string, Set<{ send: (online: boolean) => void }>>();
  private last = new WeakMap<object, boolean>();
  hasUser(userId:string) { return this.users.has(userId); }
  add(userId: string, connection: { send: (online: boolean) => void }) {
    const connections = this.users.get(userId) ?? new Set();
    connections.add(connection); this.users.set(userId, connections); this.publish();
    let detached = false;
    return () => {
      if (detached) return; detached = true;
      connections.delete(connection);
      if (!connections.size) this.users.delete(userId);
      this.publish();
    };
  }
  private publish() {
    const others = this.users.size > 1;
    for (const connections of this.users.values()) for (const c of connections) {
      if (this.last.get(c) === others) continue;
      this.last.set(c, others); c.send(others);
    }
  }
}
export const sitePresence = new SitePresence();
