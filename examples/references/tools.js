/**
 * Form Intelligence Dashboard — tools.js
 *
 * Generic version that works with any selected example.
 * Uses formspec-engine (Rust/WASM) instead of a Python API tier.
 */

import {
  initFormspecEngine,
  initFormspecEngineTools,
  evalFEL,
  createMappingEngine,
  generateChangelog,
  getFELDependencies,
} from '@formspec-org/engine';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

await initFormspecEngine();
await initFormspecEngineTools();
document.documentElement.dataset.formspecWasmReady = '1';

// ── Example registry (mirrors main.js) ──
const EXAMPLES = [
  {
    id: 'grant-application',
    name: 'Federal Grant Application',
    dir: `${BASE}/examples/grant-application`,
    definition: 'definition.json',
    mappings: {
      json: { file: 'mapping.json', label: 'JSON', desc: 'Native format for web APIs.' },
      csv:  { file: 'mapping-csv.json', label: 'CSV', desc: 'Spreadsheet-friendly format.' },
      xml:  { file: 'mapping-xml.json', label: 'XML', desc: 'Structured markup for federal portals.' },
    },
    registry: 'formspec-common.registry.json',
    fixtures: [
      { id: 'sample-submission', label: 'Complete Submission', file: 'fixtures/sample-submission.json' },
      { id: 'submission-amended', label: 'Amended', file: 'fixtures/submission-amended.json' },
      { id: 'submission-in-progress', label: 'In Progress', file: 'fixtures/submission-in-progress.json' },
      { id: 'submission-stopped', label: 'Stopped', file: 'fixtures/submission-stopped.json' },
    ],
  },
  {
    id: 'tribal-short',
    name: 'Tribal Annual Report (Short)',
    dir: `${BASE}/examples/grant-report`,
    definition: 'tribal-short.definition.json',
    mappings: {
      json: { file: 'tribal-grant.mapping.json', label: 'JSON', desc: 'Native JSON mapping.' },
    },
    registry: 'formspec-common.registry.json',
    fixtures: [
      { id: 'short-empty', label: 'Empty', file: 'fixtures/short-empty.response.json' },
      { id: 'short-partial', label: 'Partial', file: 'fixtures/short-partial.response.json' },
      { id: 'short-complete', label: 'Complete', file: 'fixtures/short-complete.response.json' },
    ],
  },
  {
    id: 'tribal-long',
    name: 'Tribal Annual Report (Long)',
    dir: `${BASE}/examples/grant-report`,
    definition: 'tribal-long.definition.json',
    mappings: {
      json: { file: 'tribal-grant.mapping.json', label: 'JSON', desc: 'Native JSON mapping.' },
    },
    registry: 'formspec-common.registry.json',
    fixtures: [
      { id: 'long-complete', label: 'Complete', file: 'fixtures/long-complete.response.json' },
      { id: 'short-to-long-migrated', label: 'Migrated from Short', file: 'fixtures/short-to-long-migrated.response.json' },
    ],
  },
  {
    id: 'invoice',
    name: 'Invoice (Line Items)',
    dir: `${BASE}/examples/invoice`,
    definition: 'invoice.definition.json',
    mappings: {
      json: { file: 'invoice.mapping.json', label: 'JSON', desc: 'Mapping output as JSON (for debugging).' },
      csv:  { file: 'invoice.mapping.json', label: 'CSV', desc: 'Accounting-friendly row export (repeat expansion).' },
    },
    registry: 'formspec-common.registry.json',
    fixtures: [
      { id: 'invoice-empty', label: 'Empty', file: 'fixtures/invoice-empty.response.json' },
      { id: 'invoice-single', label: 'Single Item', file: 'fixtures/invoice-single.response.json' },
      { id: 'invoice-multi', label: 'Multiple Items', file: 'fixtures/invoice-multi.response.json' },
      { id: 'invoice-max', label: 'Max Items', file: 'fixtures/invoice-max.response.json' },
    ],
  },
  {
    id: 'clinical-intake',
    name: 'Clinical Intake Survey',
    dir: `${BASE}/examples/clinical-intake`,
    definition: 'intake.definition.json',
    mappings: {},
    registry: 'formspec-common.registry.json',
    fixtures: [
      { id: 'intake-empty', label: 'Empty', file: 'fixtures/intake-empty.response.json' },
      { id: 'intake-partial', label: 'Partial', file: 'fixtures/intake-partial.response.json' },
      { id: 'intake-complete', label: 'Complete', file: 'fixtures/intake-complete.response.json' },
      { id: 'intake-nested-repeat', label: 'Nested Repeat', file: 'fixtures/intake-nested-repeat.response.json' },
    ],
  },
];

let currentExample = EXAMPLES[0];
let currentDefinition = null;

// ── Example selector ──
const exampleSelect = document.getElementById('tools-example-select');
for (const ex of EXAMPLES) {
  const opt = document.createElement('option');
  opt.value = ex.id;
  opt.textContent = ex.name;
  exampleSelect.appendChild(opt);
}

exampleSelect.addEventListener('change', () => {
  const ex = EXAMPLES.find(e => e.id === exampleSelect.value);
  if (ex) {
    currentExample = ex;
    currentDefinition = null;
    registryLoaded = false;
    depsLoaded = false;
    onExampleChange();
  }
});

async function onExampleChange() {
  // Re-load definition for changelog
  await loadDefinitionForChangelog();
  // Reset export input and cards
  document.getElementById('export-input-data').value = '';
  initExportCards();
  // Reset registry / deps
  document.getElementById('registry-cards').innerHTML = '';
  document.getElementById('deps-graph').innerHTML = '<svg id="deps-svg"></svg>';
  document.getElementById('deps-placeholder')?.classList.remove('hidden');
  document.getElementById('deps-detail-content')?.classList.add('hidden');
}

// ── Tab switching ──
const tabs = document.querySelectorAll('.tools-tab');
const panels = document.querySelectorAll('.tools-panel');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    document.getElementById(`panel-${tab.dataset.tab}`)?.classList.add('active');
    if (tab.dataset.tab === 'registry') loadRegistry();
    if (tab.dataset.tab === 'dependencies') loadDependencies();
  });
});

// ── Helpers ──
function showError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove('hidden'); }
function hideError(id) { document.getElementById(id)?.classList.add('hidden'); }
function showResult(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hideResult(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── 1. Expression Tester ──
const EVAL_EXAMPLES = {
  sum: { label: 'sum()', expression: "sum($budget.lineItems[*].amount)", data: { budget: { lineItems: [{ amount: 75000 }, { amount: 25000 }, { amount: 8500 }] } } },
  avg: { label: 'avg()', expression: "avg($grades)", data: { grades: [88, 92, 76, 95] } },
  count: { label: 'count()', expression: "count($applicants)", data: { applicants: ["Alice", "Bob", "Carol", "Dave"] } },
  round: { label: 'round()', expression: "round(3.14159, 2)", data: {} },
  power: { label: 'power()', expression: "power(2, 10)", data: {} },
  abs: { label: 'abs()', expression: "abs($balance)", data: { balance: -4200 } },
  upper: { label: 'upper()', expression: "upper('community health partners')", data: {} },
  replace: { label: 'replace()', expression: "replace('FY2025-Q1 Report', 'Q1', 'Q2')", data: {} },
  contains: { label: 'contains()', expression: "contains($title, 'grant')", data: { title: "Federal grant application" } },
  length: { label: 'length()', expression: "length($description)", data: { description: "Improving rural healthcare access in underserved communities" } },
  dateAdd: { label: 'dateAdd()', expression: "dateAdd(today(), 6, 'months')", data: {} },
  dateDiff: { label: 'dateDiff()', expression: "dateDiff($start, $end, 'days')", data: { start: "2026-01-15", end: "2026-06-30" } },
  year: { label: 'year()', expression: "year(today())", data: {} },
  conditional: { label: 'if/then/else', expression: "if $score >= 80 then 'Approved' else 'Needs Review'", data: { score: 85 } },
  coalesce: { label: 'coalesce()', expression: "coalesce($nickname, $fullName, 'Anonymous')", data: { nickname: null, fullName: "Jane Doe" } },
  typeOf: { label: 'typeOf()', expression: "typeOf($amount)", data: { amount: 50000 } },
  cast: { label: 'number()', expression: "number('42.5') * 2", data: {} },
  empty: { label: 'empty()', expression: "empty($notes)", data: { notes: "" } },
};

const examplesContainer = document.getElementById('eval-examples');
for (const [key, ex] of Object.entries(EVAL_EXAMPLES)) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-outline eval-example-btn';
  btn.dataset.example = key;
  btn.style.cssText = 'font-size:11px;padding:3px 10px;font-family:"SF Mono","Fira Code",monospace';
  btn.textContent = ex.label;
  examplesContainer.appendChild(btn);
}

function setEvalExample(name) {
  const example = EVAL_EXAMPLES[name];
  if (!example) return;
  document.getElementById('eval-expression').value = example.expression;
  document.getElementById('eval-data').value = Object.keys(example.data).length ? JSON.stringify(example.data, null, 2) : '';
  examplesContainer.querySelectorAll('.eval-example-btn').forEach((b) => {
    b.classList.toggle('active-example', b.dataset.example === name);
  });
}
setEvalExample('sum');

examplesContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.eval-example-btn');
  if (!btn) return;
  setEvalExample(btn.dataset.example);
  hideError('eval-error');
  hideResult('eval-result');
});

function felValueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

document.getElementById('btn-evaluate')?.addEventListener('click', async () => {
  const expression = document.getElementById('eval-expression').value.trim();
  const dataStr = document.getElementById('eval-data').value.trim();
  hideError('eval-error');
  hideResult('eval-result');

  let data = {};
  try { data = JSON.parse(dataStr || '{}'); } catch { showError('eval-error', 'Invalid JSON in Sample Data field.'); return; }

  try {
    const value = evalFEL(expression, data);
    document.getElementById('eval-result-value').textContent = value === null ? 'null' : JSON.stringify(value);
    const t = felValueType(value);
    const typeEl = document.getElementById('eval-result-type');
    typeEl.textContent = t;
    typeEl.className = `badge badge-${t}`;
    const diagEl = document.getElementById('eval-result-diagnostics');
    diagEl.innerHTML = '';
    showResult('eval-result');
  } catch (e) {
    showError('eval-error', e.message || String(e));
  }
});

// ── 2. Export ──
let lastExportData = null;
let lastExportFormat = '';

function initExportFixtureSelector() {
  const container = document.getElementById('export-fixture-selector');
  const fixtures = currentExample.fixtures || [];
  if (!fixtures.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <select id="export-fixture-select" style="width:auto;min-width:180px;padding:6px 10px;font-size:13px;font-weight:600;border:1px solid var(--color-neutral-200);border-radius:var(--radius);color:var(--color-primary-dark);background:#fff;cursor:pointer">
      <option value="">Load fixture…</option>
      ${fixtures.map(f => `<option value="${f.id}">${f.label}</option>`).join('')}
    </select>
  `;
  container.querySelector('#export-fixture-select').addEventListener('change', async (e) => {
    const fixtureId = e.target.value;
    if (!fixtureId) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    try {
      const res = await fetch(`${currentExample.dir}/${fixture.file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const response = await res.json();
      const data = response.data || response;
      document.getElementById('export-input-data').value = JSON.stringify(data, null, 2);
    } catch (err) {
      showError('export-error', `Failed to load fixture: ${err.message}`);
    }
  });
}

async function initExportCards() {
  const cardsEl = document.getElementById('export-cards');
  cardsEl.innerHTML = '';
  hideError('export-error');
  hideResult('export-result');
  initExportFixtureSelector();

  const mappings = currentExample.mappings || {};
  if (Object.keys(mappings).length === 0) {
    cardsEl.innerHTML = '<p style="color:var(--color-neutral-700)">No mappings available for this example.</p>';
    return;
  }

  for (const [fmt, info] of Object.entries(mappings)) {
    let mappingDoc = null;
    try {
      const res = await fetch(`${currentExample.dir}/${info.file}`);
      if (res.ok) mappingDoc = await res.json();
    } catch {}

    const card = document.createElement('div');
    card.className = 'export-card';

    let metaHtml = '';
    let rulesHtml = '';

    if (mappingDoc) {
      const target = mappingDoc.targetSchema || {};
      metaHtml = `<div class="mapping-meta">
        <span class="badge badge-stable">v${mappingDoc.version || '?'}</span>
        <span class="badge" style="background:var(--color-neutral-100);color:var(--color-neutral-700)">${mappingDoc.direction || 'forward'}</span>
        <span class="badge" style="background:var(--color-neutral-100);color:var(--color-neutral-700)">${mappingDoc.conformanceLevel || '?'}</span>
      </div>`;
      if (target.name) metaHtml += `<div style="font-size:0.78rem;color:var(--color-neutral-700);margin-bottom:8px"><strong>Target:</strong> ${target.name}</div>`;

      const rules = mappingDoc.rules || [];
      if (rules.length) {
        const ruleRows = rules.map((r) => `
          <div class="mapping-rule">
            <span class="mapping-rule-source" title="${r.sourcePath || ''}">${r.sourcePath || '?'}</span>
            <span class="mapping-rule-arrow">\u2192</span>
            <span class="mapping-rule-target" title="${r.targetPath || ''}">${r.targetPath || '?'}</span>
            <span class="mapping-rule-transform">${r.transform || '?'}</span>
          </div>
        `).join('');
        rulesHtml = `<div class="mapping-rules">${ruleRows}</div>`;
      }
    }

    card.innerHTML = `
      <h4>${info.label}</h4>
      <p>${info.desc}</p>
      ${metaHtml}
      ${rulesHtml}
      <button class="btn btn-primary" data-format="${fmt}">Export ${info.label}</button>
    `;
    cardsEl.appendChild(card);
  }

  cardsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-format]');
    if (!btn) return;
    const format = btn.dataset.format;
    hideError('export-error');
    hideResult('export-result');

    let data;
    try { data = JSON.parse(document.getElementById('export-input-data').value); } catch { showError('export-error', 'Invalid JSON in Input Data field.'); return; }

    try {
      const mapping = (currentExample.mappings || {})[format];
      if (!mapping?.file) {
        showError('export-error', 'No mapping file for this format.');
        return;
      }
      const mapRes = await fetch(`${currentExample.dir}/${mapping.file}`);
      if (!mapRes.ok) throw new Error(`Failed to load mapping (${mapRes.status})`);
      const mappingDoc = await mapRes.json();
      const engine = createMappingEngine(mappingDoc);
      const out = engine.forward(data).output;
      const text = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
      lastExportData = text;
      lastExportFormat = format;
      document.getElementById('export-result-format').textContent = `${format.toUpperCase()} Output`;
      document.getElementById('export-result-content').textContent = text.length > 5000 ? text.slice(0, 5000) + '\n\n... (truncated)' : text;
      showResult('export-result');
    } catch (e) {
      showError('export-error', e.message || String(e));
    }
  });
}
initExportCards();

document.getElementById('btn-export-download')?.addEventListener('click', () => {
  if (!lastExportData) return;
  const mimeMap = { json: 'application/json', csv: 'text/csv', xml: 'application/xml' };
  const blob = new Blob([lastExportData], { type: mimeMap[lastExportFormat] || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export.${lastExportFormat}`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── 3. Changelog ──
async function loadDefinitionForChangelog() {
  try {
    const res = await fetch(`${currentExample.dir}/${currentExample.definition}`);
    if (!res.ok) return;
    const defn = await res.json();
    currentDefinition = defn;
    const oldText = JSON.stringify(defn, null, 2);
    document.getElementById('changelog-old').value = oldText;

    // Build a modified version for demo — exercises several change types
    const newDef = JSON.parse(oldText);
    newDef.version = bumpVersion(newDef.version || '1.0.0');
    newDef.title = (newDef.title || 'Form') + ' — FY 2027';

    if (newDef.items && newDef.items.length > 0) {
      // Modify an existing item's label
      const firstGroup = newDef.items.find(i => i.type === 'group' && i.items?.length);
      if (firstGroup) {
        const firstField = firstGroup.items.find(i => i.type === 'field');
        if (firstField) {
          firstField.label = firstField.label + ' (Updated)';
          firstField.hint = 'Please review the updated requirements.';
        }
      }
      // Add a new field
      newDef.items.push({ key: 'complianceCert', type: 'field', dataType: 'boolean', label: 'Compliance Certification', hint: 'I certify all information is accurate.' });
    }

    if (!newDef.binds) newDef.binds = [];
    // Add a required bind for the new field
    newDef.binds.push({ path: 'complianceCert', required: true, constraint: '$complianceCert = true', constraintMessage: 'You must certify compliance before submitting.' });
    // Modify an existing bind
    const existingBind = newDef.binds.find(b => b.constraint);
    if (existingBind && existingBind.constraintMessage) {
      existingBind.constraintMessage = existingBind.constraintMessage + ' Please correct this before submitting.';
    }

    // Modify a shape
    if (newDef.shapes?.length) {
      const shape = newDef.shapes[0];
      shape.severity = shape.severity === 'info' ? 'warning' : shape.severity;
      shape.message = shape.message + ' (updated threshold)';
    }

    document.getElementById('changelog-new').value = JSON.stringify(newDef, null, 2);
  } catch {}
}

function bumpVersion(v) {
  const parts = v.split('.');
  parts[0] = String(parseInt(parts[0] || '1', 10) + 1);
  return parts.join('.');
}

loadDefinitionForChangelog();

let lastChangelogBody = null;

function describeChange(c) {
  if (c.description) return c.description;

  // Scalar before/after (metadata like title, version)
  if (c.type === 'modified' && c.before != null && c.after != null && typeof c.before !== 'object') {
    return `${fmtShort(c.before)} → ${fmtShort(c.after)}`;
  }

  if (c.type === 'added') {
    if (c.target === 'item') {
      const label = c.after?.label || c.key || '?';
      const dtype = c.after?.dataType || c.after?.type || '?';
      return `New ${dtype} field: "${label}"`;
    }
    if (c.target === 'bind') {
      const parts = [];
      if (c.after?.required) parts.push('required');
      if (c.after?.calculate) parts.push(`calculate = ${fmtShort(c.after.calculate)}`);
      if (c.after?.constraint) parts.push(`constraint = ${fmtShort(c.after.constraint)}`);
      if (c.after?.relevant) parts.push(`relevant = ${fmtShort(c.after.relevant)}`);
      if (c.after?.readonly) parts.push('readonly');
      return parts.length ? parts.join(', ') : 'New bind added';
    }
    if (c.target === 'shape') return `New validation rule: "${c.after?.message || c.after?.id || '?'}"`;
    return `New ${c.target} added`;
  }

  if (c.type === 'removed') {
    if (c.target === 'item') return `Field "${c.before?.label || c.key || '?'}" removed`;
    if (c.target === 'bind') {
      const parts = [];
      if (c.before?.required) parts.push('required');
      if (c.before?.calculate) parts.push('calculate');
      if (c.before?.constraint) parts.push('constraint');
      return parts.length ? `Bind removed (had: ${parts.join(', ')})` : 'Bind removed';
    }
    if (c.target === 'shape') return `Validation rule "${c.before?.message || c.before?.id || '?'}" removed`;
    return `${c.target} removed`;
  }

  if (c.type === 'modified') {
    const diffs = diffProps(c.before, c.after);
    if (diffs.length === 1) {
      const d = diffs[0];
      if (d.added) return `${d.key} added: ${fmtShort(d.new)}`;
      if (d.removed) return `${d.key} removed (was: ${fmtShort(d.old)})`;
      return `${d.key}: ${fmtShort(d.old)} → ${fmtShort(d.new)}`;
    }
    if (diffs.length > 0) return `${diffs.length} properties changed: ${diffs.map(d => d.key).join(', ')}`;
    return `${c.target} updated`;
  }
  return `${c.target} ${c.type}`;
}

function fmtShort(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.length > 60 ? `"${v.slice(0, 57)}…"` : `"${v}"`;
  return JSON.stringify(v).slice(0, 60);
}

function diffProps(before, after) {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs = [];
  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diffs.push({ key, old: before[key], new: after[key], added: !(key in before), removed: !(key in after) });
    }
  }
  return diffs;
}

function renderChangeDetail(c) {
  // Scalar before/after (metadata) — description already shows the diff
  if (c.type === 'modified' && c.before != null && c.after != null && typeof c.before !== 'object') {
    return '';
  }

  if ((c.type === 'added' || c.type === 'removed') && (c.after || c.before)) {
    const obj = c.after || c.before;
    if (typeof obj !== 'object') return '';
    const cls = c.type === 'added' ? 'val-added' : 'val-removed';
    const props = Object.entries(obj).filter(([k]) => k !== 'key' && k !== 'path' && k !== 'name');
    if (!props.length) return '';
    return `<div class="change-detail">
      ${props.map(([k, v]) => `<div class="change-detail-row">
        <span class="change-detail-label">${esc(k)}</span>
        <span class="change-detail-value ${cls}">${esc(fmt(v))}</span>
      </div>`).join('')}
    </div>`;
  }

  if (c.type === 'modified' && c.before && c.after) {
    const diffs = diffProps(c.before, c.after);
    if (!diffs.length) return '';
    return `<div class="change-detail">
      ${diffs.map(d => {
        if (d.added) return `<div class="change-detail-row">
          <span class="change-detail-label">${esc(d.key)}</span>
          <span class="change-detail-value val-added">${esc(fmt(d.new))}</span>
          <span style="font-size:0.72rem;color:var(--color-neutral-700);margin-left:4px">(added)</span>
        </div>`;
        if (d.removed) return `<div class="change-detail-row">
          <span class="change-detail-label">${esc(d.key)}</span>
          <span class="change-detail-value val-removed">${esc(fmt(d.old))}</span>
          <span style="font-size:0.72rem;color:var(--color-neutral-700);margin-left:4px">(removed)</span>
        </div>`;
        return `<div class="change-detail-row">
          <span class="change-detail-label">${esc(d.key)}</span>
          <span class="change-detail-value val-removed">${esc(fmt(d.old))}</span>
          <span style="color:var(--color-neutral-700);margin:0 4px">\u2192</span>
          <span class="change-detail-value val-added">${esc(fmt(d.new))}</span>
        </div>`;
      }).join('')}
    </div>`;
  }
  return '';
}

function fmt(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 80) + '…' : v;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return JSON.stringify(v).slice(0, 120);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function impactBadge(impact, rationale) {
  if (!impact) return '';
  const cls = impact === 'breaking' ? 'major' : impact === 'compatible' ? 'minor' : 'patch';
  const hint = rationale ? `<span class="change-rationale">${esc(rationale)}</span>` : '';
  return `<span class="badge badge-${cls}">${impact}</span>${hint}`;
}

/** Map a change to a spec §4 rationale explaining WHY it got its impact level. */
function impactRationale(c) {
  const { type, target, impact, before, after } = c;

  if (impact === 'breaking') {
    if (type === 'removed' && target === 'item') return 'Existing responses lose this field';
    if (type === 'removed' && target === 'bind') return 'Existing responses may lose validation';
    if (type === 'removed') return `Existing responses may reference removed ${target}`;
    if (type === 'renamed') return 'Stored response keys no longer match';
    if (type === 'modified' && target === 'item') {
      if (before?.dataType !== after?.dataType) return 'dataType changed — stored values may be invalid';
      if (before?.type !== after?.type) return 'itemType changed — structural change to stored data';
      return 'Structural change to existing field';
    }
    if (type === 'modified' && target === 'bind') {
      if (!before?.required && after?.required) return 'required added — previously valid responses may fail';
      return 'Constraint tightened on existing field';
    }
    if (type === 'added' && target === 'bind' && after?.required) return 'required constraint on existing field — previously valid responses may fail';
    return 'May invalidate existing submissions';
  }

  if (impact === 'compatible') {
    if (type === 'added' && target === 'item') return 'No impact on existing responses';
    if (type === 'added' && target === 'bind') return 'Additive data mapping';
    if (type === 'added' && target === 'shape') return 'Additive validation — presentation only';
    if (type === 'added') return 'Additive — no existing data affected';
    if (type === 'modified' && target === 'bind') {
      if (before?.required && !after?.required) return 'Constraint relaxed — existing data still valid';
      if (before?.constraint !== after?.constraint) return 'Constraint changed — existing data unaffected';
      return 'Non-breaking change to binding';
    }
    if (type === 'modified' && target === 'item') return 'Non-structural change — existing data intact';
    if (type === 'modified') return 'Existing data unaffected';
    if (type === 'moved') return 'Data intact — layout change only';
    if (type === 'removed' && target === 'shape') return 'Loosens constraints — existing data still valid';
    return 'Backward-compatible change';
  }

  // cosmetic
  if (target === 'metadata') return 'Display-only — zero data impact';
  if (type === 'modified' && target === 'item') return 'Label/hint change — display-only';
  if (type === 'modified' && target === 'shape') return 'Presentation-only change';
  if (type === 'modified' && target === 'bind') return 'No impact on stored data';
  return 'Display-only change';
}

document.getElementById('btn-changelog')?.addEventListener('click', async () => {
  hideError('changelog-error');
  hideResult('changelog-result');
  document.getElementById('changelog-json-area')?.classList.add('hidden');

  let oldDef, newDef;
  try { oldDef = JSON.parse(document.getElementById('changelog-old').value); newDef = JSON.parse(document.getElementById('changelog-new').value); }
  catch { showError('changelog-error', 'Invalid JSON. Both fields must contain valid JSON.'); return; }

  try {
    const url = newDef.url || oldDef.url || '';
    const raw = generateChangelog(oldDef, newDef, url);
    const body = {
      definitionUrl: raw.definitionUrl ?? raw.definition_url ?? url,
      fromVersion: raw.fromVersion ?? raw.from_version,
      toVersion: raw.toVersion ?? raw.to_version,
      semverImpact: raw.semverImpact ?? raw.semver_impact,
      changes: (raw.changes || []).map((c) => ({
        type: c.type ?? c.change_type,
        target: c.target,
        path: c.path,
        impact: c.impact,
        key: c.key,
        description: c.description,
        before: c.before,
        after: c.after,
        migrationHint: c.migrationHint ?? c.migration_hint,
      })),
    };

    lastChangelogBody = body;

    document.getElementById('changelog-impact').textContent = body.semverImpact;
    document.getElementById('changelog-impact').className = `badge badge-${body.semverImpact}`;
    document.getElementById('changelog-versions').textContent = `${body.fromVersion || '?'} \u2192 ${body.toVersion || '?'}`;

    // Summary counts
    const counts = {};
    for (const c of (body.changes || [])) counts[c.type] = (counts[c.type] || 0) + 1;
    const summaryParts = Object.entries(counts).map(([t, n]) => `${n} ${t}`);
    document.getElementById('changelog-summary').textContent = summaryParts.length ? summaryParts.join(', ') : '';

    const changesEl = document.getElementById('changelog-changes');
    changesEl.innerHTML = '';
    if (!body.changes || body.changes.length === 0) {
      changesEl.innerHTML = '<div class="change-item" style="color:var(--color-neutral-700)">No changes detected.</div>';
    } else {
      for (const c of body.changes) {
        const item = document.createElement('div');
        item.className = 'change-item';

        const desc = describeChange(c);
        const detail = renderChangeDetail(c);
        const rationale = impactRationale(c);
        const migration = c.migrationHint ? `<div class="change-migration">\u21AA Migration: <code>${esc(c.migrationHint)}</code></div>` : '';

        item.innerHTML = `
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
            <span class="change-type change-type-${c.type}">${c.type}</span>
            <span class="badge" style="background:var(--color-neutral-100);color:var(--color-neutral-700);font-size:0.68rem;margin-right:4px">${c.target}</span>
            <strong style="font-family:'SF Mono','Fira Code',monospace;font-size:0.82rem">${esc(c.path || c.key || '')}</strong>
            <span style="color:var(--color-neutral-700);margin:0 4px">&mdash;</span>
            <span style="flex:1;font-size:0.875rem">${esc(desc)}</span>
            ${impactBadge(c.impact, rationale)}
          </div>
          ${detail}${migration}
        `;
        changesEl.appendChild(item);
      }
    }

    // Prepare JSON view
    document.getElementById('changelog-json-content').textContent = JSON.stringify(body, null, 2);

    showResult('changelog-result');
  } catch (e) {
    showError('changelog-error', e.message || String(e));
  }
});

document.getElementById('btn-changelog-json')?.addEventListener('click', () => {
  const area = document.getElementById('changelog-json-area');
  const btn = document.getElementById('btn-changelog-json');
  const visible = !area.classList.contains('hidden');
  area.classList.toggle('hidden', visible);
  btn.textContent = visible ? 'View Changelog JSON' : 'Hide Changelog JSON';
});

// ── 4. Registry ──
let registryLoaded = false;

async function loadRegistry() {
  if (registryLoaded) return;
  const cardsEl = document.getElementById('registry-cards');
  hideError('registry-error');

  if (!currentExample.registry) {
    cardsEl.innerHTML = '<p style="color:var(--color-neutral-700)">No extension registry for this example.</p>';
    registryLoaded = true;
    return;
  }

  try {
    const res = await fetch(`${BASE}/registries/${currentExample.registry}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const regDoc = await res.json();
    const entries = Array.isArray(regDoc.entries) ? regDoc.entries : [];
    renderRegistryCards(entries);
    registryLoaded = true;
  } catch (e) {
    showError('registry-error', `Cannot load extensions: ${e.message}`);
  }
}

function renderRegistryCards(entries) {
  const cardsEl = document.getElementById('registry-cards');
  cardsEl.innerHTML = '';
  if (!entries || entries.length === 0) {
    cardsEl.innerHTML = '<p style="color:var(--color-neutral-700)">No extensions found.</p>';
    return;
  }
  for (const entry of entries) {
    const card = document.createElement('div');
    card.className = 'registry-card';
    const details = [];
    if (entry.baseType) details.push(`<div class="registry-detail"><span class="registry-detail-label">Base type</span> <code>${entry.baseType}</code></div>`);
    if (entry.constraints) { const parts = Object.entries(entry.constraints).map(([k, v]) => `<code>${k}: ${v}</code>`); details.push(`<div class="registry-detail"><span class="registry-detail-label">Constraints</span> ${parts.join(', ')}</div>`); }
    if (entry.parameters?.length) { const params = entry.parameters.map((p) => `<span class="dep-chip">${p.name}: ${p.type}</span>`).join(''); details.push(`<div class="registry-detail"><span class="registry-detail-label">Parameters</span> ${params}</div>`); }
    if (entry.returns) details.push(`<div class="registry-detail"><span class="registry-detail-label">Returns</span> <code>${entry.returns}</code></div>`);
    if (entry.license) details.push(`<div class="registry-detail"><span class="registry-detail-label">License</span> ${entry.license}</div>`);

    card.innerHTML = `
      <h4>${entry.name}</h4>
      <div class="registry-meta">
        <span class="badge badge-${entry.status || 'draft'}">${entry.status || 'unknown'}</span>
        <span class="badge" style="background:var(--color-neutral-100);color:var(--color-neutral-700)">${entry.category || 'unknown'}</span>
        <span style="font-size:0.75rem;color:var(--color-neutral-700)">v${entry.version || '?'}</span>
      </div>
      <p>${entry.description || ''}</p>
      ${details.length ? '<div class="registry-details">' + details.join('') + '</div>' : ''}
    `;
    cardsEl.appendChild(card);
  }
}

document.getElementById('btn-registry-filter')?.addEventListener('click', async () => {
  const category = document.getElementById('registry-category').value;
  const status = document.getElementById('registry-status').value;
  hideError('registry-error');
  try {
    const res = await fetch(`${BASE}/registries/${currentExample.registry}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const regDoc = await res.json();
    let entries = Array.isArray(regDoc.entries) ? regDoc.entries : [];
    if (category) entries = entries.filter((e) => e.category === category);
    if (status) entries = entries.filter((e) => e.status === status);
    renderRegistryCards(entries);
  } catch (e) {
    showError('registry-error', `Filter failed: ${e.message}`);
  }
});

// ── 5. Dependencies ──
let depsLoaded = false;
let depsData = null;

async function loadDependencies() {
  if (depsLoaded) return;
  hideError('deps-error');

  try {
    const res = await fetch(`${currentExample.dir}/${currentExample.definition}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const definition = await res.json();
    const graph = {};
    for (const bind of definition.binds || []) {
      const path = bind.path || '';
      for (const exprKey of ['calculate', 'relevant', 'constraint', 'required', 'readonly']) {
        const expr = bind[exprKey];
        if (!expr || typeof expr !== 'string') continue;
        try {
          const deps = getFELDependencies(expr);
          const key = exprKey === 'calculate' ? path : `${path}.${exprKey}`;
          graph[key] = { depends_on: [...deps].sort(), expression: expr };
        } catch {
          /* skip malformed */
        }
      }
    }
    depsData = graph;
    depsLoaded = true;
    renderDependencyGraph(depsData);
  } catch (e) {
    showError('deps-error', `Cannot load dependencies: ${e.message}`);
  }
}

async function renderDependencyGraph(data) {
  const nodeSet = new Set();
  const links = [];
  for (const [field, info] of Object.entries(data)) {
    const fieldShort = field.split('.').pop().replace(/\[.*\]/, '');
    nodeSet.add(fieldShort);
    for (const dep of info.depends_on) {
      const depShort = dep.split('.').pop().replace(/\[.*\]/, '');
      nodeSet.add(depShort);
      links.push({ source: depShort, target: fieldShort });
    }
  }
  const calculatedFields = new Set(Object.keys(data).map(k => k.split('.').pop().replace(/\[.*\]/, '')));
  const nodes = Array.from(nodeSet).map((id) => ({ id, calculated: calculatedFields.has(id) }));
  try {
    const d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm');
    renderD3Graph(d3, nodes, links, data);
  } catch { renderFallbackList(data); }
}

function renderD3Graph(d3, nodes, links, rawData) {
  const container = document.getElementById('deps-graph');
  const svg = d3.select('#deps-svg');
  svg.selectAll('*').remove();
  const width = container.clientWidth || 700;
  const height = 400;
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  svg.append('defs').append('marker').attr('id', 'arrow').attr('viewBox', '0 -5 10 10').attr('refX', 20).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto').append('path').attr('d', 'M0,-5L10,0L0,5').attr('class', 'edge-arrow');

  const world = svg.append('g').attr('class', 'zoom-layer');
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(30));

  const link = world.append('g').selectAll('line').data(links).join('line').attr('class', 'edge').attr('marker-end', 'url(#arrow)');
  const nodeGroup = world.append('g').selectAll('g').data(nodes).join('g').attr('class', 'graph-node').style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );
  nodeGroup.append('circle').attr('r', 14).attr('class', (d) => d.calculated ? 'node-calculated' : 'node-input').attr('stroke-width', 2);
  nodeGroup.append('text').attr('class', 'node-label').attr('dy', -20).attr('text-anchor', 'middle').text((d) => d.id);
  nodeGroup.on('click', (event, d) => showNodeDetail(d.id, rawData));

  simulation.on('tick', () => {
    link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', (e) => { world.attr('transform', e.transform); }));
}

function showNodeDetail(nodeId, rawData) {
  document.getElementById('deps-placeholder')?.classList.add('hidden');
  const content = document.getElementById('deps-detail-content');
  content.classList.remove('hidden');
  document.getElementById('deps-detail-field').textContent = nodeId;
  const matches = Object.entries(rawData).filter(([key]) => key.split('.').pop().replace(/\[.*\]/, '') === nodeId);
  const exprSection = document.getElementById('deps-detail-expr-section');
  const depsSection = document.getElementById('deps-detail-deps-section');
  if (matches.length > 0) {
    const [, info] = matches[0];
    document.getElementById('deps-detail-expr').textContent = info.expression;
    exprSection.style.display = '';
    document.getElementById('deps-detail-deps').innerHTML = info.depends_on.map((d) => `<span class="dep-chip">${d}</span>`).join('');
    depsSection.style.display = '';
  } else { exprSection.style.display = 'none'; depsSection.style.display = 'none'; }
}

function renderFallbackList(data) {
  const container = document.getElementById('deps-graph');
  let html = '<div style="padding:16px"><h4 style="margin-bottom:12px">Field Dependencies</h4>';
  for (const [field, info] of Object.entries(data)) {
    html += `<div style="margin-bottom:12px;padding:8px;border:1px solid var(--color-neutral-200);border-radius:4px">`;
    html += `<strong>${field}</strong><br><code style="font-size:0.8rem;color:var(--color-neutral-700)">${info.expression}</code><br>`;
    html += info.depends_on.map((d) => `<span class="dep-chip">${d}</span>`).join('');
    html += `</div>`;
  }
  container.innerHTML = html + '</div>';
}
