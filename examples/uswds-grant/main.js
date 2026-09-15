/** @filedesc Entry point for the USWDS Grant Application demo. */
import '@formspec-org/webcomponent/formspec-layout.css';
import { FormspecRender, globalRegistry, emitThemeTokens } from '@formspec-org/webcomponent';
import { uswdsAdapter } from '@formspec-org/adapters';
import { initFormspecEngine } from '@formspec-org/engine';

import definition from './grant.definition.json';
import theme from './grant.theme.json';

await initFormspecEngine();
customElements.define('formspec-render', FormspecRender);
// Registering is the whole host obligation: grant.theme.json names `"adapter": "uswds"`, and the renderer
// links the adapter's own stylesheet. No USWDS CSS is imported here.
globalRegistry.registerAdapter(uswdsAdapter);

emitThemeTokens(theme.tokens);

const el = document.querySelector('formspec-render');
el.themeDocument = theme;
el.definition = definition;

// ── Source JSON modal ──
const SOURCE_FILES = [
    { label: 'grant.definition.json', data: definition },
    { label: 'grant.theme.json', data: theme },
];

const modal = document.getElementById('source-modal');
const tabBar = document.getElementById('source-tabs');
const pre = document.getElementById('source-pre');
let activeTab = 0;

function renderTabs() {
    tabBar.innerHTML = '';
    SOURCE_FILES.forEach((f, i) => {
        const btn = document.createElement('button');
        btn.role = 'tab';
        btn.setAttribute('aria-selected', String(i === activeTab));
        btn.className = `source-tab${i === activeTab ? ' source-tab--active' : ''}`;
        btn.textContent = f.label;
        btn.addEventListener('click', () => { activeTab = i; renderTabs(); });
        tabBar.appendChild(btn);
    });
    pre.textContent = JSON.stringify(SOURCE_FILES[activeTab].data, null, 2);
}

document.getElementById('source-btn').addEventListener('click', () => {
    renderTabs();
    modal.showModal();
});

document.getElementById('source-close').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
