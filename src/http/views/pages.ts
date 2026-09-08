/** صفحات الواجهة. */
import type {
  Approval,
  Asset,
  AssetType,
  AuditEntry,
  BudgetLine,
  Contract,
  Invoice,
  MatchResult,
  Payment,
  Site,
  Supplier,
  Ticket,
  User,
  WorkOrder,
} from "../../domain/types.ts";
import {
  ASSET_STATUSES,
  BILLING_BASES,
  PRIORITIES,
  ROLE_LABELS,
  WORK_TYPES,
} from "../../domain/types.ts";
import type { Kpis } from "../../services/dashboard.ts";
import type { Depreciation } from "../../services/assets.ts";
import { day, dt, esc, money, page } from "./layout.ts";
import { entraEnabled } from "../../auth/oidc.ts";

// ───────────────────────── الدخول ─────────────────────────

export function loginPage(error?: string, notice?: string): string {
  return page({
    title: "تسجيل الدخول",
    body: `
<div class="login">
  <div class="panel">
    <h1 style="margin-top:0">تسجيل الدخول</h1>
    ${error ? `<div class="msg err">${esc(error)}</div>` : ""}
    ${notice ? `<div class="msg ok">${esc(notice)}</div>` : ""}
    <form method="post" action="/login" class="stack">
      <div><label for="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" required autocomplete="username"></div>
      <div><label for="password">كلمة المرور</label>
        <input id="password" name="password" type="password" required autocomplete="current-password"></div>
      <button type="submit">دخول</button>
    </form>
    ${
      entraEnabled()
        ? `<hr style="margin:1.2rem 0;border:0;border-top:1px solid var(--line)">
           <a class="btn ghost" style="width:100%;text-align:center" href="/auth/entra/start">الدخول عبر حساب الوزارة (Microsoft Entra ID)</a>`
        : `<p class="muted" style="margin-top:1rem">الدخول الموحّد عبر Microsoft Entra ID جاهز في النظام ومعطّل حالياً — يُفعَّل بضبط <code>ENTRA_ENABLED=true</code>.</p>`
    }
  </div>
</div>`,
  });
}

// ───────────────────────── لوحة المؤشرات ─────────────────────────

export function dashboardPage(user: User, k: Kpis): string {
  const kpi = (label: string, value: string, cls = "") =>
    `<div class="kpi ${cls}"><div class="label">${
      esc(label)
    }</div><div class="value">${value}</div></div>`;
  const kpiSm = (label: string, value: string, cls = "") =>
    `<div class="kpi ${cls}"><div class="label">${
      esc(label)
    }</div><div class="value sm">${value}</div></div>`;

  return page({
    title: "لوحة المؤشرات",
    user,
    active: "/",
    body: `
<h1>لوحة المؤشرات</h1>

<h2>التشغيل</h2>
<div class="cards">
  ${kpi("بلاغات مفتوحة", String(k.tickets.open))}
  ${kpi("تجاوزت زمن الاستجابة", String(k.tickets.breached), k.tickets.breached ? "bad" : "ok")}
  ${kpi("أوامر عمل جارية", String(k.workOrders.open))}
  ${
      kpi(
        "بانتظار الفوترة",
        String(k.workOrders.awaitingInvoice),
        k.workOrders.awaitingInvoice ? "warn" : "",
      )
    }
  ${kpi("أُغلقت هذا الشهر", String(k.tickets.closedThisMonth), "ok")}
  ${
      kpiSm(
        "متوسط زمن الإغلاق",
        k.tickets.avgCloseHours === null ? "—" : `${k.tickets.avgCloseHours} ساعة`,
      )
    }
</div>

<h2>الأصول</h2>
<div class="cards">
  ${kpi("إجمالي الأصول", String(k.assets.total))}
  ${kpi("في الخدمة", String(k.assets.inService), "ok")}
  ${kpi("تحت الصيانة", String(k.assets.underMaintenance), k.assets.underMaintenance ? "warn" : "")}
  ${kpiSm("القيمة الدفترية", money(k.assets.bookValue))}
</div>

<h2>المالية والميزانية</h2>
<div class="cards">
  ${kpi("فواتير قيد الاعتماد", String(k.finance.inApproval), k.finance.inApproval ? "warn" : "")}
  ${
      kpi(
        "معتمدة غير مصروفة",
        String(k.finance.approvedUnpaid),
        k.finance.approvedUnpaid ? "warn" : "",
      )
    }
  ${
      kpiSm(
        "قيمة المستحق غير المدفوع",
        money(k.finance.approvedUnpaidValue),
        k.finance.approvedUnpaidValue ? "warn" : "",
      )
    }
  ${kpiSm("المصروف الفعلي", money(k.finance.paidValue), "ok")}
  ${kpiSm("المتاح في الميزانية", money(k.budget.available), k.budget.available <= 0 ? "bad" : "ok")}
  ${kpiSm("المحجوز", money(k.budget.committed))}
</div>

<h2>العقود</h2>
<div class="cards">
  ${kpi("عقود سارية", String(k.contracts.live))}
  ${
      kpi(
        "تنتهي خلال ٦٠ يوماً",
        String(k.contracts.expiringIn60Days),
        k.contracts.expiringIn60Days ? "warn" : "",
      )
    }
</div>

<div class="panel">
  <h2 style="margin-top:0">الأصول الأكثر تكراراً للأعطال</h2>
  ${
      k.topFaultyAssets.length
        ? `<div class="tablewrap"><table>
      <thead><tr><th>رقم الأصل</th><th>الاسم</th><th>عدد البلاغات</th></tr></thead>
      <tbody>${
          k.topFaultyAssets.map((a) =>
            `<tr><td><a href="/assets/${encodeURIComponent(a.tag)}">${esc(a.tag)}</a></td><td>${
              esc(a.name)
            }</td><td>${a.tickets}</td></tr>`
          ).join("")
        }</tbody></table></div>`
        : `<p class="empty">لا توجد بلاغات بعد.</p>`
    }
</div>`,
  });
}

// ───────────────────────── الأصول ─────────────────────────

export function assetsPage(
  user: User,
  assets: Asset[],
  types: AssetType[],
  sites: Site[],
  filter: Record<string, string>,
  canWrite: boolean,
): string {
  const typeName = new Map(types.map((t) => [t.code, t.name]));
  const siteName = new Map(sites.map((s) => [s.code, s.name]));
  const opts = (list: { v: string; l: string }[], sel: string) =>
    `<option value="">— الكل —</option>` +
    list.map((o) =>
      `<option value="${esc(o.v)}"${o.v === sel ? " selected" : ""}>${esc(o.l)}</option>`
    ).join("");

  return page({
    title: "الأصول",
    user,
    active: "/assets",
    body: `
<h1>سجل الأصول <span class="muted">(${assets.length})</span></h1>

<form method="get" class="toolbar panel">
  <div class="grow"><label>بحث</label><input name="q" value="${
      esc(filter.q ?? "")
    }" placeholder="رقم الأصل أو الاسم أو الرقم التسلسلي"></div>
  <div><label>النوع</label><select name="typeCode">${
      opts(types.map((t) => ({ v: t.code, l: t.name })), filter.typeCode ?? "")
    }</select></div>
  <div><label>الموقع</label><select name="siteCode">${
      opts(sites.map((s) => ({ v: s.code, l: `${s.code} — ${s.name}` })), filter.siteCode ?? "")
    }</select></div>
  <div><label>الحالة</label><select name="status">${
      opts(ASSET_STATUSES.map((s) => ({ v: s, l: s })), filter.status ?? "")
    }</select></div>
  <div><button type="submit">تصفية</button></div>
  ${canWrite ? `<div><a class="btn ghost" href="/assets/new">تسجيل أصل</a></div>` : ""}
</form>

<div class="panel">
${
      assets.length
        ? `<div class="tablewrap"><table>
  <thead><tr><th>رقم الأصل</th><th>الاسم</th><th>النوع</th><th>الموقع</th><th>الرقم التسلسلي</th><th>الحالة</th><th>التكلفة</th></tr></thead>
  <tbody>${
          assets.map((a) =>
            `<tr>
    <td><a href="/assets/${encodeURIComponent(a.tag)}">${esc(a.tag)}</a></td>
    <td>${esc(a.name)}</td>
    <td>${esc(typeName.get(a.typeCode) ?? a.typeCode)}</td>
    <td>${esc(siteName.get(a.siteCode) ?? a.siteCode)}</td>
    <td>${esc(a.serialNumber || "—")}</td>
    <td>${statusPill(a.status)}</td>
    <td>${money(a.acquisitionCost)}</td>
  </tr>`
          ).join("")
        }</tbody></table></div>`
        : `<p class="empty">لا توجد أصول مطابقة.</p>`
    }
</div>`,
  });
}

function statusPill(s: string): string {
  const cls = s === "في الخدمة"
    ? "ok"
    : s === "تحت الصيانة"
    ? "warn"
    : s === "مشطوب" || s === "خارج الخدمة"
    ? "bad"
    : "";
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}

export function assetDetailPage(
  user: User,
  asset: Asset,
  type: AssetType,
  site: Site | null,
  dep: Depreciation,
  tco: { acquisition: number; maintenance: number; total: number; workOrders: number },
  tickets: Ticket[],
  qr: string,
  canCreateTicket: boolean,
): string {
  const attrRows = type.fields
    .filter((f) => asset.attributes[f.key] !== undefined)
    .map((f) => {
      const v = asset.attributes[f.key];
      const shown = typeof v === "boolean" ? (v ? "نعم" : "لا") : String(v);
      return `<dt>${esc(f.label)}</dt><dd>${esc(shown)}</dd>`;
    }).join("");

  return page({
    title: asset.tag,
    user,
    active: "/assets",
    body: `
<h1>${esc(asset.tag)} — ${esc(asset.name)} ${statusPill(asset.status)}</h1>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <div class="panel">
    <h2 style="margin-top:0">البيانات الأساسية</h2>
    <dl class="kv">
      <dt>النوع</dt><dd>${esc(type.name)} (${esc(type.code)})</dd>
      <dt>الموقع</dt><dd>${esc(site ? `${site.code} — ${site.name}` : asset.siteCode)}</dd>
      <dt>الصانع / الطراز</dt><dd>${esc(asset.manufacturer || "—")} / ${
      esc(asset.modelName || "—")
    }</dd>
      <dt>الرقم التسلسلي</dt><dd>${esc(asset.serialNumber || "—")}</dd>
      <dt>الإدارة / العهدة</dt><dd>${esc(asset.department || "—")} / ${
      esc(asset.custodian || "—")
    }</dd>
      <dt>تاريخ الاقتناء</dt><dd>${day(asset.acquisitionDate)}</dd>
      <dt>مصدر الاقتناء</dt><dd>${esc(asset.acquisitionSource)}${
      asset.sourceContractId
        ? ` — عقد <a href="/contracts/${encodeURIComponent(asset.sourceContractId)}">${
          esc(asset.sourceContractId)
        }</a>`
        : ""
    }</dd>
      <dt>الضمان حتى</dt><dd>${day(asset.warrantyEnd)}</dd>
    </dl>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">الخصائص الفنية</h2>
    ${
      attrRows
        ? `<dl class="kv">${attrRows}</dl>`
        : `<p class="muted">لا توجد خصائص مسجّلة لهذا النوع.</p>`
    }
  </div>

  <div class="panel">
    <h2 style="margin-top:0">الإهلاك والقيمة الدفترية</h2>
    <dl class="kv">
      <dt>طريقة الإهلاك</dt><dd>${esc(dep.method)}</dd>
      <dt>العمر الافتراضي</dt><dd>${dep.usefulLifeYears} سنة</dd>
      <dt>الإهلاك السنوي</dt><dd>${money(dep.annualDepreciation)}</dd>
      <dt>مجمّع الإهلاك</dt><dd>${money(dep.accumulated)}</dd>
      <dt><strong>القيمة الدفترية</strong></dt><dd><strong>${money(dep.bookValue)}</strong></dd>
    </dl>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">التكلفة الإجمالية للتملّك (TCO)</h2>
    <dl class="kv">
      <dt>ثمن الاقتناء</dt><dd>${money(tco.acquisition)}</dd>
      <dt>تكلفة الصيانة</dt><dd>${money(tco.maintenance)} (${tco.workOrders} أمر عمل)</dd>
      <dt><strong>الإجمالي</strong></dt><dd><strong>${money(tco.total)}</strong></dd>
    </dl>
    <p class="muted" style="margin-bottom:0">رابط ملصق QR: <code>${esc(qr)}</code></p>
  </div>
</div>

${
      canCreateTicket
        ? `<div class="panel">
  <h2 style="margin-top:0">فتح بلاغ على هذا الأصل</h2>
  <form method="post" action="/tickets/new" class="stack wide">
    <input type="hidden" name="assetTag" value="${esc(asset.tag)}">
    <div class="row">
      <div><label>الأولوية</label><select name="priority">${
          PRIORITIES.map((p) => `<option${p === "متوسط" ? " selected" : ""}>${esc(p)}</option>`)
            .join("")
        }</select></div>
      <div><label>الإدارة الطالبة</label><input name="requestingDept" value="${
          esc(user.department)
        }"></div>
    </div>
    <div><label>وصف العطل</label><textarea name="description" required></textarea></div>
    <div><button type="submit">فتح البلاغ</button></div>
  </form>
</div>`
        : ""
    }

<div class="panel">
  <h2 style="margin-top:0">بلاغات هذا الأصل</h2>
  ${ticketTable(tickets)}
</div>`,
  });
}

export function newAssetPage(
  user: User,
  types: AssetType[],
  sites: Site[],
  selectedType?: AssetType,
): string {
  const typeOpts = types.map((t) =>
    `<option value="${esc(t.code)}"${selectedType?.code === t.code ? " selected" : ""}>${
      esc(t.name)
    } (${esc(t.code)})</option>`
  ).join("");
  const siteOpts = sites.map((s) =>
    `<option value="${esc(s.code)}">${esc(s.code)} — ${esc(s.name)}</option>`
  ).join("");

  const dynFields = selectedType
    ? selectedType.fields.sort((a, b) => a.sortOrder - b.sortOrder).map((f) => {
      const name = `attr_${f.key}`;
      let input: string;
      switch (f.inputType) {
        case "رقم":
          input = `<input type="number" step="any" name="${esc(name)}"${
            f.required ? " required" : ""
          }>`;
          break;
        case "تاريخ":
          input = `<input type="date" name="${esc(name)}"${f.required ? " required" : ""}>`;
          break;
        case "قائمة":
          input = `<select name="${esc(name)}"${
            f.required ? " required" : ""
          }><option value="">—</option>${
            (f.choices ?? []).map((c) => `<option>${esc(c)}</option>`).join("")
          }</select>`;
          break;
        case "نعم/لا":
          input = `<select name="${
            esc(name)
          }"><option value="">—</option><option value="true">نعم</option><option value="false">لا</option></select>`;
          break;
        default:
          input = `<input name="${esc(name)}"${f.required ? " required" : ""}>`;
      }
      return `<div><label>${esc(f.label)}${f.required ? " *" : ""}</label>${input}</div>`;
    }).join("")
    : "";

  return page({
    title: "تسجيل أصل",
    user,
    active: "/assets",
    body: `
<h1>تسجيل أصل جديد</h1>

<form method="get" action="/assets/new" class="toolbar panel">
  <div class="grow"><label for="pickType">اختر نوع الأصل أولاً — تظهر خصائصه في النموذج</label>
    <select id="pickType" name="typeCode">
      <option value="">— اختر النوع —</option>${typeOpts}
    </select></div>
  <div><button type="submit">عرض الخصائص</button></div>
</form>

${
      selectedType
        ? `<form method="post" action="/assets/new" class="panel stack wide">
  <input type="hidden" name="typeCode" value="${esc(selectedType.code)}">
  <div class="row">
    <div><label>اسم الأصل *</label><input name="name" required></div>
    <div><label>الموقع *</label><select name="siteCode" required><option value="">—</option>${siteOpts}</select></div>
  </div>
  <div class="row">
    <div><label>الصانع</label><input name="manufacturer"></div>
    <div><label>الطراز</label><input name="modelName"></div>
  </div>
  <div class="row">
    <div><label>الرقم التسلسلي${
          selectedType.needsSerial ? " *" : ""
        }</label><input name="serialNumber"${selectedType.needsSerial ? " required" : ""}></div>
    <div><label>تكلفة الاقتناء</label><input type="number" step="any" name="acquisitionCost" value="0"></div>
  </div>
  <div class="row">
    <div><label>الإدارة</label><input name="department"></div>
    <div><label>العهدة (اسم الموظف)</label><input name="custodian"></div>
  </div>
  <div class="row">
    <div><label>تاريخ الاقتناء</label><input type="date" name="acquisitionDate"></div>
    <div><label>الضمان حتى</label><input type="date" name="warrantyEnd"></div>
  </div>
  ${
          dynFields
            ? `<h2>خصائص «${esc(selectedType.name)}»</h2><div class="row">${dynFields}</div>`
            : ""
        }
  <div><label>ملاحظات</label><textarea name="notes"></textarea></div>
  <div><button type="submit">حفظ الأصل</button> <a class="btn ghost" href="/assets">إلغاء</a></div>
</form>`
        : `<p class="empty">اختر نوع الأصل لعرض النموذج بخصائصه.</p>`
    }`,
  });
}

// ───────────────────────── البلاغات ─────────────────────────

function ticketTable(tickets: Ticket[]): string {
  if (!tickets.length) return `<p class="empty">لا توجد بلاغات.</p>`;
  return `<div class="tablewrap"><table>
  <thead><tr><th>المرجع</th><th>الأصل</th><th>الوصف</th><th>الأولوية</th><th>الحالة</th><th>الاستحقاق</th><th>SLA</th></tr></thead>
  <tbody>${
    tickets.map((t) =>
      `<tr>
    <td><a href="/tickets/${encodeURIComponent(t.ref)}">${esc(t.ref)}</a></td>
    <td><a href="/assets/${encodeURIComponent(t.assetTag)}">${esc(t.assetTag)}</a></td>
    <td>${esc(t.description.slice(0, 70))}${t.description.length > 70 ? "…" : ""}</td>
    <td><span class="pill ${
        t.priority === "عاجل" ? "bad" : t.priority === "مرتفع" ? "warn" : ""
      }">${esc(t.priority)}</span></td>
    <td><span class="pill ${t.status === "مغلق" ? "ok" : t.status === "ملغى" ? "" : "info"}">${
        esc(t.status)
      }</span></td>
    <td>${dt(t.dueDate)}</td>
    <td>${
        t.slaBreached ? `<span class="pill bad">تجاوز</span>` : `<span class="pill ok">ملتزم</span>`
      }</td>
  </tr>`
    ).join("")
  }</tbody></table></div>`;
}

export function ticketsPage(user: User, tickets: Ticket[], canCreate: boolean): string {
  return page({
    title: "البلاغات",
    user,
    active: "/tickets",
    body: `
<h1>البلاغات <span class="muted">(${tickets.length})</span></h1>
${canCreate ? `<p><a class="btn" href="/assets">فتح بلاغ — ابدأ باختيار الأصل</a></p>` : ""}
<div class="panel">${ticketTable(tickets)}</div>`,
  });
}

export function ticketDetailPage(
  user: User,
  t: Ticket,
  asset: Asset | null,
  contract: Contract | null,
  supplier: Supplier | null,
  wo: WorkOrder | null,
  audit: AuditEntry[],
  perms: Set<string>,
): string {
  const canOpenWo = perms.has("workorder:write") && !wo && t.status !== "مغلق" &&
    t.status !== "ملغى";
  const canClose = perms.has("ticket:close") && wo &&
    (wo.status === "منجز فنياً" || wo.status === "مغلق") && t.status !== "مغلق";

  return page({
    title: t.ref,
    user,
    active: "/tickets",
    body: `
<h1>البلاغ ${esc(t.ref)} <span class="pill ${t.status === "مغلق" ? "ok" : "info"}">${
      esc(t.status)
    }</span></h1>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <div class="panel">
    <h2 style="margin-top:0">تفاصيل البلاغ</h2>
    <dl class="kv">
      <dt>الأصل</dt><dd><a href="/assets/${encodeURIComponent(t.assetTag)}">${
      esc(t.assetTag)
    }</a> — ${esc(asset?.name ?? "")}</dd>
      <dt>الموقع</dt><dd>${esc(t.siteCode)}</dd>
      <dt>الإدارة الطالبة</dt><dd>${esc(t.requestingDept || "—")}</dd>
      <dt>الأولوية</dt><dd>${esc(t.priority)}</dd>
      <dt>تاريخ الفتح</dt><dd>${dt(t.createdAt)}</dd>
      <dt>موعد الاستجابة</dt><dd>${dt(t.dueDate)} ${
      t.slaBreached ? `<span class="pill bad">تجاوز</span>` : ""
    }</dd>
      <dt>تاريخ الإغلاق</dt><dd>${dt(t.closedDate)}</dd>
      <dt>الوصف</dt><dd>${esc(t.description)}</dd>
    </dl>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">التغطية التعاقدية</h2>
    ${
      contract
        ? `<dl class="kv">
        <dt>العقد</dt><dd><a href="/contracts/${encodeURIComponent(contract.id)}">${
          esc(contract.id)
        }</a> — ${esc(contract.title)}</dd>
        <dt>المورد</dt><dd>${esc(supplier?.name ?? contract.supplierId)}</dd>
        <dt>أساس الفوترة</dt><dd>${esc(contract.billingBasis)}</dd>
        <dt>زمن الاستجابة</dt><dd>${contract.responseHours} ساعة</dd>
        <dt>غرامة التأخير</dt><dd>${(contract.penaltyRatePerDay * 100).toFixed(1)}٪ عن كل يوم</dd>
      </dl>`
        : `<p class="msg err" style="margin:0">لا يوجد عقد ساري يغطي هذا الأصل — سيُنفَّذ العمل داخلياً أو يلزم أمر شراء مباشر.</p>`
    }
  </div>
</div>

<div class="panel">
  <h2 style="margin-top:0">أمر العمل</h2>
  ${
      wo
        ? workOrderBlock(wo, perms)
        : canOpenWo
        ? `<form method="post" action="/work-orders/new" class="stack">
      <input type="hidden" name="ticketRef" value="${esc(t.ref)}">
      <div class="row">
        <div><label>نوع العمل</label><select name="workType">${
          WORK_TYPES.map((w) => `<option${w === "إصلاح" ? " selected" : ""}>${esc(w)}</option>`)
            .join("")
        }</select></div>
        <div><label>الفني المسند إليه</label><input name="technician" value="${esc(user.id)}"></div>
      </div>
      <div><button type="submit">فتح أمر عمل</button></div>
    </form>`
        : `<p class="muted">لا يوجد أمر عمل.</p>`
    }
</div>

${
      canClose
        ? `<div class="panel">
  <form method="post" action="/tickets/${encodeURIComponent(t.ref)}/close">
    <button type="submit">إغلاق البلاغ</button>
    <span class="muted">الإغلاق مسموح لأن أمر العمل مُنجز فنياً.</span>
  </form>
</div>`
        : ""
    }

<div class="panel">
  <h2 style="margin-top:0">سجل الحركة</h2>
  ${auditTable(audit)}
</div>`,
  });
}

function workOrderBlock(wo: WorkOrder, perms: Set<string>): string {
  const canComplete = perms.has("workorder:complete") && wo.status !== "منجز فنياً" &&
    wo.status !== "مغلق";
  return `<dl class="kv">
  <dt>المرجع</dt><dd><a href="/work-orders/${encodeURIComponent(wo.ref)}">${esc(wo.ref)}</a></dd>
  <dt>النوع</dt><dd>${esc(wo.workType)}</dd>
  <dt>الحالة</dt><dd><span class="pill ${wo.status === "مغلق" ? "ok" : "info"}">${
    esc(wo.status)
  }</span></dd>
  <dt>الفني</dt><dd>${esc(wo.technician)}</dd>
  <dt>ساعات العمل</dt><dd>${wo.laborHours || "—"}</dd>
  <dt>قطع الغيار</dt><dd>${esc(wo.partsUsed || "—")}</dd>
  <dt>النتيجة</dt><dd>${esc(wo.outcome || "—")}</dd>
  <dt>المبلغ المستحق</dt><dd>${
    wo.underContract ? `<span class="pill">مشمول بدفعات العقد</span>` : money(wo.billableAmount)
  }</dd>
  ${
    wo.penaltyAmount
      ? `<dt>غرامة التأخير</dt><dd class="pill bad">${money(wo.penaltyAmount)}</dd>`
      : ""
  }
  <dt>الفاتورة</dt><dd>${
    wo.invoiceRef
      ? `<a href="/invoices/${encodeURIComponent(wo.invoiceRef)}">${esc(wo.invoiceRef)}</a>`
      : "—"
  }</dd>
</dl>
${
    canComplete
      ? `<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">
<form method="post" action="/work-orders/${encodeURIComponent(wo.ref)}/complete" class="stack">
  <div><label>نتيجة العمل / تقرير الإنجاز *</label><textarea name="outcome" required></textarea></div>
  <div class="row">
    <div><label>قطع الغيار المستخدمة</label><input name="partsUsed"></div>
    <div><label>ساعات العمل</label><input type="number" step="0.5" name="laborHours" value="1"></div>
  </div>
  <div><label>المبلغ المستحق للمورد</label><input type="number" step="any" name="billableAmount" value="0">
    <span class="muted">يُتجاهل تلقائياً إذا كان العقد بدفعات دورية.</span></div>
  <div><button type="submit">اعتماد الإنجاز الفني</button></div>
</form>`
      : ""
  }`;
}

export function workOrdersPage(user: User, wos: WorkOrder[]): string {
  return page({
    title: "أوامر العمل",
    user,
    active: "/work-orders",
    body: `
<h1>أوامر العمل <span class="muted">(${wos.length})</span></h1>
<div class="panel">
${
      wos.length
        ? `<div class="tablewrap"><table>
  <thead><tr><th>المرجع</th><th>البلاغ</th><th>الأصل</th><th>النوع</th><th>الحالة</th><th>المستحق</th><th>الفاتورة</th></tr></thead>
  <tbody>${
          wos.map((w) =>
            `<tr>
    <td><a href="/work-orders/${encodeURIComponent(w.ref)}">${esc(w.ref)}</a></td>
    <td><a href="/tickets/${encodeURIComponent(w.ticketRef)}">${esc(w.ticketRef)}</a></td>
    <td>${esc(w.assetTag)}</td>
    <td>${esc(w.workType)}</td>
    <td><span class="pill ${w.status === "مغلق" ? "ok" : "info"}">${esc(w.status)}</span></td>
    <td>${w.underContract ? `<span class="pill">دفعات دورية</span>` : money(w.billableAmount)}</td>
    <td>${
              w.invoiceRef
                ? `<a href="/invoices/${encodeURIComponent(w.invoiceRef)}">${esc(w.invoiceRef)}</a>`
                : "—"
            }</td>
  </tr>`
          ).join("")
        }</tbody></table></div>`
        : `<p class="empty">لا توجد أوامر عمل.</p>`
    }
</div>`,
  });
}

export function workOrderDetailPage(user: User, wo: WorkOrder, perms: Set<string>): string {
  return page({
    title: wo.ref,
    user,
    active: "/work-orders",
    body: `<h1>أمر العمل ${esc(wo.ref)}</h1><div class="panel">${workOrderBlock(wo, perms)}</div>`,
  });
}

// ───────────────────────── الفواتير ─────────────────────────

export function invoicesPage(
  user: User,
  invoices: Invoice[],
  billable: WorkOrder[],
  suppliers: Supplier[],
  inbox: Invoice[],
  perms: Set<string>,
): string {
  const supName = new Map(suppliers.map((s) => [s.id, s.name]));
  return page({
    title: "الفواتير",
    user,
    active: "/invoices",
    body: `
<h1>الفواتير والمستحقات</h1>

${
      inbox.length
        ? `<div class="panel" style="border-color:#f0dbaa;background:#fffdf7">
  <h2 style="margin-top:0">بانتظار تصرّفك (${inbox.length})</h2>
  ${invoiceTable(inbox, supName)}
</div>`
        : ""
    }

${
      perms.has("invoice:create") && billable.length
        ? `<div class="panel">
  <h2 style="margin-top:0">أوامر عمل منجزة بانتظار الفوترة (${billable.length})</h2>
  <form method="post" action="/invoices/new" class="stack wide">
    <div class="tablewrap"><table>
      <thead><tr><th></th><th>أمر العمل</th><th>الأصل</th><th>المورد</th><th>المبلغ</th><th>الغرامة</th></tr></thead>
      <tbody>${
          billable.map((w) =>
            `<tr>
        <td><input type="checkbox" name="workOrderRefs" value="${esc(w.ref)}" style="width:auto"
             data-supplier="${esc(w.supplierId ?? "")}"></td>
        <td>${esc(w.ref)}</td><td>${esc(w.assetTag)}</td>
        <td>${esc(supName.get(w.supplierId ?? "") ?? "—")}</td>
        <td>${money(w.billableAmount)}</td><td>${
              w.penaltyAmount ? money(w.penaltyAmount) : "—"
            }</td>
      </tr>`
          ).join("")
        }</tbody></table></div>
    <div class="row">
      <div><label>المورد *</label><select name="supplierId" required><option value="">—</option>${
          suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")
        }</select></div>
      <div><label>رقم فاتورة المورد</label><input name="supplierInvoiceNo"></div>
    </div>
    <div><button type="submit">إنشاء مسودة فاتورة</button>
      <button type="submit" formaction="/invoices/auto" class="ghost">فوترة آلية لكل المنجز</button></div>
  </form>
</div>`
        : ""
    }

<div class="panel">
  <h2 style="margin-top:0">كل الفواتير (${invoices.length})</h2>
  ${invoiceTable(invoices, supName)}
</div>`,
  });
}

function invoiceStatusPill(s: string): string {
  const cls = s === "مصروفة" || s === "معتمدة"
    ? "ok"
    : s === "مرفوضة" || s === "ملغاة"
    ? "bad"
    : s === "قيد الاعتماد"
    ? "warn"
    : "";
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}

function invoiceTable(invoices: Invoice[], supName: Map<string, string>): string {
  if (!invoices.length) return `<p class="empty">لا توجد فواتير.</p>`;
  return `<div class="tablewrap"><table>
  <thead><tr><th>المرجع</th><th>المورد</th><th>العقد</th><th>الأساس</th><th>الصافي</th><th>الضريبة</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th></tr></thead>
  <tbody>${
    invoices.map((i) =>
      `<tr>
    <td><a href="/invoices/${encodeURIComponent(i.ref)}">${esc(i.ref)}</a></td>
    <td>${esc(supName.get(i.supplierId) ?? i.supplierId)}</td>
    <td>${i.contractId ? esc(i.contractId) : "—"}</td>
    <td>${esc(i.basis)}</td>
    <td>${money(i.amount)}</td>
    <td>${money(i.vatAmount)}</td>
    <td><strong>${money(i.grandTotal)}</strong></td>
    <td>${invoiceStatusPill(i.status)}</td>
    <td>${day(i.issueDate)}</td>
  </tr>`
    ).join("")
  }</tbody></table></div>`;
}

export function invoiceDetailPage(
  user: User,
  inv: Invoice,
  supplier: Supplier | null,
  chain: Approval[],
  match: MatchResult,
  wos: (WorkOrder | null)[],
  payment: Payment | null,
  budgetLine: BudgetLine | null,
  audit: AuditEntry[],
  perms: Set<string>,
  currentStep: Approval | null,
): string {
  const chainHtml = chain.map((a, i) => {
    const cls = a.status === "معتمد"
      ? "done"
      : a.status === "بانتظار"
      ? "wait"
      : a.status === "مرفوض"
      ? "rej"
      : "";
    return `${i ? `<span class="arrow">←</span>` : ""}<div class="step ${cls}">
      <strong>${esc(a.step)}</strong> — ${esc(a.status)}<br>
      <span class="muted">${
      a.actedBy ? `${esc(a.actedBy)} · ${dt(a.actedAt)}` : "لم يُتخذ إجراء"
    }</span>
      ${a.note ? `<br><span class="muted">${esc(a.note)}</span>` : ""}
    </div>`;
  }).join("");

  const canSubmit = perms.has("invoice:submit") &&
    (inv.status === "مسودة" || inv.status === "مرفوضة");
  const myStep = currentStep &&
    (user.roles.includes(currentStep.requiredRole) || user.roles.includes("admin")) &&
    inv.status === "قيد الاعتماد";
  const canPay = perms.has("payment:execute") && inv.status === "معتمدة";

  return page({
    title: inv.ref,
    user,
    active: "/invoices",
    body: `
<h1>الفاتورة ${esc(inv.ref)} ${invoiceStatusPill(inv.status)}</h1>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <div class="panel">
    <h2 style="margin-top:0">البيانات المالية</h2>
    <dl class="kv">
      <dt>المورد</dt><dd>${esc(supplier?.name ?? inv.supplierId)}</dd>
      <dt>العقد</dt><dd>${
      inv.contractId
        ? `<a href="/contracts/${encodeURIComponent(inv.contractId)}">${esc(inv.contractId)}</a>`
        : "—"
    }</dd>
      <dt>رقم فاتورة المورد</dt><dd>${esc(inv.supplierInvoiceNo || "—")}</dd>
      <dt>أوامر العمل</dt><dd>${
      inv.workOrderRefs.map((r) => `<a href="/work-orders/${encodeURIComponent(r)}">${esc(r)}</a>`)
        .join("، ")
    }</dd>
      <dt>الصافي</dt><dd>${money(inv.amount)}</dd>
      ${
      inv.penaltyAmount
        ? `<dt>غرامات مخصومة</dt><dd class="pill bad">${money(inv.penaltyAmount)}</dd>`
        : ""
    }
      <dt>ضريبة القيمة المضافة</dt><dd>${money(inv.vatAmount)}</dd>
      <dt><strong>الإجمالي</strong></dt><dd><strong>${money(inv.grandTotal)}</strong></dd>
      <dt>بند الميزانية</dt><dd>${
      esc(budgetLine ? `${budgetLine.id} — ${budgetLine.name}` : inv.budgetLineId)
    }</dd>
      <dt>تاريخ الإصدار</dt><dd>${dt(inv.issueDate)}</dd>
    </dl>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">المطابقة الثلاثية</h2>
    <p>${
      match.matched
        ? `<span class="pill ok">مطابقة ناجحة</span>`
        : `<span class="pill bad">مطابقة غير مكتملة</span>`
    }</p>
    <ul class="checks">${
      match.checks.map((c) =>
        `<li>${c.ok ? "✔" : "✘"} <strong>${esc(c.name)}</strong> — ${esc(c.detail)}</li>`
      ).join("")
    }</ul>
    <p class="muted">آخر فحص: ${dt(match.checkedAt)}</p>
  </div>
</div>

<div class="panel">
  <h2 style="margin-top:0">مسار الاعتماد</h2>
  ${
      chain.length
        ? `<div class="chain">${chainHtml}</div>`
        : `<p class="muted">لم تُقدَّم الفاتورة للاعتماد بعد.</p>`
    }

  ${
      canSubmit
        ? `<form method="post" action="/invoices/${
          encodeURIComponent(inv.ref)
        }/submit" style="margin-top:1rem">
      <button type="submit">تقديم للاعتماد</button>
      <span class="muted">لن تُقبل إلا بعد نجاح المطابقة الثلاثية.</span></form>`
        : ""
    }

  ${
      myStep
        ? `<form method="post" action="/invoices/${
          encodeURIComponent(inv.ref)
        }/act" class="stack" style="margin-top:1rem">
      <div><label>ملاحظة</label><input name="note" placeholder="اختياري"></div>
      <div>
        <button type="submit" name="decision" value="approve">اعتماد خطوة «${
          esc(currentStep!.step)
        }»</button>
        <button type="submit" name="decision" value="reject" class="danger">رفض</button>
      </div></form>`
        : ""
    }

  ${
      canPay
        ? `<form method="post" action="/invoices/${
          encodeURIComponent(inv.ref)
        }/pay" class="stack" style="margin-top:1rem">
      <div class="row">
        <div><label>طريقة الصرف</label><select name="method"><option>تحويل بنكي</option><option>شيك</option><option>مقاصة</option></select></div>
        <div><label>مرجع البنك / الشيك</label><input name="bankReference"></div>
      </div>
      <div><button type="submit">تنفيذ الصرف</button></div></form>`
        : ""
    }

  ${
      payment
        ? `<div class="msg ok" style="margin-top:1rem">صُرفت بالسند <strong>${
          esc(payment.ref)
        }</strong> بمبلغ ${money(payment.amount)} — ${esc(payment.method)} ${
          esc(payment.bankReference)
        } بتاريخ ${dt(payment.paidAt)}</div>`
        : ""
    }
</div>

<div class="panel">
  <h2 style="margin-top:0">أوامر العمل المشمولة</h2>
  ${
      wos.filter(Boolean).length
        ? `<div class="tablewrap"><table>
    <thead><tr><th>المرجع</th><th>الأصل</th><th>النتيجة</th><th>ساعات</th><th>المبلغ</th></tr></thead>
    <tbody>${
          wos.filter(Boolean).map((w) =>
            `<tr>
      <td><a href="/work-orders/${encodeURIComponent(w!.ref)}">${esc(w!.ref)}</a></td>
      <td>${esc(w!.assetTag)}</td><td>${esc(w!.outcome)}</td>
      <td>${w!.laborHours}</td><td>${money(w!.billableAmount)}</td></tr>`
          ).join("")
        }</tbody></table></div>`
        : `<p class="empty">—</p>`
    }
</div>

<div class="panel"><h2 style="margin-top:0">سجل الحركة</h2>${auditTable(audit)}</div>`,
  });
}

// ───────────────────────── العقود ─────────────────────────

export function contractsPage(
  user: User,
  contracts: Contract[],
  suppliers: Supplier[],
  types: AssetType[],
  budgetLines: BudgetLine[],
  canWrite: boolean,
): string {
  const supName = new Map(suppliers.map((s) => [s.id, s.name]));
  return page({
    title: "العقود والموردون",
    user,
    active: "/contracts",
    body: `
<h1>العقود والموردون</h1>

<div class="panel">
  <h2 style="margin-top:0">العقود (${contracts.length})</h2>
  ${
      contracts.length
        ? `<div class="tablewrap"><table>
    <thead><tr><th>الرقم</th><th>العنوان</th><th>المورد</th><th>الأنواع المشمولة</th><th>أساس الفوترة</th><th>SLA</th><th>القيمة</th><th>السريان</th><th>الحالة</th></tr></thead>
    <tbody>${
          contracts.map((c) =>
            `<tr>
      <td><a href="/contracts/${encodeURIComponent(c.id)}">${esc(c.id)}</a></td>
      <td>${esc(c.title)}</td>
      <td>${esc(supName.get(c.supplierId) ?? c.supplierId)}</td>
      <td>${
              c.coveredTypes.length
                ? esc(c.coveredTypes.join("، "))
                : `<span class="muted">الكل</span>`
            }</td>
      <td>${esc(c.billingBasis)}</td>
      <td>${c.responseHours} ساعة</td>
      <td>${money(c.value)}</td>
      <td>${day(c.startDate)} ← ${day(c.expiryDate)}</td>
      <td><span class="pill ${
              c.status === "ساري" ? "ok" : c.status === "منتهي" || c.status === "ملغى" ? "bad" : ""
            }">${esc(c.status)}</span></td>
    </tr>`
          ).join("")
        }</tbody></table></div>`
        : `<p class="empty">لا توجد عقود.</p>`
    }
</div>

<div class="panel">
  <h2 style="margin-top:0">الموردون (${suppliers.length})</h2>
  ${
      suppliers.length
        ? `<div class="tablewrap"><table>
    <thead><tr><th>الرمز</th><th>الاسم</th><th>السجل التجاري</th><th>جهة الاتصال</th><th>البريد</th><th>الحالة</th></tr></thead>
    <tbody>${
          suppliers.map((s) =>
            `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.commercialReg || "—")}</td>
      <td>${esc(s.contactName || "—")}</td><td>${esc(s.email || "—")}</td>
      <td>${
              s.isActive
                ? `<span class="pill ok">نشط</span>`
                : `<span class="pill bad">موقوف</span>`
            }</td></tr>`
          ).join("")
        }</tbody></table></div>`
        : `<p class="empty">لا يوجد موردون.</p>`
    }
</div>

${
      canWrite
        ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
  <div class="panel">
    <h2 style="margin-top:0">تسجيل مورد</h2>
    <form method="post" action="/suppliers/new" class="stack wide">
      <div><label>اسم المورد *</label><input name="name" required></div>
      <div class="row">
        <div><label>السجل التجاري</label><input name="commercialReg"></div>
        <div><label>جهة الاتصال</label><input name="contactName"></div>
      </div>
      <div class="row">
        <div><label>البريد الإلكتروني</label><input name="email" type="email"></div>
        <div><label>الهاتف</label><input name="phone"></div>
      </div>
      <div><button type="submit">حفظ المورد</button></div>
    </form>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">إبرام عقد</h2>
    <form method="post" action="/contracts/new" class="stack wide">
      <div><label>عنوان العقد *</label><input name="title" required></div>
      <div class="row">
        <div><label>المورد *</label><select name="supplierId" required><option value="">—</option>${
          suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")
        }</select></div>
        <div><label>بند الميزانية *</label><select name="budgetLineId" required><option value="">—</option>${
          budgetLines.map((b) =>
            `<option value="${esc(b.id)}">${esc(b.id)} — ${esc(b.name)}</option>`
          ).join("")
        }</select></div>
      </div>
      <div><label>أنواع الأصول المشمولة (اتركها فارغة = الكل)</label>
        <select name="coveredTypes" multiple size="4">${
          types.map((t) =>
            `<option value="${esc(t.code)}">${esc(t.name)} (${esc(t.code)})</option>`
          ).join("")
        }</select></div>
      <div class="row">
        <div><label>تاريخ البدء *</label><input type="date" name="startDate" required></div>
        <div><label>تاريخ الانتهاء *</label><input type="date" name="expiryDate" required></div>
      </div>
      <div class="row">
        <div><label>قيمة العقد</label><input type="number" step="any" name="value" value="0"></div>
        <div><label>أساس الفوترة</label><select name="billingBasis">${
          BILLING_BASES.map((b) => `<option>${esc(b)}</option>`).join("")
        }</select></div>
      </div>
      <div class="row">
        <div><label>زمن الاستجابة (ساعة)</label><input type="number" name="responseHours" value="24"></div>
        <div><label>غرامة التأخير اليومية (نسبة، مثال 0.02)</label><input type="number" step="any" name="penaltyRatePerDay" value="0"></div>
      </div>
      <div><button type="submit">حفظ العقد كمسودة</button></div>
    </form>
  </div>
</div>`
        : ""
    }`,
  });
}

export function contractDetailPage(
  user: User,
  c: Contract,
  supplier: Supplier | null,
  assets: Asset[],
  tickets: Ticket[],
  invoices: Invoice[],
  types: AssetType[],
  sites: Site[],
  canWrite: boolean,
): string {
  return page({
    title: c.id,
    user,
    active: "/contracts",
    body: `
<h1>العقد ${esc(c.id)} <span class="pill ${c.status === "ساري" ? "ok" : ""}">${
      esc(c.status)
    }</span></h1>

<div class="panel">
  <h2 style="margin-top:0">${esc(c.title)}</h2>
  <dl class="kv">
    <dt>المورد</dt><dd>${esc(supplier?.name ?? c.supplierId)}</dd>
    <dt>الأنواع المشمولة</dt><dd>${
      c.coveredTypes.length ? esc(c.coveredTypes.join("، ")) : "كل الأنواع"
    }</dd>
    <dt>المواقع المشمولة</dt><dd>${
      c.coveredSites.length ? esc(c.coveredSites.join("، ")) : "كل المواقع"
    }</dd>
    <dt>السريان</dt><dd>${day(c.startDate)} ← ${day(c.expiryDate)}</dd>
    <dt>القيمة</dt><dd>${money(c.value)}</dd>
    <dt>أساس الفوترة</dt><dd>${esc(c.billingBasis)}${
      c.billingCycle ? ` (${esc(c.billingCycle)})` : ""
    }</dd>
    <dt>زمن الاستجابة</dt><dd>${c.responseHours} ساعة</dd>
    <dt>غرامة التأخير</dt><dd>${(c.penaltyRatePerDay * 100).toFixed(1)}٪ يومياً</dd>
    <dt>بند الميزانية</dt><dd>${esc(c.budgetLineId || "—")}</dd>
  </dl>
  ${
      canWrite
        ? `<form method="post" action="/contracts/${
          encodeURIComponent(c.id)
        }/status" class="toolbar" style="margin-top:1rem">
    <div><label>تغيير الحالة</label><select name="status">
      <option>مسودة</option><option>ساري</option><option>موقوف</option><option>منتهي</option><option>ملغى</option>
    </select></div><div><button type="submit">تطبيق</button></div></form>`
        : ""
    }
</div>

${
      canWrite
        ? `<div class="panel">
  <h2 style="margin-top:0">استلام توريدات وترحيلها إلى سجل الأصول</h2>
  <p class="muted">بند واحد لكل استلام. يُنشأ الأصل مربوطاً بهذا العقد تلقائياً.</p>
  <form method="post" action="/contracts/${encodeURIComponent(c.id)}/receive" class="stack wide">
    <div class="row">
      <div><label>نوع الأصل *</label><select name="typeCode" required>${
          types.map((t) => `<option value="${esc(t.code)}">${esc(t.name)}</option>`).join("")
        }</select></div>
      <div><label>الموقع *</label><select name="siteCode" required>${
          sites.map((s) =>
            `<option value="${esc(s.code)}">${esc(s.code)} — ${esc(s.name)}</option>`
          ).join("")
        }</select></div>
    </div>
    <div class="row">
      <div><label>اسم الأصل *</label><input name="name" required></div>
      <div><label>الرقم التسلسلي</label><input name="serialNumber"></div>
    </div>
    <div><label>التكلفة</label><input type="number" step="any" name="cost" value="0"></div>
    <div><button type="submit">ترحيل إلى الأصول</button></div>
  </form>
</div>`
        : ""
    }

<div class="panel">
  <h2 style="margin-top:0">الأصول المورَّدة بموجب هذا العقد (${assets.length})</h2>
  ${
      assets.length
        ? `<div class="tablewrap"><table><thead><tr><th>الرقم</th><th>الاسم</th><th>الموقع</th><th>التكلفة</th></tr></thead>
    <tbody>${
          assets.map((a) =>
            `<tr><td><a href="/assets/${encodeURIComponent(a.tag)}">${esc(a.tag)}</a></td><td>${
              esc(a.name)
            }</td><td>${esc(a.siteCode)}</td><td>${money(a.acquisitionCost)}</td></tr>`
          ).join("")
        }</tbody></table></div>`
        : `<p class="empty">لا توجد.</p>`
    }
</div>

<div class="panel"><h2 style="margin-top:0">البلاغات المغطاة (${tickets.length})</h2>${
      ticketTable(tickets)
    }</div>
<div class="panel"><h2 style="margin-top:0">فواتير هذا العقد (${invoices.length})</h2>${
      invoiceTable(invoices, new Map(supplier ? [[supplier.id, supplier.name]] : []))
    }</div>`,
  });
}

// ───────────────────────── الميزانية والتدقيق ─────────────────────────

export function budgetPage(
  user: User,
  lines: (BudgetLine & { available: number })[],
  canWrite: boolean,
): string {
  return page({
    title: "الميزانية",
    user,
    active: "/budget",
    body: `
<h1>بنود الميزانية</h1>
<div class="panel">
${
      lines.length
        ? `<div class="tablewrap"><table>
  <thead><tr><th>البند</th><th>الاسم</th><th>السنة</th><th>المخصص</th><th>المحجوز</th><th>المصروف</th><th>المتاح</th></tr></thead>
  <tbody>${
          lines.map((l) =>
            `<tr>
    <td>${esc(l.id)}</td><td>${esc(l.name)}</td><td>${l.fiscalYear}</td>
    <td>${money(l.allocated)}</td><td>${money(l.committed)}</td><td>${money(l.spent)}</td>
    <td><strong class="${l.available <= 0 ? "pill bad" : "pill ok"}">${
              money(l.available)
            }</strong></td>
  </tr>`
          ).join("")
        }</tbody></table></div>`
        : `<p class="empty">لا توجد بنود.</p>`
    }
</div>
${
      canWrite
        ? `<div class="panel">
  <h2 style="margin-top:0">إضافة بند</h2>
  <form method="post" action="/budget/new" class="stack">
    <div class="row">
      <div><label>رمز البند *</label><input name="id" required placeholder="BL-2026-XXXX"></div>
      <div><label>السنة المالية</label><input type="number" name="fiscalYear" value="${
          new Date().getFullYear()
        }"></div>
    </div>
    <div><label>الاسم *</label><input name="name" required></div>
    <div><label>المبلغ المخصص</label><input type="number" step="any" name="allocated" value="0"></div>
    <div><button type="submit">حفظ</button></div>
  </form>
</div>`
        : ""
    }`,
  });
}

function auditTable(entries: AuditEntry[]): string {
  if (!entries.length) return `<p class="empty">لا توجد حركات.</p>`;
  return `<div class="tablewrap"><table>
  <thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>الكيان</th><th>التفصيل</th></tr></thead>
  <tbody>${
    entries.map((e) =>
      `<tr><td>${dt(e.at)}</td><td>${esc(e.actor)}</td><td>${esc(e.action)}</td><td>${
        esc(e.entity)
      } / ${esc(e.entityId)}</td><td>${esc(e.detail)}</td></tr>`
    ).join("")
  }</tbody></table></div>`;
}

export function auditPage(user: User, entries: AuditEntry[]): string {
  return page({
    title: "سجل التدقيق",
    user,
    active: "/audit",
    body: `<h1>سجل التدقيق <span class="muted">(آخر ${entries.length} حركة)</span></h1>
<div class="panel">${auditTable(entries)}</div>`,
  });
}

export function errorPage(user: User | null, message: string, status: number): string {
  return page({
    title: `خطأ ${status}`,
    user,
    body: `<div class="panel"><h1>حدث خطأ (${status})</h1><p class="msg err">${esc(message)}</p>
    <p><a class="btn ghost" href="/">العودة إلى لوحة المؤشرات</a></p></div>`,
  });
}

export { ROLE_LABELS };
