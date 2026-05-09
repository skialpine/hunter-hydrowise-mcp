import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

interface Entry {
  transport: StreamableHTTPServerTransport;
  timer: NodeJS.Timeout;
}

export class SessionRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly idleTtlMs: number) {}

  get(sessionId: string): StreamableHTTPServerTransport | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;
    this.touch(sessionId);
    return entry.transport;
  }

  has(sessionId: string): boolean {
    return this.entries.has(sessionId);
  }

  register(sessionId: string, transport: StreamableHTTPServerTransport): void {
    if (this.entries.has(sessionId)) return;
    const timer = this.makeTimer(sessionId);
    this.entries.set(sessionId, { transport, timer });
  }

  touch(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.timer = this.makeTimer(sessionId);
  }

  delete(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.entries.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    const transports = Array.from(this.entries.values());
    for (const entry of this.entries.values()) clearTimeout(entry.timer);
    this.entries.clear();
    await Promise.allSettled(transports.map(({ transport }) => transport.close()));
  }

  private makeTimer(sessionId: string): NodeJS.Timeout {
    const timer = setTimeout(() => {
      const entry = this.entries.get(sessionId);
      if (!entry) return;
      this.entries.delete(sessionId);
      void entry.transport.close();
    }, this.idleTtlMs);
    timer.unref?.();
    return timer;
  }
}
