/** سجل التدقيق — كل تغيّر حالة جوهري يُسجَّل هنا ولا يُحذف. */
import type { Repo } from "../data/repo.ts";
import type { AuditEntry } from "../domain/types.ts";

export async function log(
  repo: Repo,
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  detail = "",
): Promise<void> {
  const at = new Date().toISOString();
  const entry: AuditEntry = {
    id: `${at}-${crypto.randomUUID().slice(0, 8)}`,
    at,
    actor,
    action,
    entity,
    entityId,
    detail,
  };
  await repo.audit.put(entry.id, entry);
}

export async function trail(repo: Repo, entity: string, entityId: string): Promise<AuditEntry[]> {
  const all = await repo.audit.list();
  return all
    .filter((e) => e.entity === entity && e.entityId === entityId)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export async function recent(repo: Repo, limit = 100): Promise<AuditEntry[]> {
  const all = await repo.audit.list();
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
