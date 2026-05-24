/** @filedesc Layer 3: project a WireframeApp into a single multi-route HTML wireframe. Knows only the IR + HTML/CSS — no Formspec types. */

import type { WireframeApp, WireframeNode } from "./ir.js";

// ---------- Escaping ----------

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}
function attr(s: unknown): string {
  return esc(s).replace(/\n/g, " ");
}

// ---------- Lineage chips ----------

type Chip = { kind: string; label: string; title?: string };

function chipsFor(meta: WireframeNode["meta"], extra: { route?: string } = {}): Chip[] {
  if (!meta && !extra.route) return [];
  const chips: Chip[] = [];
  if (extra.route) chips.push({ kind: "route", label: `route:${extra.route}` });
  if (!meta) return chips;
  if (meta.bind) chips.push({ kind: "bind", label: `bind:${meta.bind}` });
  if (meta.actionRef) chips.push({ kind: "action", label: `actionRef:${meta.actionRef}` });
  if (meta.unitRef) chips.push({ kind: "unit", label: `unit:${meta.unitRef}` });
  if (meta.taskRefs?.length) chips.push({ kind: "task", label: `task:${meta.taskRefs.join(",")}` });
  if (meta.slotType) chips.push({ kind: "slot", label: `slot:${meta.slotType}` });
  if (meta.sourceModule) chips.push({ kind: "module", label: meta.sourceModule });
  if (meta.required) chips.push({ kind: "required", label: "required" });
  if (meta.calculated) chips.push({ kind: "calc", label: "calculated" });
  if (meta.readonly) chips.push({ kind: "readonly", label: "readonly" });
  if (meta.relevantWhen) chips.push({ kind: "relevant", label: meta.relevantWhen });
  if (meta.intent) chips.push({ kind: "intent", label: `intent:${meta.intent}` });
  if (meta.role) chips.push({ kind: "role", label: meta.role });
  if (meta.ai?.fillable) {
    chips.push({
      kind: "ai",
      label: `🤖 ai:${meta.ai.providerHint ?? "fillable"}`,
      title: meta.ai.prompt ?? "AI-fillable surface",
    });
  }
  return chips;
}

function renderChips(meta: WireframeNode["meta"], extra: { route?: string } = {}): string {
  const chips = chipsFor(meta, extra);
  if (chips.length === 0) return "";
  return `<span class="wf-chips">${chips
    .map((c) => `<span class="wf-chip wf-chip-${c.kind}"${c.title ? ` title="${attr(c.title)}"` : ""}>${esc(c.label)}</span>`)
    .join("")}</span>`;
}

// ---------- Widget-shape placeholders ----------

function widgetSketch(widget: string | undefined, meta: WireframeNode["meta"]): string {
  const w = widget ?? "TextInput";
  const prefix = meta?.prefix ? `<span class="wf-affix">${esc(meta.prefix)}</span>` : "";
  const suffix = meta?.suffix ? `<span class="wf-affix">${esc(meta.suffix)}</span>` : "";
  const placeholder = (text: string) =>
    `<div class="wf-sketch wf-sketch-${w.toLowerCase()}">${prefix}<span class="wf-sketch-text">${esc(text)}</span>${suffix}</div>`;
  switch (w) {
    case "TextInput":
      return placeholder("Aa  __________");
    case "NumberInput":
      return placeholder("#  0");
    case "MoneyInput":
      return placeholder("$  0.00");
    case "DatePicker":
      return placeholder("📅  yyyy-mm-dd");
    case "Toggle":
      return `<div class="wf-sketch wf-sketch-toggle"><span class="wf-toggle-track"><span class="wf-toggle-knob"></span></span><span class="wf-sketch-text">on / off</span></div>`;
    case "Slider":
      return `<div class="wf-sketch wf-sketch-slider"><span class="wf-slider-track"><span class="wf-slider-thumb"></span></span></div>`;
    case "Signature":
      return `<div class="wf-sketch wf-sketch-signature"><span class="wf-sketch-text">✎ signature</span></div>`;
    case "FileUpload":
      return `<div class="wf-sketch wf-sketch-upload"><span class="wf-sketch-text">⬆ drop file or browse…</span></div>`;
    default:
      return placeholder(w);
  }
}

function choiceSketch(meta: WireframeNode["meta"]): string {
  const opts = meta?.options ?? [];
  const w = meta?.widget ?? "RadioGroup";
  if (w === "CheckboxGroup") {
    const checks = opts.slice(0, 6).map((o) => `<span class="wf-option">☐ ${esc(o.label ?? o.value)}</span>`).join("");
    const more = opts.length > 6 ? `<span class="wf-option-more">…+${opts.length - 6} more</span>` : "";
    return `<div class="wf-sketch wf-sketch-checkbox">${checks}${more}</div>`;
  }
  if (w === "Select") {
    return `<div class="wf-sketch wf-sketch-select"><span class="wf-sketch-text">▾ Choose… (${opts.length} options)</span></div>`;
  }
  const items = opts.slice(0, 6).map((o) => `<span class="wf-option">○ ${esc(o.label ?? o.value)}</span>`).join("");
  const more = opts.length > 6 ? `<span class="wf-option-more">…+${opts.length - 6} more</span>` : "";
  return `<div class="wf-sketch wf-sketch-radio">${items}${more}</div>`;
}

// ---------- Specialised renderers (the proposed Component-extension widgets) ----------

function renderConversation(node: WireframeNode): string {
  const messages = (node.attrs?.messages as { role: string; text: string; citations?: { label: string; score?: number }[] }[]) ?? [];
  const rows = messages
    .map((m) => {
      const cls = m.role === "user" ? "wf-msg-user" : "wf-msg-assistant";
      const cites = (m.citations ?? [])
        .map((c) => `<span class="wf-cite">📖 ${esc(c.label)}${c.score != null ? ` <em>(${c.score.toFixed(2)})</em>` : ""}</span>`)
        .join("");
      return `<div class="wf-msg ${cls}">
        <div class="wf-msg-role">${esc(m.role)}</div>
        <div class="wf-msg-text">${esc(m.text)}</div>
        ${cites ? `<div class="wf-msg-cites">${cites}</div>` : ""}
      </div>`;
    })
    .join("");
  return `<section class="wf-section wf-conversation">
    <div class="wf-section-head">
      <h2>💬 ${esc(node.label ?? "Thread")}</h2>
      ${renderChips(node.meta)}
    </div>
    <div class="wf-conversation-body">${rows}</div>
  </section>`;
}

function renderDocumentViewer(node: WireframeNode): string {
  const docTitle = node.attrs?.docTitle as string;
  const pages = node.attrs?.pages as number;
  const annotations = (node.attrs?.annotations as { pageRange: string; label: string; by: string }[]) ?? [];
  return `<section class="wf-section wf-doc-viewer">
    <div class="wf-section-head">
      <h2>📄 ${esc(node.label ?? "Document")}</h2>
      ${renderChips(node.meta)}
    </div>
    <div class="wf-doc-title">${esc(docTitle)} <span class="wf-affix">· ${esc(pages)} pages</span></div>
    <div class="wf-doc-canvas">
      <div class="wf-doc-page"><span class="wf-doc-page-num">1</span></div>
      <div class="wf-doc-page"><span class="wf-doc-page-num">2</span></div>
      <div class="wf-doc-page wf-doc-page-active"><span class="wf-doc-page-num">3</span></div>
      <div class="wf-doc-page-more">…${esc(pages - 3)} more pages</div>
    </div>
    <div class="wf-doc-annotations">
      <strong>Annotations</strong>
      ${annotations
        .map(
          (a) => `<div class="wf-doc-annot">
        <span class="wf-doc-annot-range">${esc(a.pageRange)}</span>
        <span class="wf-doc-annot-label">${esc(a.label)}</span>
        <span class="wf-doc-annot-by">— ${esc(a.by)}</span>
      </div>`,
        )
        .join("")}
    </div>
  </section>`;
}

function renderResultList(node: WireframeNode): string {
  const rows = (node.attrs?.rows as { icon?: string; primary: string; secondary?: string }[]) ?? [];
  return `<section class="wf-section wf-result-list">
    <div class="wf-section-head">
      <h2>${esc(node.label ?? "List")}</h2>
      ${renderChips(node.meta)}
    </div>
    <ul class="wf-rl">
      ${rows
        .map(
          (r) => `<li class="wf-rl-row">
        <span class="wf-rl-icon">${esc(r.icon ?? "·")}</span>
        <span class="wf-rl-body">
          <span class="wf-rl-primary">${esc(r.primary)}</span>
          ${r.secondary ? `<span class="wf-rl-secondary">${esc(r.secondary)}</span>` : ""}
        </span>
      </li>`,
        )
        .join("")}
    </ul>
  </section>`;
}

function renderGallery(node: WireframeNode): string {
  const cards = (node.attrs?.cards as { title: string; subtitle?: string; badge?: string }[]) ?? [];
  return `<section class="wf-section wf-gallery">
    <div class="wf-section-head">
      <h2>${esc(node.label ?? "Gallery")}</h2>
      ${renderChips(node.meta)}
    </div>
    <div class="wf-gallery-grid">
      ${cards
        .map(
          (c) => `<div class="wf-gallery-card">
        <div class="wf-gallery-title">${esc(c.title)}${c.badge ? `<span class="wf-gallery-badge">${esc(c.badge)}</span>` : ""}</div>
        ${c.subtitle ? `<div class="wf-gallery-sub">${esc(c.subtitle)}</div>` : ""}
      </div>`,
        )
        .join("")}
    </div>
  </section>`;
}

function renderShellMarker(node: WireframeNode): string {
  const appName = node.attrs?.appName as string;
  const tagline = node.attrs?.appTagline as string | null;
  const nav = (node.attrs?.nav as { label: string; path: string }[]) ?? [];
  return `<header class="wf-app-top">
    <div class="wf-app-brand">
      <span class="wf-app-name">${esc(appName)}</span>
      ${tagline ? `<span class="wf-app-tagline">${esc(tagline)}</span>` : ""}
    </div>
    <nav class="wf-app-topnav">
      ${nav.map((n) => `<a class="wf-app-navlink" href="#${esc(idFromPath(n.path))}">${esc(n.label)}</a>`).join("")}
    </nav>
    <div class="wf-app-top-meta">${renderChips(node.meta)}</div>
  </header>`;
}

function renderPanel(node: WireframeNode): string {
  const helper = (node.attrs?.helper as { label: string; kind: string }[] | undefined) ?? [];
  return `<aside class="wf-panel">
    <h3>${esc(node.label ?? "Helper")} ${renderChips(node.meta)}</h3>
    ${helper.length
      ? `<ul class="wf-helper-list">
        ${helper
          .map(
            (h) => `<li class="wf-helper-item wf-helper-${esc(h.kind)}">${h.kind === "ai-prompt" ? "🤖 " : "▸ "}${esc(h.label)}</li>`,
          )
          .join("")}
      </ul>`
      : `<p class="wf-text">Helper surface.</p>`}
  </aside>`;
}

// ---------- Core node renderer ----------

function renderNode(node: WireframeNode): string {
  switch (node.kind) {
    case "section": {
      const desc = node.attrs?.description
        ? `<p class="wf-section-desc">${esc(node.attrs.description)}</p>`
        : "";
      return `<section class="wf-section">
        <div class="wf-section-head">
          <h2>${esc(node.label)}</h2>
          ${renderChips(node.meta)}
        </div>
        ${desc}
        <div class="wf-section-body">${(node.children ?? []).map(renderNode).join("")}</div>
      </section>`;
    }
    case "stack":
      return `<div class="wf-stack">${(node.children ?? []).map(renderNode).join("")}</div>`;
    case "row":
      return `<div class="wf-row">${(node.children ?? []).map(renderNode).join("")}</div>`;
    case "card":
      return `<div class="wf-card">${(node.children ?? []).map(renderNode).join("")}</div>`;
    case "three-pane":
      return `<div class="wf-three-pane">${(node.children ?? []).map(renderNode).join("")}</div>`;
    case "pane": {
      const pane = node.attrs?.pane as string;
      return `<div class="wf-pane wf-pane-${esc(pane)}">${(node.children ?? []).map(renderNode).join("")}</div>`;
    }
    case "heading": {
      const level = Math.min(6, Math.max(2, Number(node.attrs?.level ?? 3)));
      return `<h${level} class="wf-heading">${esc(node.label)}</h${level}>`;
    }
    case "text":
      return `<p class="wf-text">${esc(node.label)}</p>`;
    case "divider":
      return `<hr class="wf-divider">`;
    case "field":
      return `<div class="wf-field">
        <div class="wf-field-label"><strong>${esc(node.label)}</strong>${renderChips(node.meta)}</div>
        ${node.meta?.hint ? `<div class="wf-field-hint">${esc(node.meta.hint)}</div>` : ""}
        ${widgetSketch(node.meta?.widget, node.meta)}
      </div>`;
    case "field-choice":
      return `<div class="wf-field">
        <div class="wf-field-label"><strong>${esc(node.label)}</strong>${renderChips(node.meta)}</div>
        ${node.meta?.hint ? `<div class="wf-field-hint">${esc(node.meta.hint)}</div>` : ""}
        ${choiceSketch(node.meta)}
      </div>`;
    case "button":
      return `<div class="wf-button-row">
        <span class="wf-button wf-button-${esc(node.meta?.role ?? "primary")}">${esc(node.label)}</span>
        ${renderChips(node.meta)}
      </div>`;
    case "summary":
      return `<div class="wf-summary">${esc(node.label ?? "Summary placeholder")}</div>`;
    case "validation-summary":
      return `<div class="wf-vsummary">⚐ Validation summary placeholder${renderChips(node.meta)}</div>`;
    case "callout":
      return `<div class="wf-callout wf-callout-${esc(node.attrs?.severity ?? "info")}">${esc(node.label)}</div>`;
    case "conditional":
      return `<div class="wf-conditional">
        <span class="wf-chip wf-chip-relevant">when: ${esc(node.label)}</span>
        <div class="wf-conditional-body">${(node.children ?? []).map(renderNode).join("")}</div>
      </div>`;
    case "conversation":
      return renderConversation(node);
    case "document-viewer":
      return renderDocumentViewer(node);
    case "result-list":
      return renderResultList(node);
    case "gallery":
      return renderGallery(node);
    case "shell-marker":
      return renderShellMarker(node);
    case "panel":
      return renderPanel(node);
    default:
      return `<div class="wf-unknown">⌬ ${esc(node.label ?? node.kind)}${renderChips(node.meta)}${(node.children ?? []).map(renderNode).join("")}</div>`;
  }
}

// ---------- Multi-route document ----------

function idFromPath(path: string): string {
  if (path === "/") return "route-home";
  return "route-" + path.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function renderRoute(r: WireframeApp["routes"][number]): string {
  return `<section id="route-${esc(r.id)}" class="wf-route${r.default ? " wf-route-default" : ""}">
    <div class="wf-route-banner">
      <span class="wf-route-id">${esc(r.id)}</span>
      <span class="wf-route-path"><code>${esc(r.path)}</code></span>
      <span class="wf-route-label">${esc(r.label)}</span>
      <span class="wf-route-layout">${esc(r.layout)}</span>
    </div>
    <div class="wf-route-body">${renderNode(r.root)}</div>
  </section>`;
}

function renderAppSidebar(app: WireframeApp): string {
  return `<aside class="wf-app-sidebar">
    <div class="wf-app-sidebar-head">
      <div class="wf-app-name">${esc(app.appName)}</div>
      ${app.appTagline ? `<div class="wf-app-tagline">${esc(app.appTagline)}</div>` : ""}
    </div>
    <nav class="wf-app-sidebar-nav">
      <div class="wf-app-sidebar-group">Routes</div>
      ${app.routes
        .map(
          (r) =>
            `<a class="wf-app-sidebar-link${r.default ? " wf-app-sidebar-link-default" : ""}" href="#route-${esc(r.id)}">
            <span class="wf-sidebar-id">${esc(r.id)}</span>
            <span class="wf-sidebar-path">${esc(r.path)}</span>
          </a>`,
        )
        .join("")}
      ${app.nav.length
        ? `<div class="wf-app-sidebar-group">Top nav</div>
        ${app.nav.map((n) => `<a class="wf-app-sidebar-link wf-app-sidebar-link-nav" href="#${esc(idFromPath(n.path))}">${esc(n.label)}</a>`).join("")}`
        : ""}
    </nav>
  </aside>`;
}

// ---------- CSS ----------

const CSS = `
:root {
  --fg: #1a1a1a;
  --muted: #5b6470;
  --line: #c8ccd2;
  --line-dotted: #adb4be;
  --bg: #f5f6f8;
  --panel: #f3f5f8;
  --card: #ffffff;
  --accent: #2e3a59;
  --accent-soft: #eef2ff;
  --warn: #b3651a;
  --ok: #2c7a4b;
  --user-msg: #eef5ff;
  --assistant-msg: #f5f0fd;
  --shadow: 0 1px 0 rgba(0,0,0,0.04);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
  color: var(--fg);
  background: var(--bg);
  line-height: 1.5;
  font-size: 14px;
}

/* App shell: fixed left sidebar + scrollable main */
.wf-shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
.wf-app-sidebar {
  background: #11192c; color: #d8dee8;
  padding: 20px 12px; position: sticky; top: 0; height: 100vh; overflow-y: auto;
}
.wf-app-sidebar-head { padding: 4px 8px 16px; }
.wf-app-name { font-size: 16px; font-weight: 700; letter-spacing: 0.02em; }
.wf-app-tagline { color: #8b96ad; font-size: 11px; margin-top: 4px; }
.wf-app-sidebar-group { color: #6f7a93; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; padding: 14px 8px 6px; }
.wf-app-sidebar-link {
  display: flex; flex-direction: column; gap: 1px;
  text-decoration: none; color: #d8dee8;
  padding: 6px 8px; border-radius: 4px; font-size: 12px;
}
.wf-app-sidebar-link:hover { background: #1c2540; }
.wf-app-sidebar-link-default { background: #1c2540; }
.wf-sidebar-id { font-weight: 600; }
.wf-sidebar-path { color: #8b96ad; font-family: ui-monospace, monospace; font-size: 11px; }
.wf-app-sidebar-link-nav { padding: 4px 8px; }

.wf-views { padding: 24px 32px 96px; max-width: 1280px; }

/* Page header */
.wf-doc-header {
  padding: 16px 20px; background: var(--card); border: 1px solid var(--line); border-radius: 8px;
  margin-bottom: 16px;
}
.wf-doc-header h1 { margin: 0 0 4px; font-size: 18px; }
.wf-doc-header p { margin: 0; color: var(--muted); font-size: 13px; }
.wf-doc-meta { margin: 12px 0 0; font-size: 12px; display: flex; gap: 16px; flex-wrap: wrap; color: var(--muted); }
.wf-doc-meta code { font-family: ui-monospace, monospace; }

/* Route container */
.wf-route { margin: 32px 0 56px; }
.wf-route-banner {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  padding: 10px 14px; background: #fff; border: 1px solid var(--line);
  border-radius: 8px 8px 0 0; box-shadow: var(--shadow);
}
.wf-route-id { font-weight: 700; font-size: 14px; }
.wf-route-path { font-size: 12px; color: var(--muted); }
.wf-route-path code { font-family: ui-monospace, monospace; background: #eef0f3; padding: 1px 6px; border-radius: 4px; }
.wf-route-label { color: var(--muted); font-size: 13px; }
.wf-route-layout { margin-left: auto; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.wf-route-body {
  padding: 16px; background: #fff; border: 1px solid var(--line);
  border-top: none; border-radius: 0 0 8px 8px;
}

/* App top strip (shell marker) */
.wf-app-top {
  display: flex; align-items: center; gap: 16px; padding: 10px 14px;
  background: #fff; border: 1px solid var(--line); border-radius: 8px;
  margin-bottom: 16px;
}
.wf-app-brand { display: flex; flex-direction: column; }
.wf-app-brand .wf-app-name { color: var(--fg); }
.wf-app-brand .wf-app-tagline { color: var(--muted); }
.wf-app-topnav { display: flex; gap: 14px; }
.wf-app-navlink { font-size: 12px; color: var(--accent); text-decoration: none; padding: 4px 8px; border-radius: 4px; }
.wf-app-navlink:hover { background: var(--accent-soft); }
.wf-app-top-meta { margin-left: auto; }

/* Sections */
.wf-section {
  background: var(--card);
  border: 1.5px dashed var(--line-dotted);
  border-radius: 10px;
  padding: 14px 16px 12px;
  margin: 12px 0;
}
.wf-section-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
.wf-section-head h2 { margin: 0; font-size: 14px; font-weight: 600; }
.wf-section-desc { color: var(--muted); margin: 4px 0 8px; font-size: 12px; }
.wf-section-body { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }

/* Layout primitives */
.wf-stack { display: flex; flex-direction: column; gap: 10px; }
.wf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.wf-card { background: var(--panel); border: 1px dashed var(--line-dotted); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.wf-three-pane { display: grid; grid-template-columns: 260px 1fr 320px; gap: 14px; margin-top: 6px; }
.wf-pane-left, .wf-pane-right { display: flex; flex-direction: column; gap: 12px; }
.wf-pane-main { display: flex; flex-direction: column; gap: 12px; }
@media (max-width: 1100px) {
  .wf-three-pane { grid-template-columns: 1fr; }
}

/* Headings, text, divider */
.wf-heading { margin: 8px 0 4px; color: var(--accent); font-weight: 600; font-size: 14px; }
.wf-text { color: var(--muted); margin: 4px 0; font-size: 12px; font-style: italic; }
.wf-divider { border: none; border-top: 1px dashed var(--line); margin: 8px 0; }

/* Fields */
.wf-field { display: flex; flex-direction: column; gap: 4px; }
.wf-field-label { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 12px; }
.wf-field-label strong { color: var(--fg); font-weight: 600; letter-spacing: 0.01em; font-size: 13px; }
.wf-field-hint { color: var(--muted); font-size: 11px; }
.wf-sketch {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 30px;
  padding: 5px 10px;
  background: #fff;
  border: 1.5px dashed var(--line-dotted);
  border-radius: 6px;
  color: var(--muted);
  font-size: 12px;
  font-family: ui-monospace, monospace;
  width: 100%;
  max-width: 420px;
}
.wf-sketch-textinput { background: repeating-linear-gradient(90deg, transparent 0 6px, #f1f3f6 6px 8px); }
.wf-sketch-radio, .wf-sketch-checkbox { display: flex; gap: 14px; flex-wrap: wrap; padding: 6px 10px; }
.wf-option { font-size: 12px; color: var(--fg); }
.wf-option-more { font-size: 11px; color: var(--muted); font-style: italic; }
.wf-sketch-toggle { gap: 10px; }
.wf-toggle-track {
  display: inline-block; width: 34px; height: 18px; background: #e3e6ea;
  border-radius: 9px; position: relative; border: 1px solid var(--line);
}
.wf-toggle-knob {
  position: absolute; left: 2px; top: 2px; width: 12px; height: 12px;
  background: #fff; border: 1px solid var(--line); border-radius: 50%;
}
.wf-sketch-slider .wf-slider-track {
  display: inline-block; width: 200px; height: 4px; background: var(--line);
  border-radius: 2px; position: relative;
}
.wf-sketch-slider .wf-slider-thumb {
  position: absolute; left: 60%; top: -5px; width: 14px; height: 14px;
  background: var(--accent); border-radius: 50%;
}
.wf-affix { color: var(--muted); font-size: 12px; }

/* Buttons */
.wf-button-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 4px; }
.wf-button {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.02em;
}
.wf-button-primary { background: var(--accent); color: #fff; border: 1.5px solid var(--accent); }
.wf-button-secondary { background: #fff; color: var(--accent); border: 1.5px solid var(--accent); }
.wf-button-tertiary { background: transparent; color: var(--accent); border: 1.5px dashed var(--accent); }

/* Specials */
.wf-summary { font-style: italic; color: var(--muted); font-size: 12px; }
.wf-vsummary {
  border: 1.5px dashed var(--warn);
  background: #fdf6e9;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--warn);
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.wf-callout { border-radius: 4px; padding: 8px 12px; font-size: 12px; }
.wf-callout-info { background: #e8eef7; color: #29487d; border: 1px solid #b9c7df; }
.wf-callout-warning { background: #fbf1e2; color: var(--warn); border: 1px solid #e8c79a; }
.wf-conditional {
  border-left: 3px dotted #b87a3c;
  padding: 6px 12px;
  background: #fdf6e9;
  border-radius: 0 6px 6px 0;
  display: flex; flex-direction: column; gap: 6px;
}
.wf-unknown { background: #fff4f4; border: 1px dashed #d9a8a8; color: #8a2a2a; padding: 6px 10px; border-radius: 4px; font-size: 12px; }

/* Conversation */
.wf-conversation-body { display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
.wf-msg { border-radius: 8px; padding: 10px 12px; max-width: 92%; }
.wf-msg-user { background: var(--user-msg); align-self: flex-end; border: 1px solid #c0d3f5; }
.wf-msg-assistant { background: var(--assistant-msg); align-self: flex-start; border: 1px solid #d2bff0; }
.wf-msg-role { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 4px; }
.wf-msg-text { font-size: 13px; color: var(--fg); white-space: pre-wrap; }
.wf-msg-cites { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.wf-cite {
  display: inline-block; padding: 2px 8px;
  font-size: 11px; background: rgba(255,255,255,0.7);
  border: 1px solid var(--line); border-radius: 999px;
  font-family: ui-monospace, monospace;
}
.wf-cite em { color: var(--muted); font-style: normal; font-size: 10px; }

/* Document viewer */
.wf-doc-title { font-size: 13px; color: var(--fg); margin-bottom: 8px; }
.wf-doc-canvas { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; flex-wrap: wrap; }
.wf-doc-page {
  width: 110px; height: 150px; background: #fff;
  border: 1.5px dashed var(--line-dotted); border-radius: 4px;
  position: relative;
  background-image: repeating-linear-gradient(180deg, transparent 0 12px, #eef0f3 12px 14px);
}
.wf-doc-page-active { border-color: var(--accent); border-style: solid; box-shadow: 0 0 0 2px var(--accent-soft); }
.wf-doc-page-num { position: absolute; bottom: 4px; right: 6px; font-size: 10px; color: var(--muted); }
.wf-doc-page-more { font-size: 11px; color: var(--muted); align-self: center; padding: 0 6px; }
.wf-doc-annotations { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; font-size: 12px; }
.wf-doc-annot { display: flex; gap: 10px; padding: 4px 0; border-top: 1px dashed var(--line); }
.wf-doc-annot-range { color: var(--accent); font-family: ui-monospace, monospace; font-size: 11px; min-width: 80px; }
.wf-doc-annot-label { color: var(--fg); flex: 1; }
.wf-doc-annot-by { color: var(--muted); font-size: 11px; }

/* Result list */
.wf-rl { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.wf-rl-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 8px; border-radius: 6px; }
.wf-rl-row:hover { background: var(--accent-soft); }
.wf-rl-icon { font-size: 14px; width: 20px; text-align: center; }
.wf-rl-body { display: flex; flex-direction: column; gap: 1px; }
.wf-rl-primary { font-size: 12px; color: var(--fg); font-weight: 500; }
.wf-rl-secondary { font-size: 11px; color: var(--muted); }

/* Gallery */
.wf-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding-top: 4px; }
.wf-gallery-card {
  background: var(--panel); border: 1.5px dashed var(--line-dotted);
  border-radius: 8px; padding: 12px; min-height: 84px;
  display: flex; flex-direction: column; gap: 6px;
}
.wf-gallery-title { font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wf-gallery-badge { background: var(--accent); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 999px; }
.wf-gallery-sub { font-size: 11px; color: var(--muted); }

/* Panel (helper) */
.wf-panel { background: var(--panel); border-left: 3px solid var(--accent); padding: 10px 14px; border-radius: 4px; }
.wf-panel h3 { margin: 0 0 8px; font-size: 13px; }
.wf-helper-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.wf-helper-item { font-size: 12px; padding: 4px 8px; border-radius: 4px; }
.wf-helper-ai-prompt { background: #f5f0fd; color: #4b2c8f; }

/* Chips */
.wf-chips { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.wf-chip {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  letter-spacing: 0.01em;
  line-height: 1.4;
  white-space: nowrap;
  border: 1px solid transparent;
}
.wf-chip-bind     { background: #e6efff; color: #1f3d80; border-color: #c0d3f5; }
.wf-chip-action   { background: #efe5fb; color: #4b2c8f; border-color: #d2bff0; }
.wf-chip-unit     { background: #f1eafd; color: #5e3a9f; border-color: #d8c6f0; }
.wf-chip-task     { background: #e6f6ec; color: #1f6b3d; border-color: #b9dec7; }
.wf-chip-required { background: #fbe5e5; color: #8a1d24; border-color: #f0bdbd; }
.wf-chip-calc     { background: #e6f7f8; color: #1d6f74; border-color: #b6dcdf; }
.wf-chip-readonly { background: #eef0f2; color: #4a525c; border-color: #cfd4da; }
.wf-chip-relevant { background: #fbf1e2; color: var(--warn); border-color: #ebca96; }
.wf-chip-intent   { background: #ffeede; color: #8a4815; border-color: #f0c89a; }
.wf-chip-role     { background: #eef2ff; color: #2c3e8a; border-color: #c4ceea; }
.wf-chip-route    { background: #e7f5fd; color: #1f5d8c; border-color: #b6dcef; }
.wf-chip-slot     { background: #edf7ef; color: #23673a; border-color: #bfe2c7; }
.wf-chip-module   { background: #f0f2f6; color: #4b5563; border-color: #cfd6e2; }
.wf-chip-ai       {
  background: linear-gradient(90deg, #fdf6e9, #f5f0fd);
  color: #4b2c8f; border-color: #d2bff0;
  font-weight: 600;
}
`;

// ---------- Document shell ----------

export function renderApp(app: WireframeApp): string {
  const sidebar = renderAppSidebar(app);
  const routes = app.routes.map(renderRoute).join("");
  const header = `<div class="wf-doc-header">
    <h1>${esc(app.appName)} — wireframe</h1>
    <p>${esc(app.appTagline ?? "Multi-route low-fidelity wireframe generated from Definition + Experience + Response Actions + Surface.")}</p>
    <div class="wf-doc-meta">
      <span>routes: <code>${app.routes.length}</code></span>
      <span>generated-by: <code>formspec-wireframe-generator-spike-v2</code></span>
    </div>
  </div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(app.appName)} — wireframe</title>
<style>${CSS}</style>
</head>
<body>
<div class="wf-shell">
  ${sidebar}
  <main class="wf-views">
    ${header}
    ${routes}
  </main>
</div>
</body>
</html>`;
}
