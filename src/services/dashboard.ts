/** لوحات قياس الأداء — مؤشرات الإدارة العليا. */
import type { Repo } from "../data/repo.ts";
import { available } from "./budget.ts";
import { depreciation } from "./assets.ts";

export interface Kpis {
  assets: { total: number; inService: number; underMaintenance: number; bookValue: number };
  tickets: {
    open: number;
    breached: number;
    closedThisMonth: number;
    avgCloseHours: number | null;
    byPriority: Record<string, number>;
  };
  workOrders: { open: number; completed: number; awaitingInvoice: number };
  finance: {
    draft: number;
    inApproval: number;
    approvedUnpaid: number;
    approvedUnpaidValue: number;
    paidValue: number;
  };
  budget: { allocated: number; committed: number; spent: number; available: number };
  contracts: { live: number; expiringIn60Days: number };
  topFaultyAssets: { tag: string; name: string; tickets: number }[];
}

export async function kpis(repo: Repo): Promise<Kpis> {
  const [assets, types, tickets, wos, invoices, lines, contracts] = await Promise.all([
    repo.assets.list(),
    repo.assetTypes.list(),
    repo.tickets.list(),
    repo.workOrders.list(),
    repo.invoices.list(),
    repo.budgetLines.list(),
    repo.contracts.list(),
  ]);

  const typeMap = new Map(types.map((t) => [t.code, t]));
  let bookValue = 0;
  for (const a of assets) {
    const t = typeMap.get(a.typeCode);
    bookValue += t ? depreciation(a, t).bookValue : a.acquisitionCost;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const closed = tickets.filter((t) => t.status === "مغلق" && t.closedDate);
  const closedThisMonth = closed.filter((t) => (t.closedDate ?? "") >= monthStart);
  const durations = closed.map((t) =>
    (new Date(t.closedDate!).getTime() - new Date(t.createdAt).getTime()) / 3600_000
  );

  const byPriority: Record<string, number> = {};
  for (const t of tickets) {
    if (t.status === "مغلق" || t.status === "ملغى") continue;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
  }

  const faultCount = new Map<string, number>();
  for (const t of tickets) faultCount.set(t.assetTag, (faultCount.get(t.assetTag) ?? 0) + 1);
  const assetMap = new Map(assets.map((a) => [a.tag, a]));
  const topFaultyAssets = [...faultCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, n]) => ({ tag, name: assetMap.get(tag)?.name ?? tag, tickets: n }));

  const in60 = new Date(now.getTime() + 60 * 24 * 3600_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const approvedUnpaid = invoices.filter((i) => i.status === "معتمدة");

  return {
    assets: {
      total: assets.length,
      inService: assets.filter((a) => a.status === "في الخدمة").length,
      underMaintenance: assets.filter((a) => a.status === "تحت الصيانة").length,
      bookValue: round2(bookValue),
    },
    tickets: {
      open: tickets.filter((t) => t.status !== "مغلق" && t.status !== "ملغى").length,
      breached: tickets.filter((t) => t.slaBreached && t.status !== "ملغى").length,
      closedThisMonth: closedThisMonth.length,
      avgCloseHours: durations.length
        ? round2(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      byPriority,
    },
    workOrders: {
      open: wos.filter((w) => w.status === "مفتوح" || w.status === "قيد التنفيذ").length,
      completed: wos.filter((w) => w.status === "منجز فنياً" || w.status === "مغلق").length,
      awaitingInvoice:
        wos.filter((w) =>
          w.status === "منجز فنياً" && !w.invoiceRef && !w.underContract && w.billableAmount > 0
        ).length,
    },
    finance: {
      draft: invoices.filter((i) => i.status === "مسودة").length,
      inApproval: invoices.filter((i) => i.status === "قيد الاعتماد").length,
      approvedUnpaid: approvedUnpaid.length,
      approvedUnpaidValue: round2(approvedUnpaid.reduce((s, i) => s + i.grandTotal, 0)),
      paidValue: round2(
        invoices.filter((i) => i.status === "مصروفة").reduce((s, i) => s + i.grandTotal, 0),
      ),
    },
    budget: {
      allocated: round2(lines.reduce((s, l) => s + l.allocated, 0)),
      committed: round2(lines.reduce((s, l) => s + l.committed, 0)),
      spent: round2(lines.reduce((s, l) => s + l.spent, 0)),
      available: round2(lines.reduce((s, l) => s + available(l), 0)),
    },
    contracts: {
      live: contracts.filter((c) => c.status === "ساري").length,
      expiringIn60Days:
        contracts.filter((c) =>
          c.status === "ساري" && c.expiryDate.slice(0, 10) >= today &&
          c.expiryDate.slice(0, 10) <= in60
        ).length,
    },
    topFaultyAssets,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
