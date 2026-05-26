/**
 * @filedesc Render driver for v7 spike. Produces HTML sketches of the persona's
 * authoring intent — route hierarchy, slot types, module/experience refs — with
 * substrate gaps (unadmitted modules, missing Experience units) visually marked.
 *
 * NOT a production-renderer test. Production render via <formspec-render> requires
 * an admitted Registry index + Experience document; the persona deliberately authored
 * against gaps in both, so production render is the wrong probe — the validator
 * report (reports/<surface>.validation.json) already captures the gap categorically.
 * The HTML sketch makes the authoring intent + gaps visible per surface.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = join(here, '..');

type Surface = 'source-vault' | 'lint-findings' | 'scenario-viewer';
const SURFACES: Surface[] = ['source-vault', 'lint-findings', 'scenario-viewer'];

interface SlotBinding {
  moduleId?: string;
  widgetName?: string;
  unitRef?: string;
  url?: string;
  kind?: string;
  content?: unknown;
  config?: Record<string, unknown>;
  [k: string]: unknown;
}
interface Slot {
  id: string;
  slotType: string;
  binding: SlotBinding;
  position?: string;
  title?: string;
}
interface Route {
  id: string;
  path: string;
  title?: string;
  slots: Slot[];
}
interface SurfaceDoc {
  $formspecSurface: string;
  id: string;
  entry: string;
  routes: Route[];
}
interface Manifest {
  id: string;
  title?: string;
  modules?: Array<{ id: string; version?: string }>;
  definitions?: unknown[];
  experiences?: unknown[];
  components?: unknown[];
}
interface Artifact {
  manifest: Manifest;
  surface: SurfaceDoc;
  uiGraphPolicy?: unknown;
}
interface ValidationDiagnostic {
  origin?: string;
  code?: string;
  severity?: string;
  message?: string;
  details?: unknown;
}
interface ValidationReport {
  report: {
    phases: Array<{ phase: string; status: string }>;
    diagnostics: ValidationDiagnostic[];
  };
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function gapBadge(text: string): string {
  return `<span class="gap" title="Substrate gap surfaced by persona authoring">${esc(text)}</span>`;
}

function slotBox(slot: Slot, gaps: { unadmittedModules: Set<string>; missingExperiences: Set<string> }): string {
  const b = slot.binding ?? {};
  let body = '';
  let gapNote = '';
  switch (slot.slotType) {
    case 'module-widget': {
      const moduleId = b.moduleId ?? '<unknown>';
      const widget = b.widgetName ?? '<unknown>';
      const unadmitted = gaps.unadmittedModules.has(moduleId);
      body = `<code>${esc(moduleId)}::${esc(widget)}</code>`;
      if (unadmitted) gapNote = gapBadge(`MODULE NOT IN REGISTRY`);
      if (b.config) {
        const ds = (b.config as Record<string, unknown>).dataSource;
        if (typeof ds === 'string' && ds.startsWith('x-spike-v7:workspace:')) {
          gapNote += ' ' + gapBadge('NON-STANDARD workspace: DATA SOURCE SCOPE');
        }
      }
      break;
    }
    case 'experience-unit': {
      const unit = b.unitRef ?? '<unknown>';
      const missing = gaps.missingExperiences.has(unit);
      body = `<code>unitRef=${esc(unit)}</code>`;
      if (missing) gapNote = gapBadge(`NO Experience DOCUMENT BACKING`);
      break;
    }
    case 'static-content': {
      const kind = b.kind ?? 'unknown';
      const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
      body = `<code>${esc(kind)}</code>: ${esc((content ?? '').slice(0, 60))}`;
      break;
    }
    case 'definition-form': {
      body = `<code>url=${esc(String(b.url ?? '<unknown>'))}</code>`;
      break;
    }
    case 'embed-route': {
      body = `<code>routeRef=${esc(String((b as Record<string, unknown>).routeRef ?? '<unknown>'))}</code>`;
      break;
    }
    default:
      body = `<code>${esc(JSON.stringify(b).slice(0, 120))}</code>`;
  }
  const titleEl = slot.title ? `<span class="slot-title">${esc(slot.title)}</span>` : '';
  return `<div class="slot slot-${esc(slot.slotType)}">
  <div class="slot-head"><span class="slot-type">${esc(slot.slotType)}</span> <span class="slot-id">#${esc(slot.id)}</span> ${titleEl}</div>
  <div class="slot-body">${body}</div>
  ${gapNote ? `<div class="slot-gap">${gapNote}</div>` : ''}
</div>`;
}

function diagnosticsTable(diags: ValidationDiagnostic[]): string {
  if (diags.length === 0) return '<p class="ok">No validation diagnostics.</p>';
  const rows = diags.map(d => `
    <tr class="sev-${esc(String(d.severity ?? 'unknown'))}">
      <td>${esc(String(d.origin ?? '?'))}</td>
      <td><code>${esc(String(d.code ?? '?'))}</code></td>
      <td>${esc(String(d.severity ?? '?'))}</td>
      <td>${esc(String(d.message ?? '').slice(0, 240))}</td>
    </tr>`).join('');
  return `<table class="diags">
  <thead><tr><th>origin</th><th>code</th><th>severity</th><th>message</th></tr></thead>
  <tbody>${rows}</tbody></table>`;
}

function renderSurfaceHTML(surface: Surface, artifact: Artifact, validation: ValidationReport): string {
  const declaredModules = new Set((artifact.manifest.modules ?? []).map(m => m.id));
  const unadmittedModules = new Set<string>();
  const missingExperiences = new Set<string>();

  for (const diag of validation.report.diagnostics) {
    const details = diag.details as Record<string, unknown> | undefined;
    if (diag.code === 'MODULE-UNRESOLVED' && details && typeof details.moduleId === 'string') {
      unadmittedModules.add(details.moduleId);
    }
    if (diag.code === 'APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF' && details && typeof details.unitRef === 'string') {
      missingExperiences.add(details.unitRef);
    }
  }

  const phases = validation.report.phases.map(p => `<span class="phase phase-${esc(p.status)}">${esc(p.phase)}: ${esc(p.status)}</span>`).join(' ');
  const routes = artifact.surface.routes.map(r => `
    <section class="route">
      <h3>Route <code>${esc(r.id)}</code> <span class="route-path">${esc(r.path)}</span> ${r.title ? `<span class="route-title">${esc(r.title)}</span>` : ''}</h3>
      <div class="slots">${r.slots.map(s => slotBox(s, { unadmittedModules, missingExperiences })).join('')}</div>
    </section>`).join('');

  const declaredModuleList = artifact.manifest.modules && artifact.manifest.modules.length
    ? `<ul>${artifact.manifest.modules.map(m => `<li><code>${esc(m.id)}</code>@${esc(m.version ?? '*')} ${unadmittedModules.has(m.id) ? gapBadge('NOT IN REGISTRY') : ''}</li>`).join('')}</ul>`
    : '<p class="empty">No modules declared.</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>v7 spike: ${esc(surface)} — authoring intent</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; max-width: 1200px; color: #1a1a1a; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
  h3 { font-size: 1rem; margin: 1rem 0 0.5rem; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 1rem; }
  .phase { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 0.8rem; background: #eee; margin: 0 4px 4px 0; }
  .phase-completed { background: #d4edda; color: #155724; }
  .phase-not-run { background: #f5f5f5; color: #999; }
  .route { border-left: 3px solid #4a90e2; padding-left: 1rem; margin: 1rem 0; }
  .route-path { font-family: monospace; color: #555; margin-left: 0.5rem; }
  .route-title { color: #4a90e2; margin-left: 0.5rem; }
  .slots { display: flex; flex-direction: column; gap: 0.5rem; }
  .slot { border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem 0.75rem; background: #fafafa; }
  .slot-head { font-size: 0.85rem; color: #333; }
  .slot-type { background: #e7f0fb; color: #2a5db0; padding: 1px 6px; border-radius: 3px; font-family: monospace; font-size: 0.78rem; }
  .slot-id { font-family: monospace; color: #888; }
  .slot-title { color: #1a1a1a; font-weight: 500; }
  .slot-body { font-size: 0.85rem; margin-top: 0.25rem; }
  .slot-gap { margin-top: 0.4rem; font-size: 0.78rem; }
  .gap { background: #fdecea; color: #b71c1c; padding: 2px 6px; border-radius: 3px; font-weight: 600; font-size: 0.72rem; }
  table.diags { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
  table.diags th, table.diags td { border: 1px solid #ddd; padding: 0.3rem 0.5rem; vertical-align: top; text-align: left; }
  table.diags th { background: #f5f5f5; }
  tr.sev-error { background: #fdecea; }
  tr.sev-warning { background: #fff8e1; }
  code { background: #f3f3f3; padding: 1px 4px; border-radius: 2px; font-size: 0.85em; }
  .nb { color: #444; font-style: italic; font-size: 0.9rem; margin: 1rem 0; }
</style>
</head>
<body>
<h1>${esc(artifact.manifest.title ?? surface)}</h1>
<p class="meta">v7 spike — persona-authored intent sketch · surface URL <code>${esc(artifact.surface.id)}</code> · entry <code>${esc(artifact.surface.entry)}</code></p>
<p class="nb">This is the <strong>authoring intent</strong> the persona expressed via Wireframes-MCP — not a production-rendered UI. Production render via <code>&lt;formspec-render&gt;</code> is gated on admitted Registry modules + an Experience document; the persona deliberately authored against gaps in both, surfaced as the validation diagnostics below. The intent sketch makes those gaps visible per slot.</p>

<h2>Validation phases</h2>
<div>${phases}</div>

<h2>Declared modules</h2>
${declaredModuleList}

<h2>Routes (${artifact.surface.routes.length})</h2>
${routes}

<h2>Validation diagnostics (${validation.report.diagnostics.length})</h2>
${diagnosticsTable(validation.report.diagnostics)}
</body>
</html>`;
}

function loadArtifact(surface: Surface): Artifact {
  return JSON.parse(readFileSync(join(spikeRoot, 'artifacts', `${surface}.json`), 'utf8')) as Artifact;
}
function loadValidation(surface: Surface): ValidationReport {
  return JSON.parse(readFileSync(join(spikeRoot, 'reports', `${surface}.validation.json`), 'utf8')) as ValidationReport;
}

function indexHTML(): string {
  const items = SURFACES.map(s => `<li><a href="${s}.html">${esc(s)}</a></li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>v7 spike — authoring intent sketches</title>
<style>body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; max-width: 700px; }</style>
</head><body>
<h1>Wireframe Generator Spike v7 — Authoring Intent Sketches</h1>
<p>Per-surface visualization of what the persona authored through Wireframes-MCP, with substrate gaps marked.</p>
<ul>${items}</ul>
<p><a href="../reports/findings.json">findings.json</a> — 30 numbered substrate gaps recorded by the persona.</p>
</body></html>`;
}

function main(): void {
  const outDir = join(spikeRoot, 'snapshots');
  mkdirSync(outDir, { recursive: true });
  for (const s of SURFACES) {
    const html = renderSurfaceHTML(s, loadArtifact(s), loadValidation(s));
    const path = join(outDir, `${s}.html`);
    writeFileSync(path, html);
    console.log(`wrote ${path}`);
  }
  const idxPath = join(outDir, 'index.html');
  writeFileSync(idxPath, indexHTML());
  console.log(`wrote ${idxPath}`);
}

main();
