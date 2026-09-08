/** مصنع المستودع — يختار المشغّل بحسب متغيّر البيئة DB_DRIVER. */
import { config } from "../config.ts";
import type { Repo } from "./repo.ts";
import { KvRepo } from "./kv.ts";

let cached: Repo | null = null;

export async function openRepo(opts?: { driver?: string; url?: string; kvPath?: string }): Promise<Repo> {
  const driver = opts?.driver ?? config.dbDriver;
  if (driver === "postgres") {
    const url = opts?.url ?? config.databaseUrl;
    if (!url) throw new Error("DATABASE_URL مطلوب عند DB_DRIVER=postgres");
    const { PostgresRepo } = await import("./postgres.ts");
    return await PostgresRepo.open(url);
  }
  return await KvRepo.open(opts?.kvPath ?? config.kvPath);
}

/** مستودع مفرد لعمر العملية — تستخدمه طبقة HTTP. */
export async function getRepo(): Promise<Repo> {
  if (!cached) cached = await openRepo();
  return cached;
}

export function setRepo(r: Repo | null): void {
  cached = r;
}

export type { Repo };
