import { Injectable, Logger, type MessageEvent, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Client } from "pg";
import { Subject, filter, interval, map, merge, type Observable } from "rxjs";
import { env } from "../../config/env";

const CHANNEL = "notification_created";
/** Proxies close an idle connection: a comment line every 25 s keeps the bell's stream open. */
const KEEPALIVE_MS = 25_000;
const RECONNECT_MS = 5_000;

/**
 * M-14 5.1 · 12.11: the bell updates the moment a notification is written. A database trigger announces every new
 * row (from the API or the worker) on `notification_created` as «userId:id»; this listens once per API process and
 * tells that person's open pages (Server-Sent Events), which then reload their own list. One-way is all the bell
 * needs, so SSE over the same HTTP and cookie instead of a WebSocket server.
 */
@Injectable()
export class NotificationStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("NotificationStream");
  private readonly created = new Subject<{ userId: string; id: string }>();
  private client: Client | null = null;
  private closing = false;
  private retrying = false;

  async onModuleInit() {
    await this.listen();
  }

  async onModuleDestroy() {
    this.closing = true;
    await this.client?.end().catch(() => undefined);
  }

  /** The events for one person's page: «a new notification» and the keep-alive. */
  forUser(userId: string): Observable<MessageEvent> {
    return merge(
      this.created.pipe(filter((n) => n.userId === userId), map((n): MessageEvent => ({ type: "notification", data: { id: n.id } }))),
      interval(KEEPALIVE_MS).pipe(map((): MessageEvent => ({ type: "ping", data: {} }))),
    );
  }

  private async listen() {
    const url = new URL(env.DATABASE_URL);
    url.search = ""; // Prisma's own options (?schema=…) mean nothing to pg
    const client = new Client({ connectionString: url.toString() });
    client.on("notification", (m) => {
      const [userId, id] = (m.payload ?? "").split(":");
      if (m.channel === CHANNEL && userId && id) this.created.next({ userId, id });
    });
    client.on("error", (e) => this.retry(`lost: ${e.message}`));
    client.on("end", () => this.retry("ended"));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.client = client;
    } catch (e) {
      this.retry(`can't listen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** The bell falls back to its slow refresh meanwhile, so a database restart only delays it. */
  private retry(why: string) {
    if (this.closing || this.retrying) return; // «error» and «end» both come for one loss
    this.retrying = true;
    this.log.warn(`${why} · retrying in ${RECONNECT_MS / 1000}s`);
    void this.client?.end().catch(() => undefined);
    this.client = null;
    setTimeout(() => { this.retrying = false; void this.listen(); }, RECONNECT_MS).unref();
  }
}
