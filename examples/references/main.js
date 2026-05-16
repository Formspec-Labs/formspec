/** @filedesc Entry point for the references example: registers formspec-render and loads forms. */
import '@formspec-org/webcomponent/formspec-layout.css';
import formspecDefaultCssUrl from '@formspec-org/webcomponent/formspec-default.css?url';
import { FormspecRender, globalRegistry } from '@formspec-org/webcomponent';
import { uswdsAdapter } from '@formspec-org/adapters';
import { initFormspecEngine } from '@formspec-org/engine';

await initFormspecEngine();
document.documentElement.dataset.formspecWasmReady = '1';

customElements.define('formspec-render', FormspecRender);
globalRegistry.registerAdapter(uswdsAdapter);

/** Strip trailing slash — same pattern as tools.js for asset URLs under Vite base. */
const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Example registry ──
// Each entry points to a sibling directory under examples/.
// artifacts lists the JSON files to load (definition is required,
// component and theme are optional).
const EXAMPLES = [
  {
    id: 'grant-application',
    name: 'Federal Grant Application',
    description: 'Multi-page wizard with budget, validation, repeats',
    dir: `${ASSET_BASE}/examples/grant-application`,
    artifacts: { definition: 'definition.json', component: 'component.json', theme: 'theme.json' },
    css: 'grant-bridge.css',
    registry: `${ASSET_BASE}/registries/formspec-common.registry.json`,
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
    description: 'Short-form grant report with expenditure tracking',
    dir: `${ASSET_BASE}/examples/grant-report`,
    artifacts: { definition: 'tribal-short.definition.json', component: 'tribal-short.component.json', theme: 'tribal.theme.json' },
    registry: `${ASSET_BASE}/registries/formspec-common.registry.json`,
    fixtures: [
      { id: 'short-empty', label: 'Empty', file: 'fixtures/short-empty.response.json' },
      { id: 'short-partial', label: 'Partial', file: 'fixtures/short-partial.response.json' },
      { id: 'short-complete', label: 'Complete', file: 'fixtures/short-complete.response.json' },
    ],
  },
  {
    id: 'tribal-long',
    name: 'Tribal Annual Report (Long)',
    description: 'Detailed report with narratives and service data',
    dir: `${ASSET_BASE}/examples/grant-report`,
    artifacts: { definition: 'tribal-long.definition.json', component: 'tribal-long.component.json', theme: 'tribal.theme.json' },
    registry: `${ASSET_BASE}/registries/formspec-common.registry.json`,
    fixtures: [
      { id: 'long-complete', label: 'Complete', file: 'fixtures/long-complete.response.json' },
      { id: 'short-to-long-migrated', label: 'Migrated from Short', file: 'fixtures/short-to-long-migrated.response.json' },
    ],
  },
  {
    id: 'invoice',
    name: 'Invoice (Line Items)',
    description: 'Repeat groups + calculated totals + CSV export mapping',
    dir: `${ASSET_BASE}/examples/invoice`,
    artifacts: { definition: 'invoice.definition.json', component: 'invoice.component.json', theme: 'invoice.theme.json' },
    registry: `${ASSET_BASE}/registries/formspec-common.registry.json`,
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
    description: 'Screener routing, instances/pre-population, nested repeats',
    dir: `${ASSET_BASE}/examples/clinical-intake`,
    artifacts: { definition: 'intake.definition.json', component: 'intake.component.json', theme: 'intake.theme.json' },
    registry: `${ASSET_BASE}/registries/formspec-common.registry.json`,
    fixtures: [
      { id: 'intake-empty', label: 'Empty', file: 'fixtures/intake-empty.response.json' },
      { id: 'intake-partial', label: 'Partial', file: 'fixtures/intake-partial.response.json' },
      { id: 'intake-complete', label: 'Complete', file: 'fixtures/intake-complete.response.json' },
      { id: 'intake-nested-repeat', label: 'Nested Repeat', file: 'fixtures/intake-nested-repeat.response.json' },
    ],
  },
  {
    id: 'uswds-grant',
    name: 'Community Grant (USWDS Adapter)',
    description: 'USWDS adapter demo — repeats, calculated totals, conditional sections',
    dir: `${ASSET_BASE}/examples/uswds-grant`,
    artifacts: { definition: 'grant.definition.json', theme: 'grant.theme.json' },
    adapter: 'uswds',
    fixtures: [
      { id: 'uswds-empty', label: 'Empty', file: 'fixtures/empty.response.json' },
      { id: 'uswds-complete', label: 'Complete Submission', file: 'fixtures/complete.response.json' },
    ],
  },
];

// ── DOM refs ──
const exampleListEl = document.getElementById('example-list');
const mainArea = document.getElementById('main-area');
const emptyState = document.getElementById('empty-state');

let activeExampleId = null;
let activeBridgeLink = null;
let activeDefaultSkinLink = null;

function removeDefaultSkinLink() {
  if (activeDefaultSkinLink) {
    activeDefaultSkinLink.remove();
    activeDefaultSkinLink = null;
  }
}

// ── Build sidebar ──
for (const ex of EXAMPLES) {
  const li = document.createElement('li');
  li.dataset.id = ex.id;
  li.innerHTML = `
    <span class="example-name">${ex.name}</span>
    <span class="example-desc">${ex.description}</span>
  `;
  li.addEventListener('click', () => loadExample(ex));
  exampleListEl.appendChild(li);
}

// ── Load helpers ──
async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

// ── Load & render an example ──
// fixture: optional { id, label, file } to restore saved state into the form
async function loadExample(ex, fixture = null) {
  // Allow reload when switching fixtures on the same example
  if (activeExampleId === ex.id && !fixture) return;
  activeExampleId = ex.id;

  // Update sidebar
  exampleListEl.querySelectorAll('li').forEach(li => {
    if (!li.dataset.id) return;
    li.classList.toggle('active', li.dataset.id === ex.id);
  });

  // Update URL hash (skip if unchanged — avoids redundant hashchange churn in some hosts)
  if (window.location.hash.slice(1) !== ex.id) {
    window.location.hash = ex.id;
  }

  // Show loading state
  mainArea.innerHTML = `
    <div class="state-message">
      <h2>Loading...</h2>
      <p>${ex.name}</p>
    </div>
  `;

  // Remove previous bridge CSS
  if (activeBridgeLink) {
    activeBridgeLink.remove();
    activeBridgeLink = null;
  }
  removeDefaultSkinLink();

  try {
    // Load artifacts (+ fixture in parallel if restoring saved state)
    const loads = [loadJSON(`${ex.dir}/${ex.artifacts.definition}`)];
    if (ex.artifacts.component) loads.push(loadJSON(`${ex.dir}/${ex.artifacts.component}`));
    else loads.push(Promise.resolve(null));
    if (ex.artifacts.theme) loads.push(loadJSON(`${ex.dir}/${ex.artifacts.theme}`));
    else loads.push(Promise.resolve(null));
    if (fixture) loads.push(loadJSON(`${ex.dir}/${fixture.file}`));
    else loads.push(Promise.resolve(null));

    const registryPromise = ex.registry
      ? loadJSON(ex.registry).catch((err) => {
          console.warn(`Failed to load registry ${ex.registry}:`, err);
          return null;
        })
      : Promise.resolve(null);

    const [[definition, componentDoc, themeDoc, fixtureResponse], registryDoc] = await Promise.all([
      Promise.all(loads),
      registryPromise,
    ]);

    // Load bridge CSS if specified
    if (ex.css) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${ex.dir}/${ex.css}`;
      document.head.appendChild(link);
      activeBridgeLink = link;
    }

    // Build the form area
    mainArea.innerHTML = '';

    // Info bar
    const info = document.createElement('div');
    info.className = 'example-info';
    info.innerHTML = `
      <h2>${definition.title || ex.name}</h2>
      ${definition.version ? `<span class="info-version">v${definition.version}</span>` : ''}
      ${definition.description ? `<span class="info-desc">${definition.description}</span>` : ''}
    `;
    mainArea.appendChild(info);

    // Form container
    const container = document.createElement('div');
    container.className = 'form-container';

    // Submit results panel (same engine path as <formspec-render> — WASM-backed)
    const clientPanel = document.createElement('div');
    clientPanel.className = 'client-response';
    clientPanel.id = 'client-response';
    clientPanel.setAttribute('aria-live', 'polite');
    clientPanel.innerHTML = `
      <div class="results-panel-head">
        <span class="results-badge">Submit output</span>
        <span class="results-head-note">Validation report and response JSON from the last run</span>
      </div>
      <h3 class="results-panel-title">Last submission</h3>
      <div class="client-meta" id="client-meta"></div>
      <p class="client-empty" id="client-empty">No submit yet. Use Submit above to generate a response and validation report.</p>
      <details class="client-details" open>
        <summary>Validation Report</summary>
        <pre id="client-validation-pre"></pre>
      </details>
      <details class="client-details">
        <summary>Response JSON</summary>
        <pre id="client-response-pre"></pre>
      </details>
    `;

    // Toolbar actions
    const actions = document.createElement('div');
    actions.className = 'form-actions';

    // Fixture selector (if example has fixtures)
    const fixtureHTML = ex.fixtures?.length
      ? `<select id="fixture-select" class="fixture-select">
           <option value="">Load fixture…</option>
           ${ex.fixtures.map(f => `<option value="${f.id}"${fixture?.id === f.id ? ' selected' : ''}>${f.label}</option>`).join('')}
         </select>`
      : '';

    actions.innerHTML = `
      ${fixtureHTML}
      <button type="button" class="action-btn" id="action-submit">Submit</button>
      <button type="button" class="action-btn secondary" id="action-reset">Reset</button>
    `;

    const formEl = document.createElement('formspec-render');
    formEl.id = 'form';
    // Shell is light; pin skin so prefers-color-scheme: dark does not use default dark tokens on #f9f9f9 / white panels.
    formEl.setAttribute('data-formspec-appearance', 'light');

    // Tabs — two visual sections: interactive (form + submit) vs read-only source JSON
    const tabs = document.createElement('div');
    tabs.className = 'example-tabs';

    const groupExperience = document.createElement('div');
    groupExperience.className = 'tab-group tab-group--experience';
    const labelExp = document.createElement('span');
    labelExp.className = 'tab-group-label';
    labelExp.id = 'tab-group-label-experience';
    labelExp.textContent = 'Interactive';
    const listExp = document.createElement('div');
    listExp.className = 'tab-group-pills';
    listExp.setAttribute('role', 'tablist');
    listExp.setAttribute('aria-labelledby', 'tab-group-label-experience');

    const tabForm = document.createElement('button');
    tabForm.type = 'button';
    tabForm.className = 'example-tab example-tab--form';
    tabForm.id = 'tab-form';
    tabForm.setAttribute('role', 'tab');
    tabForm.setAttribute('aria-controls', 'panel-form');
    tabForm.textContent = 'Form';

    const tabClient = document.createElement('button');
    tabClient.type = 'button';
    tabClient.className = 'example-tab example-tab--results';
    tabClient.id = 'tab-client';
    tabClient.setAttribute('role', 'tab');
    tabClient.setAttribute('aria-controls', 'panel-client');
    tabClient.textContent = 'Submit output';

    listExp.appendChild(tabForm);
    listExp.appendChild(tabClient);
    groupExperience.appendChild(labelExp);
    groupExperience.appendChild(listExp);

    const railDivider = document.createElement('div');
    railDivider.className = 'tab-rail-divider';
    railDivider.setAttribute('aria-hidden', 'true');

    const groupSource = document.createElement('div');
    groupSource.className = 'tab-group tab-group--source';
    const labelSrc = document.createElement('span');
    labelSrc.className = 'tab-group-label';
    labelSrc.id = 'tab-group-label-source';
    labelSrc.textContent = 'Source JSON';
    const listSrc = document.createElement('div');
    listSrc.className = 'tab-group-pills';
    listSrc.setAttribute('role', 'tablist');
    listSrc.setAttribute('aria-labelledby', 'tab-group-label-source');

    groupSource.appendChild(labelSrc);
    groupSource.appendChild(listSrc);
    tabs.appendChild(groupExperience);
    tabs.appendChild(railDivider);
    tabs.appendChild(groupSource);

    const panelForm = document.createElement('div');
    panelForm.className = 'example-tabpanel tabpanel-shell tabpanel-shell--form';
    panelForm.id = 'panel-form';
    panelForm.setAttribute('role', 'tabpanel');
    panelForm.setAttribute('aria-labelledby', 'tab-form');

    const panelClient = document.createElement('div');
    panelClient.className = 'example-tabpanel tabpanel-shell tabpanel-shell--results';
    panelClient.id = 'panel-client';
    panelClient.setAttribute('role', 'tabpanel');
    panelClient.setAttribute('aria-labelledby', 'tab-client');

    const formFrame = document.createElement('div');
    formFrame.className = 'live-form-frame';
    const formHead = document.createElement('div');
    formHead.className = 'live-form-head';
    formHead.innerHTML = `
      <span class="live-form-badge">Live form</span>
      <span class="live-form-note">Edit fields and navigate like an end user</span>
    `;
    formFrame.appendChild(formHead);
    formFrame.appendChild(formEl);
    panelForm.appendChild(formFrame);
    panelClient.appendChild(clientPanel);

    /** @type {{ id: string, button: HTMLButtonElement, panel: HTMLElement }[]} */
    const tabEntries = [
      { id: 'form', button: tabForm, panel: panelForm },
      { id: 'client', button: tabClient, panel: panelClient },
    ];

    const jsonSpecs = [
      {
        id: 'json-definition',
        label: 'Definition',
        displayPath: `${ex.dir.replace(/^\//, '')}/${ex.artifacts.definition}`,
        data: definition,
      },
    ];
    if (componentDoc) {
      jsonSpecs.push({
        id: 'json-component',
        label: 'Component',
        displayPath: `${ex.dir.replace(/^\//, '')}/${ex.artifacts.component}`,
        data: componentDoc,
      });
    }
    if (themeDoc) {
      jsonSpecs.push({
        id: 'json-theme',
        label: 'Theme',
        displayPath: `${ex.dir.replace(/^\//, '')}/${ex.artifacts.theme}`,
        data: themeDoc,
      });
    }
    if (registryDoc) {
      jsonSpecs.push({
        id: 'json-registry',
        label: 'Registry',
        displayPath: ex.registry.replace(/^\//, ''),
        data: registryDoc,
      });
    }
    if (fixture && fixtureResponse) {
      jsonSpecs.push({
        id: 'json-fixture',
        label: 'Fixture',
        displayPath: `${ex.dir.replace(/^\//, '')}/${fixture.file}`,
        data: fixtureResponse,
      });
    }

    for (const spec of jsonSpecs) {
      const tabSrc = document.createElement('button');
      tabSrc.type = 'button';
      tabSrc.className = 'example-tab example-tab--source';
      tabSrc.id = `tab-${spec.id}`;
      tabSrc.setAttribute('role', 'tab');
      tabSrc.textContent = spec.label;
      const panelSrc = document.createElement('div');
      panelSrc.className = 'example-tabpanel json-source-panel tabpanel-shell tabpanel-shell--artifact';
      panelSrc.id = `panel-${spec.id}`;
      panelSrc.setAttribute('role', 'tabpanel');
      panelSrc.setAttribute('aria-labelledby', tabSrc.id);
      const pathId = `path-${spec.id}`;
      panelSrc.innerHTML = `
        <div class="artifact-panel-head">
          <span class="artifact-badge">Repository file</span>
          <span class="artifact-head-note">Read-only — same payload the app loaded</span>
        </div>
        <p class="json-source-path" id="${pathId}">${spec.displayPath}</p>
        <pre class="json-source-pre" aria-labelledby="${pathId}"></pre>
      `;
      panelSrc.querySelector('pre').textContent = JSON.stringify(spec.data, null, 2);
      tabSrc.setAttribute('aria-controls', panelSrc.id);
      tabSrc.addEventListener('click', () => setActiveTab(spec.id));
      listSrc.appendChild(tabSrc);
      tabEntries.push({ id: spec.id, button: tabSrc, panel: panelSrc });
    }

    function setActiveTab(which) {
      for (const { id, button, panel } of tabEntries) {
        const on = id === which;
        button.setAttribute('aria-selected', String(on));
        button.classList.toggle('active', on);
        panel.classList.toggle('active', on);
      }
    }

    tabForm.addEventListener('click', () => setActiveTab('form'));
    tabClient.addEventListener('click', () => setActiveTab('client'));

    setActiveTab('form');

    actions.querySelector('#action-submit').addEventListener('click', () => {
      // This will touch all fields and update latest submit detail; it will also
      // emit formspec-submit by default, which we use to render panels below.
      formEl.submit({ mode: 'submit', emitEvent: true });
    });

    actions.querySelector('#action-reset').addEventListener('click', () => {
      // Reload the example with no fixture — clean slate.
      activeExampleId = null;
      loadExample(ex);
    });

    // Fixture selector: reload the form with the selected fixture's saved state
    const fixtureSelect = actions.querySelector('#fixture-select');
    if (fixtureSelect) {
      fixtureSelect.addEventListener('change', () => {
        const fixtureId = fixtureSelect.value;
        if (!fixtureId) {
          // "Load fixture…" selected — reset to clean state
          activeExampleId = null;
          loadExample(ex);
          return;
        }
        const selected = ex.fixtures.find(f => f.id === fixtureId);
        if (!selected) return;
        // Full reload with fixture — same as restoring a saved session
        activeExampleId = null;
        loadExample(ex, selected);
      });
    }

    container.appendChild(actions);
    container.appendChild(tabs);
    container.appendChild(panelForm);
    container.appendChild(panelClient);
    for (let i = 2; i < tabEntries.length; i++) {
      container.appendChild(tabEntries[i].panel);
    }

    mainArea.appendChild(container);

    if (registryDoc) {
      formEl.registryDocuments = registryDoc;
    }

    // Default Formspec skin (tokens, inputs, etc.) only for the built-in renderer — not USWDS.
    if (ex.adapter !== 'uswds') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = formspecDefaultCssUrl;
      document.head.appendChild(link);
      activeDefaultSkinLink = link;
    }

    // Switch adapter if specified
    if (ex.adapter) {
      globalRegistry.setAdapter(ex.adapter);
    } else {
      globalRegistry.setAdapter('default');
    }

    if (fixtureResponse?.data) {
      formEl.initialData = fixtureResponse.data;
    }

    // Set artifacts — this creates the engine, applies initialData (screener + main form), and renders
    formEl.definition = definition;
    if (componentDoc) formEl.componentDocument = componentDoc;
    if (themeDoc) formEl.themeDocument = themeDoc;

    formEl.addEventListener('formspec-submit', (e) => {
      const submitDetail = e.detail || {};
      const vr = submitDetail.validationReport || {};
      const response = submitDetail.response || {};

      const metaEl = clientPanel.querySelector('#client-meta');
      const emptyEl = clientPanel.querySelector('#client-empty');
      metaEl.textContent = vr.counts
        ? `valid=${!!vr.valid}  errors=${vr.counts.error || 0}  warnings=${vr.counts.warning || 0}`
        : `valid=${!!vr.valid}`;

      if (emptyEl) emptyEl.remove();
      clientPanel.querySelector('#client-validation-pre').textContent = JSON.stringify(vr, null, 2);
      clientPanel.querySelector('#client-response-pre').textContent = JSON.stringify(response, null, 2);
      setActiveTab('client');
    });

  } catch (err) {
    mainArea.innerHTML = `
      <div class="state-message">
        <h2>Failed to load</h2>
        <p>${err.message}</p>
      </div>
    `;
    activeExampleId = null;
  }
}

// ── Load from hash on startup ──
function loadFromHash() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const ex = EXAMPLES.find(e => e.id === hash);
    if (ex) {
      loadExample(ex);
      return;
    }
  }
  // Auto-load first example
  if (EXAMPLES.length > 0) {
    loadExample(EXAMPLES[0]);
  }
}

window.addEventListener('hashchange', loadFromHash);
loadFromHash();
