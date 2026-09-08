/**
 * واجهة برمجية REST — API-First.
 * كل ما تفعله الواجهة الرسومية متاح هنا، حتى يمكن ربط النظام
 * بأنظمة خارجية (شؤون الموظفين، النظام المالي) دون تعديل.
 */
import type { Repo } from "../data/repo.ts";
import type { Priority, Role, User, WorkType } from "../domain/types.ts";
import {
  ASSET_STATUSES,
  BILLING_BASES,
  CONTRACT_STATUSES,
  INVOICE_STATUSES,
  PRIORITIES,
  ROLE_LABELS,
  TICKET_STATUSES,
  WORK_TYPES,
} from "../domain/types.ts";
import { permissionsOf } from "../domain/rbac.ts";
import { asArray, asNumber, errorJson, json, readBody } from "./respond.ts";
import * as contractsSvc from "../services/contracts.ts";
import * as assetsSvc from "../services/assets.ts";
import * as ticketsSvc from "../services/tickets.ts";
import * as woSvc from "../services/workorders.ts";
import * as invSvc from "../services/invoices.ts";
import * as apprSvc from "../services/approvals.ts";
import * as budgetSvc from "../services/budget.ts";
import * as usersSvc from "../services/users.ts";
import * as auditSvc from "../services/audit.ts";
import { kpis } from "../services/dashboard.ts";

/** يقيّد المورد برؤية ما يخصه فقط */
function supplierScope(user: User): string | undefined {
  return user.roles.includes("supplier") && !user.roles.includes("admin")
    ? user.supplierId
    : undefined;
}

export async function handleApi(
  req: Request,
  url: URL,
  repo: Repo,
  user: User,
): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const seg = path.split("/").filter(Boolean);
  const m = req.method;

  try {
    // ── الملف الشخصي والثوابت ──
    if (path === "/me") {
      return json({
        user: usersSvc.publicUser(user),
        permissions: [...permissionsOf(user.roles)],
        roleLabels: ROLE_LABELS,
      });
    }
    if (path === "/meta") {
      return json({
        priorities: PRIORITIES,
        ticketStatuses: TICKET_STATUSES,
        workTypes: WORK_TYPES,
        assetStatuses: ASSET_STATUSES,
        contractStatuses: CONTRACT_STATUSES,
        invoiceStatuses: INVOICE_STATUSES,
        billingBases: BILLING_BASES,
        roles: ROLE_LABELS,
      });
    }

    // ── لوحة المؤشرات ──
    if (path === "/kpis" && m === "GET") {
      await ticketsSvc.refreshSlaFlags(repo);
      return json(await kpis(repo));
    }

    // ── الموردون ──
    if (seg[0] === "suppliers") {
      if (m === "GET" && seg.length === 1) return json(await contractsSvc.listSuppliers(repo));
      if (m === "GET" && seg.length === 2) {
        return json(await contractsSvc.getSupplier(repo, seg[1]));
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(
          await contractsSvc.createSupplier(repo, user, b as { name: string }),
          201,
        );
      }
    }

    // ── العقود ──
    if (seg[0] === "contracts") {
      if (m === "GET" && seg.length === 1) {
        const scope = supplierScope(user);
        const all = await contractsSvc.listContracts(repo);
        return json(scope ? all.filter((c) => c.supplierId === scope) : all);
      }
      if (m === "GET" && seg.length === 2) {
        return json(await contractsSvc.getContract(repo, seg[1]));
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(
          await contractsSvc.createContract(repo, user, {
            title: String(b.title ?? ""),
            supplierId: String(b.supplierId ?? ""),
            startDate: String(b.startDate ?? ""),
            expiryDate: String(b.expiryDate ?? ""),
            coveredTypes: asArray(b.coveredTypes),
            coveredSites: asArray(b.coveredSites),
            value: asNumber(b.value),
            billingBasis: b.billingBasis as never,
            billingCycle: b.billingCycle as never,
            responseHours: asNumber(b.responseHours, 24),
            penaltyRatePerDay: asNumber(b.penaltyRatePerDay),
            budgetLineId: String(b.budgetLineId ?? ""),
            notes: String(b.notes ?? ""),
          }),
          201,
        );
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "status") {
        const b = await readBody(req);
        return json(await contractsSvc.setContractStatus(repo, user, seg[1], b.status as never));
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "receive") {
        const b = await readBody(req);
        const items = Array.isArray(b.items) ? b.items : [];
        return json(
          await assetsSvc.receiveFromContract(repo, user, seg[1], items as never),
          201,
        );
      }
    }

    // ── أنواع الأصول والمواقع ──
    if (path === "/asset-types" && m === "GET") {
      return json((await repo.assetTypes.list()).sort((a, b) => a.sortOrder - b.sortOrder));
    }
    if (path === "/sites" && m === "GET") {
      return json((await repo.sites.list()).sort((a, b) => a.code.localeCompare(b.code)));
    }

    // ── الأصول ──
    if (seg[0] === "assets") {
      if (m === "GET" && seg.length === 1) {
        return json(
          await assetsSvc.listAssets(repo, {
            typeCode: url.searchParams.get("typeCode") ?? undefined,
            siteCode: url.searchParams.get("siteCode") ?? undefined,
            status: url.searchParams.get("status") ?? undefined,
            q: url.searchParams.get("q") ?? undefined,
          }),
        );
      }
      if (m === "GET" && seg.length === 2) {
        const asset = await assetsSvc.getAsset(repo, decodeURIComponent(seg[1]));
        const type = await assetsSvc.getAssetType(repo, asset.typeCode);
        return json({
          asset,
          type,
          depreciation: assetsSvc.depreciation(asset, type),
          tco: await assetsSvc.totalCostOfOwnership(repo, asset.tag),
          qr: assetsSvc.qrPayload(url.origin, asset.tag),
          tickets: await ticketsSvc.listTickets(repo, { assetTag: asset.tag }),
        });
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(
          await assetsSvc.createAsset(repo, user, {
            typeCode: String(b.typeCode ?? ""),
            name: String(b.name ?? ""),
            siteCode: String(b.siteCode ?? ""),
            manufacturer: String(b.manufacturer ?? ""),
            modelName: String(b.modelName ?? ""),
            serialNumber: String(b.serialNumber ?? ""),
            department: String(b.department ?? ""),
            custodian: String(b.custodian ?? ""),
            acquisitionCost: asNumber(b.acquisitionCost),
            acquisitionDate: b.acquisitionDate ? String(b.acquisitionDate) : undefined,
            attributes: (b.attributes ?? {}) as Record<string, unknown>,
            notes: String(b.notes ?? ""),
          }),
          201,
        );
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "status") {
        const b = await readBody(req);
        return json(
          await assetsSvc.setAssetStatus(repo, user, decodeURIComponent(seg[1]), b.status as never),
        );
      }
    }

    // ── البلاغات ──
    if (seg[0] === "tickets") {
      if (m === "GET" && seg.length === 1) {
        return json(
          await ticketsSvc.listTickets(repo, {
            status: url.searchParams.get("status") ?? undefined,
            siteCode: url.searchParams.get("siteCode") ?? undefined,
            assetTag: url.searchParams.get("assetTag") ?? undefined,
            supplierId: supplierScope(user) ?? url.searchParams.get("supplierId") ?? undefined,
          }),
        );
      }
      if (m === "GET" && seg.length === 2) {
        const t = await ticketsSvc.getTicket(repo, seg[1]);
        return json({
          ticket: t,
          workOrder: t.workOrderRef ? await repo.workOrders.get(t.workOrderRef) : null,
          audit: await auditSvc.trail(repo, "ticket", t.ref),
        });
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(
          await ticketsSvc.createTicket(repo, user, {
            assetTag: String(b.assetTag ?? ""),
            description: String(b.description ?? ""),
            priority: (b.priority as Priority) || undefined,
            requestingDept: b.requestingDept ? String(b.requestingDept) : undefined,
            isPreventive: b.isPreventive === true || b.isPreventive === "true",
          }),
          201,
        );
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "assign") {
        const b = await readBody(req);
        return json(await ticketsSvc.assignTicket(repo, user, seg[1], String(b.assignee ?? "")));
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "status") {
        const b = await readBody(req);
        return json(await ticketsSvc.setTicketStatus(repo, user, seg[1], b.status as never));
      }
    }

    // ── أوامر العمل ──
    if (seg[0] === "work-orders") {
      if (m === "GET" && seg.length === 1) {
        return json(
          await woSvc.listWorkOrders(repo, {
            status: url.searchParams.get("status") ?? undefined,
            supplierId: supplierScope(user) ?? url.searchParams.get("supplierId") ?? undefined,
            assetTag: url.searchParams.get("assetTag") ?? undefined,
          }),
        );
      }
      if (m === "GET" && seg.length === 2) return json(await woSvc.getWorkOrder(repo, seg[1]));
      if (m === "GET" && seg.length === 2 && seg[1] === "billable") {
        return json(await woSvc.billableWorkOrders(repo, supplierScope(user)));
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(
          await woSvc.openWorkOrder(repo, user, {
            ticketRef: String(b.ticketRef ?? ""),
            workType: (b.workType as WorkType) || undefined,
            technician: b.technician ? String(b.technician) : undefined,
          }),
          201,
        );
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "complete") {
        const b = await readBody(req);
        return json(
          await woSvc.completeWorkOrder(repo, user, seg[1], {
            outcome: String(b.outcome ?? ""),
            partsUsed: String(b.partsUsed ?? ""),
            laborHours: asNumber(b.laborHours),
            billableAmount: asNumber(b.billableAmount),
          }),
        );
      }
    }

    // ── الفواتير ──
    if (seg[0] === "invoices") {
      if (m === "GET" && seg.length === 1) {
        return json(
          await invSvc.listInvoices(repo, {
            status: url.searchParams.get("status") ?? undefined,
            supplierId: supplierScope(user) ?? url.searchParams.get("supplierId") ?? undefined,
          }),
        );
      }
      if (m === "GET" && seg.length === 2 && seg[1] === "inbox") {
        return json(await apprSvc.inbox(repo, user));
      }
      if (m === "GET" && seg.length === 2) {
        const inv = await invSvc.getInvoice(repo, seg[1]);
        return json({
          invoice: inv,
          chain: await apprSvc.chainOf(repo, inv.ref),
          match: inv.matchResult ?? await invSvc.threeWayMatch(repo, inv.ref),
          workOrders: await Promise.all(inv.workOrderRefs.map((r) => repo.workOrders.get(r))),
          payment: inv.paymentRef ? await repo.payments.get(inv.paymentRef) : null,
          audit: await auditSvc.trail(repo, "invoice", inv.ref),
        });
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(
          await invSvc.draftFromWorkOrders(repo, user, {
            supplierId: String(b.supplierId ?? ""),
            workOrderRefs: asArray(b.workOrderRefs),
            budgetLineId: b.budgetLineId ? String(b.budgetLineId) : undefined,
            supplierInvoiceNo: String(b.supplierInvoiceNo ?? ""),
          }),
          201,
        );
      }
      if (m === "POST" && seg.length === 2 && seg[1] === "auto") {
        return json(await invSvc.autoInvoice(repo, user), 201);
      }
      if (m === "GET" && seg.length === 3 && seg[2] === "match") {
        return json(await invSvc.threeWayMatch(repo, seg[1]));
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "submit") {
        return json(await apprSvc.submitForApproval(repo, user, seg[1]));
      }
      if (m === "POST" && seg.length === 3 && (seg[2] === "approve" || seg[2] === "reject")) {
        const b = await readBody(req);
        return json(
          await apprSvc.act(
            repo,
            user,
            seg[1],
            seg[2] === "approve" ? "معتمد" : "مرفوض",
            String(b.note ?? ""),
          ),
        );
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "pay") {
        const b = await readBody(req);
        return json(
          await apprSvc.pay(repo, user, seg[1], {
            method: b.method as never,
            bankReference: String(b.bankReference ?? ""),
          }),
        );
      }
    }

    // ── الميزانية ──
    if (seg[0] === "budget") {
      if (m === "GET" && seg.length === 1) {
        const lines = await budgetSvc.listBudgetLines(repo);
        return json(lines.map((l) => ({ ...l, available: budgetSvc.available(l) })));
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(
          await budgetSvc.createBudgetLine(repo, user, {
            id: String(b.id ?? ""),
            name: String(b.name ?? ""),
            fiscalYear: asNumber(b.fiscalYear, new Date().getFullYear()),
            allocated: asNumber(b.allocated),
          }),
          201,
        );
      }
    }

    // ── المستخدمون ──
    if (seg[0] === "users") {
      if (m === "GET" && seg.length === 1) return json(await usersSvc.listUsers(repo, user));
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(
          usersSvc.publicUser(
            await usersSvc.createUser(repo, user, {
              email: String(b.email ?? ""),
              displayName: String(b.displayName ?? ""),
              password: b.password ? String(b.password) : undefined,
              roles: asArray(b.roles) as Role[],
              department: String(b.department ?? ""),
              supplierId: b.supplierId ? String(b.supplierId) : undefined,
            }),
          ),
          201,
        );
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "password") {
        const b = await readBody(req);
        await usersSvc.changePassword(repo, user, seg[1], String(b.password ?? ""));
        return json({ ok: true });
      }
    }

    // ── سجل التدقيق ──
    if (path === "/audit" && m === "GET") {
      const entity = url.searchParams.get("entity");
      const id = url.searchParams.get("id");
      if (entity && id) return json(await auditSvc.trail(repo, entity, id));
      return json(await auditSvc.recent(repo, asNumber(url.searchParams.get("limit"), 100)));
    }

    return json({ error: `مسار غير معروف: ${m} ${url.pathname}` }, 404);
  } catch (err) {
    return errorJson(err);
  }
}
