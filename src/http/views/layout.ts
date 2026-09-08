/** قالب الصفحة — عربي بالكامل، اتجاه RTL، بلا أي اعتماد خارجي. */
import { config } from "../../config.ts";
import type { User } from "../../domain/types.ts";
import { permissionsOf } from "../../domain/rbac.ts";

export function esc(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function money(n: number): string {
  return `${
    n.toLocaleString("ar-BH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  } ${config.currency}`;
}

export function dt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString("ar-BH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function day(iso?: string): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

const STYLE = `
:root{
  --bg:#f4f6f9; --panel:#fff; --ink:#16212e; --muted:#5c6a7a; --line:#dde4ec;
  --brand:#0b5d3b; --brand-2:#0e7a4d; --accent:#8a6d1f;
  --ok:#137a3d; --warn:#8a5a00; --bad:#a52121; --info:#1a4f8a;
  --radius:10px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Segoe UI","Noto Kufi Arabic","Tahoma",system-ui,sans-serif;
  font-size:15px;line-height:1.7}
a{color:var(--brand-2);text-decoration:none}
a:hover{text-decoration:underline}
header.top{background:var(--brand);color:#fff;padding:.6rem 1.2rem;
  display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
header.top .brand{font-weight:700;font-size:1.05rem}
header.top .brand small{display:block;font-weight:400;opacity:.85;font-size:.72rem}
header.top .spacer{flex:1}
header.top .who{font-size:.85rem;opacity:.95}
header.top a{color:#fff}
nav.main{background:var(--brand-2);padding:0 1.2rem;display:flex;gap:.2rem;flex-wrap:wrap}
nav.main a{color:#fff;padding:.55rem .9rem;font-size:.9rem;border-radius:6px 6px 0 0}
nav.main a:hover{background:rgba(255,255,255,.14);text-decoration:none}
nav.main a.active{background:var(--bg);color:var(--brand);font-weight:600}
main{padding:1.2rem;max-width:1400px;margin:0 auto}
h1{font-size:1.35rem;margin:.2rem 0 1rem}
h2{font-size:1.08rem;margin:1.4rem 0 .6rem;color:var(--brand)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
  padding:1rem 1.1rem;margin-bottom:1rem}
.grid{display:grid;gap:1rem}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.8rem}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:.85rem 1rem}
.kpi .label{font-size:.8rem;color:var(--muted)}
.kpi .value{font-size:1.5rem;font-weight:700;margin-top:.25rem}
.kpi .value.sm{font-size:1.05rem}
.kpi.bad .value{color:var(--bad)} .kpi.ok .value{color:var(--ok)} .kpi.warn .value{color:var(--warn)}
.tablewrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th,td{padding:.5rem .6rem;text-align:right;border-bottom:1px solid var(--line);vertical-align:top}
th{background:#eef2f6;font-weight:600;color:var(--muted);white-space:nowrap}
tbody tr:hover{background:#f8fafc}
.pill{display:inline-block;padding:.1rem .55rem;border-radius:999px;font-size:.78rem;
  border:1px solid var(--line);background:#f2f5f8;white-space:nowrap}
.pill.ok{background:#e6f5ec;border-color:#b6e0c6;color:var(--ok)}
.pill.warn{background:#fdf3e0;border-color:#f0dbaa;color:var(--warn)}
.pill.bad{background:#fdeaea;border-color:#f2c2c2;color:var(--bad)}
.pill.info{background:#e8f0fa;border-color:#c2d6ee;color:var(--info)}
form.stack{display:grid;gap:.7rem;max-width:640px}
form.wide{max-width:100%}
label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:.2rem}
input,select,textarea{width:100%;padding:.5rem .6rem;border:1px solid var(--line);
  border-radius:7px;font:inherit;background:#fff;color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--brand-2);outline-offset:1px}
textarea{min-height:90px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
button,.btn{background:var(--brand);color:#fff;border:0;padding:.5rem 1.1rem;
  border-radius:7px;font:inherit;cursor:pointer;display:inline-block}
button:hover,.btn:hover{background:var(--brand-2);text-decoration:none;color:#fff}
button.ghost,.btn.ghost{background:transparent;color:var(--brand);border:1px solid var(--brand)}
button.ghost:hover,.btn.ghost:hover{background:#eaf3ee;color:var(--brand)}
button.danger{background:var(--bad)}
.msg{padding:.6rem .9rem;border-radius:7px;margin-bottom:1rem;font-size:.9rem}
.msg.err{background:#fdeaea;border:1px solid #f2c2c2;color:var(--bad)}
.msg.ok{background:#e6f5ec;border:1px solid #b6e0c6;color:var(--ok)}
.chain{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
.chain .step{border:1px solid var(--line);border-radius:7px;padding:.4rem .7rem;
  background:#f7f9fb;font-size:.83rem}
.chain .step.done{background:#e6f5ec;border-color:#b6e0c6}
.chain .step.wait{background:#fdf3e0;border-color:#f0dbaa}
.chain .step.rej{background:#fdeaea;border-color:#f2c2c2}
.chain .arrow{color:var(--muted)}
dl.kv{display:grid;grid-template-columns:auto 1fr;gap:.35rem 1rem;font-size:.9rem;margin:0}
dl.kv dt{color:var(--muted)}
dl.kv dd{margin:0}
.muted{color:var(--muted);font-size:.85rem}
.empty{padding:2rem;text-align:center;color:var(--muted)}
.toolbar{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end;margin-bottom:.8rem}
.toolbar > *{margin:0}
.toolbar .grow{flex:1;min-width:160px}
.login{max-width:420px;margin:8vh auto}
.login .panel{padding:1.6rem}
.checks li{margin-bottom:.3rem}
code{background:#eef2f6;padding:.1rem .35rem;border-radius:4px;font-size:.85em}
.demobar{background:#8a6d1f;color:#fff;padding:.4rem 1.2rem;font-size:.82rem;
  text-align:center;letter-spacing:.01em}
.demobar strong{font-weight:700}
footer{padding:1.5rem;text-align:center;color:var(--muted);font-size:.8rem}
footer .demo{display:block;margin-top:.35rem;color:#8a6d1f;font-weight:600}
@media (max-width:640px){ .row{grid-template-columns:1fr} main{padding:.8rem} }
`;

export interface NavItem {
  href: string;
  label: string;
  perm?: string;
}

const NAV: NavItem[] = [
  { href: "/", label: "لوحة المؤشرات" },
  { href: "/assets", label: "الأصول", perm: "asset:read" },
  { href: "/tickets", label: "البلاغات", perm: "ticket:read" },
  { href: "/work-orders", label: "أوامر العمل", perm: "workorder:read" },
  { href: "/invoices", label: "الفواتير", perm: "invoice:read" },
  { href: "/contracts", label: "العقود والموردون", perm: "contract:read" },
  { href: "/budget", label: "الميزانية", perm: "budget:read" },
  { href: "/audit", label: "سجل التدقيق", perm: "audit:read" },
];

export function page(opts: {
  title: string;
  user?: User | null;
  active?: string;
  body: string;
  message?: { kind: "ok" | "err"; text: string } | null;
}): string {
  const perms = opts.user ? permissionsOf(opts.user.roles) : new Set<string>();
  const nav = opts.user
    ? NAV.filter((n) => !n.perm || perms.has(n.perm as never))
      .map((n) =>
        `<a href="${n.href}" class="${opts.active === n.href ? "active" : ""}">${esc(n.label)}</a>`
      ).join("")
    : "";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)} — نظام الخدمات المساندة</title>
<style>${STYLE}</style>
</head>
<body>
${
    config.demoMode
      ? `<div class="demobar"><strong>عرض تجريبي</strong> · ${esc(config.demoNotice)}</div>`
      : ""
  }
<header class="top">
  <div class="brand">نظام الخدمات المساندة المطور<small>${esc(config.orgName)}</small></div>
  <div class="spacer"></div>
  ${
    opts.user
      ? `<div class="who">${esc(opts.user.displayName)} — ${esc(opts.user.roles.join("، "))}</div>
         <form method="post" action="/logout" style="margin:0"><button class="ghost" style="color:#fff;border-color:#fff">خروج</button></form>`
      : ""
  }
</header>
${opts.user ? `<nav class="main">${nav}</nav>` : ""}
<main>
  ${opts.message ? `<div class="msg ${opts.message.kind}">${esc(opts.message.text)}</div>` : ""}
  ${opts.body}
</main>
<footer>نظام الخدمات المساندة المطور · ${esc(config.orgName)} · نسخة تجريبية</footer>
</body>
</html>`;
}
