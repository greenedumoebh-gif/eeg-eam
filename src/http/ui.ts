/** مسارات الواجهة الرسومية. */
import type { Repo } from "../data/repo.ts";
import type { Priority, Role, User, WorkType } from "../domain/types.ts";
import { permissionsOf } from "../domain/rbac.ts";
import { statusOf } from "../domain/errors.ts";
import { asArray, asNumber, html, readBody, redirect } from "./respond.ts";
import * as V from "./views/pages.ts";
import * as contractsSvc from "../services/contracts.ts";
import * as assetsSvc from "../services/assets.ts";
import * as ticketsSvc from "../services/tickets.ts";
import * as woSvc from "../services/workorders.ts";
import * as invSvc from "../services/invoices.ts";
import * as apprSvc from "../services/approvals.ts";
import * as budgetSvc from "../services/budget.ts";
import * as auditSvc from "../services/audit.ts";
import { kpis } from "../services/dashboard.ts";

function flash(url: URL): { kind: "ok" | "err"; text: string } | null {
  const ok = url.searchParams.get("ok");
  const err = url.searchParams.get("err");
  if (ok) return { kind: "ok", text: ok };
  if (err) return { kind: "err", text: err };
  return null;
}

function back(path: string, err: unknown): Response {
  const msg = err instanceof Error ? err.message : String(err);
  const sep = path.includes("?") ? "&" : "?";
  return redirect(`${path}${sep}err=${encodeURIComponent(msg)}`);
}

function withFlash(body: string, url: URL): string {
  const f = flash(url);
  if (!f) return body;
  return body.replace("<main>", `<main><div class="msg ${f.kind}">${escapeHtml(f.text)}</div>`);
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function handleUi(
  req: Request,
  url: URL,
  repo: Repo,
  user: User,
): Promise<Response> {
  const path = url.pathname;
  const seg = path.split("/").filter(Boolean);
  const m = req.method;
  const perms = permissionsOf(user.roles);

  try {
    // ── لوحة المؤشرات ──
    if (path === "/" && m === "GET") {
      await ticketsSvc.refreshSlaFlags(repo);
      return html(withFlash(V.dashboardPage(user, await kpis(repo)), url));
    }

    // ── الأصول ──
    if (path === "/assets" && m === "GET") {
      const filter = {
        q: url.searchParams.get("q") ?? "",
        typeCode: url.searchParams.get("typeCode") ?? "",
        siteCode: url.searchParams.get("siteCode") ?? "",
        status: url.searchParams.get("status") ?? "",
      };
      const [assets, types, sites] = await Promise.all([
        assetsSvc.listAssets(repo, filter),
        repo.assetTypes.list(),
        repo.sites.list(),
      ]);
      types.sort((a, b) => a.sortOrder - b.sortOrder);
      sites.sort((a, b) => a.code.localeCompare(b.code));
      return html(
        withFlash(V.assetsPage(user, assets, types, sites, filter, perms.has("asset:write")), url),
      );
    }

    if (path === "/assets/new" && m === "GET") {
      const types = (await repo.assetTypes.list()).sort((a, b) => a.sortOrder - b.sortOrder);
      const sites = (await repo.sites.list()).sort((a, b) => a.code.localeCompare(b.code));
      const code = url.searchParams.get("typeCode");
      const selected = code ? types.find((t) => t.code === code) : undefined;
      return html(withFlash(V.newAssetPage(user, types, sites, selected), url));
    }

    if (path === "/assets/new" && m === "POST") {
      const b = await readBody(req);
      const attributes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) {
        if (k.startsWith("attr_") && v !== "") attributes[k.slice(5)] = v;
      }
      try {
        const asset = await assetsSvc.createAsset(repo, user, {
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
          warrantyEnd: b.warrantyEnd ? String(b.warrantyEnd) : undefined,
          notes: String(b.notes ?? ""),
          attributes,
        });
        return redirect(
          `/assets/${encodeURIComponent(asset.tag)}?ok=${encodeURIComponent("تم تسجيل الأصل")}`,
        );
      } catch (err) {
        return back(`/assets/new?typeCode=${encodeURIComponent(String(b.typeCode ?? ""))}`, err);
      }
    }

    // /a/<tag> — رابط ملصق QR المختصر
    if (seg[0] === "a" && seg.length === 2 && m === "GET") {
      return redirect(`/assets/${encodeURIComponent(decodeURIComponent(seg[1]))}`);
    }

    if (seg[0] === "assets" && seg.length === 2 && m === "GET") {
      const tag = decodeURIComponent(seg[1]);
      const asset = await assetsSvc.getAsset(repo, tag);
      const type = await assetsSvc.getAssetType(repo, asset.typeCode);
      const site = await repo.sites.get(asset.siteCode);
      return html(withFlash(
        V.assetDetailPage(
          user,
          asset,
          type,
          site,
          assetsSvc.depreciation(asset, type),
          await assetsSvc.totalCostOfOwnership(repo, tag),
          await ticketsSvc.listTickets(repo, { assetTag: tag }),
          assetsSvc.qrPayload(url.origin, tag),
          perms.has("ticket:create"),
        ),
        url,
      ));
    }

    // ── البلاغات ──
    if (path === "/tickets" && m === "GET") {
      const scope = user.roles.includes("supplier") && !user.roles.includes("admin")
        ? user.supplierId
        : undefined;
      const tickets = await ticketsSvc.listTickets(repo, { supplierId: scope });
      return html(withFlash(V.ticketsPage(user, tickets, perms.has("ticket:create")), url));
    }

    if (path === "/tickets/new" && m === "POST") {
      const b = await readBody(req);
      try {
        const t = await ticketsSvc.createTicket(repo, user, {
          assetTag: String(b.assetTag ?? ""),
          description: String(b.description ?? ""),
          priority: (b.priority as Priority) || undefined,
          requestingDept: b.requestingDept ? String(b.requestingDept) : undefined,
        });
        return redirect(
          `/tickets/${encodeURIComponent(t.ref)}?ok=${encodeURIComponent("تم فتح البلاغ")}`,
        );
      } catch (err) {
        return back(`/assets/${encodeURIComponent(String(b.assetTag ?? ""))}`, err);
      }
    }

    if (seg[0] === "tickets" && seg.length === 2 && m === "GET") {
      const t = await ticketsSvc.getTicket(repo, decodeURIComponent(seg[1]));
      const contract = t.contractId ? await repo.contracts.get(t.contractId) : null;
      return html(withFlash(
        V.ticketDetailPage(
          user,
          t,
          await repo.assets.get(t.assetTag),
          contract,
          contract ? await repo.suppliers.get(contract.supplierId) : null,
          t.workOrderRef ? await repo.workOrders.get(t.workOrderRef) : null,
          await auditSvc.trail(repo, "ticket", t.ref),
          perms as Set<string>,
        ),
        url,
      ));
    }

    if (seg[0] === "tickets" && seg.length === 3 && seg[2] === "close" && m === "POST") {
      const ref = decodeURIComponent(seg[1]);
      try {
        await ticketsSvc.setTicketStatus(repo, user, ref, "مغلق");
        return redirect(
          `/tickets/${encodeURIComponent(ref)}?ok=${encodeURIComponent("تم إغلاق البلاغ")}`,
        );
      } catch (err) {
        return back(`/tickets/${encodeURIComponent(ref)}`, err);
      }
    }

    // ── أوامر العمل ──
    if (path === "/work-orders" && m === "GET") {
      const scope = user.roles.includes("supplier") && !user.roles.includes("admin")
        ? user.supplierId
        : undefined;
      return html(withFlash(
        V.workOrdersPage(user, await woSvc.listWorkOrders(repo, { supplierId: scope })),
        url,
      ));
    }

    if (path === "/work-orders/new" && m === "POST") {
      const b = await readBody(req);
      const ticketRef = String(b.ticketRef ?? "");
      try {
        await woSvc.openWorkOrder(repo, user, {
          ticketRef,
          workType: (b.workType as WorkType) || undefined,
          technician: b.technician ? String(b.technician) : undefined,
        });
        return redirect(
          `/tickets/${encodeURIComponent(ticketRef)}?ok=${encodeURIComponent("تم فتح أمر العمل")}`,
        );
      } catch (err) {
        return back(`/tickets/${encodeURIComponent(ticketRef)}`, err);
      }
    }

    if (seg[0] === "work-orders" && seg.length === 3 && seg[2] === "complete" && m === "POST") {
      const ref = decodeURIComponent(seg[1]);
      const b = await readBody(req);
      try {
        const wo = await woSvc.completeWorkOrder(repo, user, ref, {
          outcome: String(b.outcome ?? ""),
          partsUsed: String(b.partsUsed ?? ""),
          laborHours: asNumber(b.laborHours),
          billableAmount: asNumber(b.billableAmount),
        });
        return redirect(
          `/tickets/${encodeURIComponent(wo.ticketRef)}?ok=${
            encodeURIComponent("تم اعتماد الإنجاز الفني")
          }`,
        );
      } catch (err) {
        const wo = await repo.workOrders.get(ref);
        return back(`/tickets/${encodeURIComponent(wo?.ticketRef ?? "")}`, err);
      }
    }

    if (seg[0] === "work-orders" && seg.length === 2 && m === "GET") {
      const wo = await woSvc.getWorkOrder(repo, decodeURIComponent(seg[1]));
      return html(withFlash(V.workOrderDetailPage(user, wo, perms as Set<string>), url));
    }

    // ── الفواتير ──
    if (path === "/invoices" && m === "GET") {
      const scope = user.roles.includes("supplier") && !user.roles.includes("admin")
        ? user.supplierId
        : undefined;
      const [invoices, billable, suppliers, inbox] = await Promise.all([
        invSvc.listInvoices(repo, { supplierId: scope }),
        woSvc.billableWorkOrders(repo, scope),
        contractsSvc.listSuppliers(repo),
        apprSvc.inbox(repo, user),
      ]);
      return html(withFlash(
        V.invoicesPage(user, invoices, billable, suppliers, inbox, perms as Set<string>),
        url,
      ));
    }

    if (path === "/invoices/new" && m === "POST") {
      const b = await readBody(req);
      try {
        const inv = await invSvc.draftFromWorkOrders(repo, user, {
          supplierId: String(b.supplierId ?? ""),
          workOrderRefs: asArray(b.workOrderRefs),
          supplierInvoiceNo: String(b.supplierInvoiceNo ?? ""),
        });
        return redirect(
          `/invoices/${encodeURIComponent(inv.ref)}?ok=${
            encodeURIComponent("تم إنشاء مسودة الفاتورة")
          }`,
        );
      } catch (err) {
        return back("/invoices", err);
      }
    }

    if (path === "/invoices/auto" && m === "POST") {
      try {
        const made = await invSvc.autoInvoice(repo, user);
        return redirect(
          `/invoices?ok=${encodeURIComponent(`تم إنشاء ${made.length} فاتورة آلياً`)}`,
        );
      } catch (err) {
        return back("/invoices", err);
      }
    }

    if (seg[0] === "invoices" && seg.length === 3 && m === "POST") {
      const ref = decodeURIComponent(seg[1]);
      const dest = `/invoices/${encodeURIComponent(ref)}`;
      try {
        if (seg[2] === "submit") {
          await apprSvc.submitForApproval(repo, user, ref);
          return redirect(`${dest}?ok=${encodeURIComponent("تم تقديم الفاتورة للاعتماد")}`);
        }
        if (seg[2] === "act") {
          const b = await readBody(req);
          const decision = b.decision === "reject" ? "مرفوض" : "معتمد";
          await apprSvc.act(repo, user, ref, decision as "معتمد" | "مرفوض", String(b.note ?? ""));
          return redirect(`${dest}?ok=${encodeURIComponent(`تم تسجيل قرارك: ${decision}`)}`);
        }
        if (seg[2] === "pay") {
          const b = await readBody(req);
          const { payment } = await apprSvc.pay(repo, user, ref, {
            method: b.method as never,
            bankReference: String(b.bankReference ?? ""),
          });
          return redirect(`${dest}?ok=${encodeURIComponent(`تم الصرف بالسند ${payment.ref}`)}`);
        }
      } catch (err) {
        return back(dest, err);
      }
    }

    if (seg[0] === "invoices" && seg.length === 2 && m === "GET") {
      const ref = decodeURIComponent(seg[1]);
      const inv = await invSvc.getInvoice(repo, ref);
      return html(withFlash(
        V.invoiceDetailPage(
          user,
          inv,
          await repo.suppliers.get(inv.supplierId),
          await apprSvc.chainOf(repo, ref),
          await invSvc.threeWayMatch(repo, ref),
          await Promise.all(inv.workOrderRefs.map((r) => repo.workOrders.get(r))),
          inv.paymentRef ? await repo.payments.get(inv.paymentRef) : null,
          await repo.budgetLines.get(inv.budgetLineId),
          await auditSvc.trail(repo, "invoice", ref),
          perms as Set<string>,
          await apprSvc.currentStep(repo, ref),
        ),
        url,
      ));
    }

    // ── العقود والموردون ──
    if (path === "/contracts" && m === "GET") {
      const scope = user.roles.includes("supplier") && !user.roles.includes("admin")
        ? user.supplierId
        : undefined;
      const all = await contractsSvc.listContracts(repo);
      const [suppliers, types, lines] = await Promise.all([
        contractsSvc.listSuppliers(repo),
        repo.assetTypes.list(),
        budgetSvc.listBudgetLines(repo),
      ]);
      types.sort((a, b) => a.sortOrder - b.sortOrder);
      return html(withFlash(
        V.contractsPage(
          user,
          scope ? all.filter((c) => c.supplierId === scope) : all,
          suppliers,
          types,
          lines,
          perms.has("contract:write"),
        ),
        url,
      ));
    }

    if (path === "/suppliers/new" && m === "POST") {
      const b = await readBody(req);
      try {
        await contractsSvc.createSupplier(repo, user, {
          name: String(b.name ?? ""),
          commercialReg: String(b.commercialReg ?? ""),
          contactName: String(b.contactName ?? ""),
          email: String(b.email ?? ""),
          phone: String(b.phone ?? ""),
        });
        return redirect(`/contracts?ok=${encodeURIComponent("تم تسجيل المورد")}`);
      } catch (err) {
        return back("/contracts", err);
      }
    }

    if (path === "/contracts/new" && m === "POST") {
      const b = await readBody(req);
      try {
        const c = await contractsSvc.createContract(repo, user, {
          title: String(b.title ?? ""),
          supplierId: String(b.supplierId ?? ""),
          startDate: String(b.startDate ?? ""),
          expiryDate: String(b.expiryDate ?? ""),
          coveredTypes: asArray(b.coveredTypes),
          value: asNumber(b.value),
          billingBasis: b.billingBasis as never,
          responseHours: asNumber(b.responseHours, 24),
          penaltyRatePerDay: asNumber(b.penaltyRatePerDay),
          budgetLineId: String(b.budgetLineId ?? ""),
        });
        return redirect(
          `/contracts/${encodeURIComponent(c.id)}?ok=${encodeURIComponent("تم حفظ العقد")}`,
        );
      } catch (err) {
        return back("/contracts", err);
      }
    }

    if (seg[0] === "contracts" && seg.length === 3 && seg[2] === "status" && m === "POST") {
      const id = decodeURIComponent(seg[1]);
      const b = await readBody(req);
      try {
        await contractsSvc.setContractStatus(repo, user, id, b.status as never);
        return redirect(
          `/contracts/${encodeURIComponent(id)}?ok=${encodeURIComponent("تم تحديث الحالة")}`,
        );
      } catch (err) {
        return back(`/contracts/${encodeURIComponent(id)}`, err);
      }
    }

    if (seg[0] === "contracts" && seg.length === 3 && seg[2] === "receive" && m === "POST") {
      const id = decodeURIComponent(seg[1]);
      const b = await readBody(req);
      try {
        await assetsSvc.receiveFromContract(repo, user, id, [{
          typeCode: String(b.typeCode ?? ""),
          name: String(b.name ?? ""),
          siteCode: String(b.siteCode ?? ""),
          serialNumber: String(b.serialNumber ?? ""),
          cost: asNumber(b.cost),
        }]);
        return redirect(
          `/contracts/${encodeURIComponent(id)}?ok=${
            encodeURIComponent("تم ترحيل التوريد إلى سجل الأصول")
          }`,
        );
      } catch (err) {
        return back(`/contracts/${encodeURIComponent(id)}`, err);
      }
    }

    if (seg[0] === "contracts" && seg.length === 2 && m === "GET") {
      const id = decodeURIComponent(seg[1]);
      const c = await contractsSvc.getContract(repo, id);
      const [allAssets, allTickets, allInvoices, types, sites] = await Promise.all([
        repo.assets.list(),
        repo.tickets.list(),
        repo.invoices.list(),
        repo.assetTypes.list(),
        repo.sites.list(),
      ]);
      types.sort((a, b) => a.sortOrder - b.sortOrder);
      sites.sort((a, b) => a.code.localeCompare(b.code));
      return html(withFlash(
        V.contractDetailPage(
          user,
          c,
          await repo.suppliers.get(c.supplierId),
          allAssets.filter((a) => a.sourceContractId === id),
          allTickets.filter((t) => t.contractId === id),
          allInvoices.filter((i) => i.contractId === id),
          types,
          sites,
          perms.has("contract:write"),
        ),
        url,
      ));
    }

    // ── الميزانية ──
    if (path === "/budget" && m === "GET") {
      const lines = await budgetSvc.listBudgetLines(repo);
      return html(withFlash(
        V.budgetPage(
          user,
          lines.map((l) => ({ ...l, available: budgetSvc.available(l) })),
          perms.has("budget:write"),
        ),
        url,
      ));
    }

    if (path === "/budget/new" && m === "POST") {
      const b = await readBody(req);
      try {
        await budgetSvc.createBudgetLine(repo, user, {
          id: String(b.id ?? ""),
          name: String(b.name ?? ""),
          fiscalYear: asNumber(b.fiscalYear, new Date().getFullYear()),
          allocated: asNumber(b.allocated),
        });
        return redirect(`/budget?ok=${encodeURIComponent("تمت إضافة البند")}`);
      } catch (err) {
        return back("/budget", err);
      }
    }

    // ── سجل التدقيق ──
    if (path === "/audit" && m === "GET") {
      return html(withFlash(V.auditPage(user, await auditSvc.recent(repo, 200)), url));
    }

    return html(V.errorPage(user, `الصفحة غير موجودة: ${path}`, 404), 404);
  } catch (err) {
    const status = statusOf(err);
    const message = err instanceof Error ? err.message : String(err);
    if (status === 500) console.error(err);
    return html(V.errorPage(user, message, status), status);
  }
}

export type { Role };
