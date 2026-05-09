import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Logger } from '../logger.js';

interface Entry {
  transport: StreamableHTTPServerTransport;
  timer: NodeJS.Timeout;
}

export class SessionRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly idleTtlMs: number, private readonly logger?: Logger) {}

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
      // Don't let a transport-close failure trip the process-level unhandledRejection handler.
      entry.transport.close().catch((err) => {
        this.logger?.warn('failed to close evicted transport', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.idleTtlMs);
    timer.unref?.();
    return timer;
  }
}
