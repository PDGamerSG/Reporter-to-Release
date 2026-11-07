import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { digest } from "../domain/airlock";
import { DomainError, emptyLedger, type Ledger } from "../domain/workflow";

export interface Snapshot { version: number; ledger: Ledger }
export interface Store { read(key: string): Promise<Snapshot>; compareAndSwap(key: string, version: number, ledger: Ledger): Promise<boolean> }
export class MemoryStore implements Store {
  private data = new Map<string, Snapshot>();
  async read(key: string): Promise<Snapshot> { return structuredClone(this.data.get(key) ?? { version: 0, ledger: emptyLedger() }); }
  async compareAndSwap(key: string, version: number, ledger: Ledger): Promise<boolean> {
    if ((this.data.get(key)?.version ?? 0) !== version) return false;
    this.data.set(key, structuredClone({ version: version + 1, ledger })); return true;
  }
}

const locks = new Map<string, Promise<void>>();
class FileStore implements Store {
  private path(key: string) { return join(process.cwd(), ".data", `${digest(key)}.json`); }
  async read(key: string): Promise<Snapshot> {
    try { return JSON.parse(await readFile(this.path(key), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 0, ledger: emptyLedger() }; throw error; }
  }
  async compareAndSwap(key: string, version: number, ledger: Ledger): Promise<boolean> {
    const previous = locks.get(key) ?? Promise.resolve();
    let unlock!: () => void;
    const pending = new Promise<void>(resolve => { unlock = resolve; });
    locks.set(key, pending); await previous;
    try {
      if ((await this.read(key)).version !== version) return false;
      await mkdir(join(process.cwd(), ".data"), { recursive: true });
      const temporary = `${this.path(key)}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: version + 1, ledger }), { mode: 0o600 });
      await rename(temporary, this.path(key)); return true;
    } finally { unlock(); if (locks.get(key) === pending) locks.delete(key); }
  }
}

export class PostgresStore implements Store {
  private sql;
  constructor(url: string) { this.sql = neon(url); }
  async read(key: string): Promise<Snapshot> {
    const rows = await this.sql`SELECT version, document FROM r2r_ledgers WHERE workspace = ${key}`;
    if (!rows.length) return { version: 0, ledger: emptyLedger() };
    return { version: Number(rows[0].version), ledger: rows[0].document as Ledger };
  }
  async compareAndSwap(key: string, version: number, ledger: Ledger): Promise<boolean> {
    const expiry = key.startsWith("demo:") ? new Date(Date.now() + 86400000).toISOString() : null;
    const document = JSON.stringify(ledger);
    const rows = version === 0
      ? await this.sql`INSERT INTO r2r_ledgers (workspace, version, document, expires_at) VALUES (${key}, 1, ${document}::jsonb, ${expiry}::timestamptz) ON CONFLICT (workspace) DO NOTHING RETURNING version`
      : await this.sql`UPDATE r2r_ledgers SET version = version + 1, document = ${document}::jsonb, updated_at = now(), expires_at = ${expiry}::timestamptz WHERE workspace = ${key} AND version = ${version} RETURNING version`;
    return rows.length === 1;
  }
}

let singleton: Store | undefined;
export function getStore(): Store {
  if (singleton) return singleton;
  if (process.env.DATABASE_URL) return singleton = new PostgresStore(process.env.DATABASE_URL);
  if (process.env.VERCEL) throw new Error("DATABASE_URL is required on Vercel; ephemeral storage is disabled.");
  return singleton = new FileStore();
}
export async function mutate<T>(store: Store, key: string, change: (ledger: Ledger) => T): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const snapshot = await store.read(key);
    const next = structuredClone(snapshot.ledger);
    const result = change(next); next.revision = snapshot.version + 1;
    if (await store.compareAndSwap(key, snapshot.version, next)) return structuredClone(result);
    await new Promise(resolve => setTimeout(resolve, Math.min(5 * 2 ** attempt, 100)));
  }
  throw new DomainError("The workspace is busy. Retry this change.", 503);
}
