# @formspec-org/assist

Reference implementation of the [Formspec Assist Specification](../../specs/assist/assist-spec.md) — a transport-agnostic interoperability contract for software that helps people complete forms.

## What It Does

Assist exposes a structured tool catalog over a live Formspec form. An agent, browser extension, accessibility tool, or chat layer can:

- **Introspect** — discover fields, pages, progress, and live validation state.
- **Get help** — resolve contextual references, ontology concepts, and semantic equivalents for any field.
- **Mutate** — set field values individually or in bulk, with readonly/relevance guards.
- **Autofill** — match a user profile against form fields by ontology concept identity, then apply values with optional human-in-the-loop confirmation.
- **Navigate** — find the next incomplete field or page.

The protocol is LLM-independent, transport-neutral, and additive — it does not alter core Formspec processing semantics.

## Quick Start

```typescript
import { createAssistProvider } from '@formspec-org/assist';
import { FormEngine, initFormspecEngine } from '@formspec-org/engine';

await initFormspecEngine();

const engine = new FormEngine(definition);
const provider = createAssistProvider({ engine });

// Introspect
const tools = provider.getTools();
const progress = await provider.invokeTool('formspec.form.progress', {});

// Get field help (references + ontology)
const help = await provider.invokeTool('formspec.field.help', {
  path: 'organization.ein',
  audience: 'agent',
});

// Set a value
const result = await provider.invokeTool('formspec.field.set', {
  path: 'organization.ein',
  value: '12-3456789',
});
```

## Tool Catalog

Titles are what a browser's consent UI and an agent's tool picker show. WebMCP registers the **Default** column unless configured otherwise (see below): `yes` always, `profile` when the provider has a profile configured, blank only with `tools: 'all'`.

| Tool | Title | Category | Default | Description |
|------|-------|----------|:-------:|-------------|
| `formspec.form.describe` | Describe form | Introspection | yes | Form metadata and status |
| `formspec.form.progress` | Show form progress | Introspection | yes | Required/filled/valid counts and page progress |
| `formspec.field.list` | List fields | Introspection | yes | List fields with filter (`all`, `required`, `empty`, `invalid`, `relevant`) |
| `formspec.field.describe` | Describe field | Introspection | yes | Field state, validation, widget hint, repeat metadata, and help |
| `formspec.field.help` | Get field help | Introspection | yes | Authoritative guidance for a field: definition, examples, the rule behind it (`includeContent`, `maxBytes`) |
| `formspec.field.set` | Set field value | Mutation | | Set a single field value (`overwrite`) |
| `formspec.field.bulkSet` | Set several field values | Mutation | yes | Set several field values; entries succeed or fail independently (`overwrite`) |
| `formspec.form.validate` | Validate form | Validation | yes | Full validation report under a profile (`live`, `on-submit`, `on-demand`, `off`) |
| `formspec.field.validate` | Validate field | Validation | | Field-scoped validation results |
| `formspec.profile.match` | Match saved profile | Profile | profile | Match profile values to form fields by concept identity |
| `formspec.profile.apply` | Apply saved profile values | Profile | profile | Apply matched values by `paths`, with optional confirmation (`confirm`, `overwrite`) |
| `formspec.profile.learn` | Save values to profile | Profile | profile | Save form values to profile by concept identity |
| `formspec.form.pages` | Show page progress | Navigation | | Page-level progress (also inside `form.progress`) |
| `formspec.form.nextIncomplete` | Find next incomplete | Navigation | yes | Next incomplete field or page |

## Configuration

```typescript
const provider = createAssistProvider({
  engine,                        // Required — live FormEngine instance
  references: referencesDoc,     // ReferencesDocument or ReferencesDocument[]
  ontology: ontologyDoc,         // OntologyDocument or OntologyDocument[]
  component: componentDoc,       // ComponentDocument (for page resolution)
  theme: themeDoc,               // ThemeDocument (for page resolution)
  profile: userProfile,          // UserProfile for autofill
  registries: [registryDoc],     // RegistryDocument[] or RegistryEntry[]
  storage: localStorage,         // StorageBackend for profile persistence
  profileMatchThreshold: 0.5,    // Minimum confidence for profile matches
  confirmProfileApply: (req) =>  // Provider-side confirmation for confirm: true
    confirm(`Apply ${req.matches.length} values?`),
  registerWebMCP: true,          // Register the default tool set on document.modelContext (default)
  // registerWebMCP: { tools: 'all' },  // Or the whole catalog; false skips registration
  modelContext: undefined,       // Or inject a WebMCP.ModelContext (polyfill, fake)
});
await provider.ready;            // WebMCP registration acknowledged
```

## WebMCP

The browser transport is [WebMCP](https://webmachinelearning.github.io/webmcp/) (`document.modelContext`, W3C WebML CG draft; Chrome 149 / Edge 150 origin trials, `chrome://flags/#enable-webmcp-testing` locally). Types come from the CG's [`webmcp-types`](https://www.npmjs.com/package/webmcp-types).

- Every registered tool goes through `registerTool(tool, { signal })`; `detach()` aborts the signal, which unregisters them and fires `toolchange`.
- **Registration profile.** `registerWebMCP: true` (or `{ tools: 'default' }`) registers the eight tools marked Default above — one tool per job, no overlap — plus the three `profile.*` tools when the provider has a profile configured (`provider.hasProfile()`). `{ tools: 'all' }` registers the whole catalog. The sets are exported as `DEFAULT_WEBMCP_TOOLS` and `PROFILE_WEBMCP_TOOLS`; `registerAssistTools` also takes an explicit name list.
- **Registered schemas carry no `additionalProperties`**, at any depth. In-process validation keeps the strict declaration: an unknown key still fails with `INVALID_VALUE`, and every `INVALID_VALUE` message names the fix (allowed enum values, accepted keys, the missing property's type and description, or the expected shape).
- Every `ToolError` carries `retryable`: `true` when the same call can succeed with corrected arguments (`NOT_FOUND`, `INVALID_PATH`, `INVALID_VALUE`, `NOT_RELEVANT`, `UNSUPPORTED`); otherwise ask the human.
- Each tool carries a `title` (shown in browser consent UI), per-property `description`s, and annotations: `readOnlyHint` on introspection, `consequentialHint` on writes (`field.set`, `field.bulkSet`, `profile.apply`, `profile.learn`), `untrustedContentHint` where sidecar content is relayed (`field.help`, `field.describe`). Browsers and agents use `consequentialHint` to gate their own confirmation prompt; `confirmProfileApply` is the provider-side gate on top.
- `execute` returns the payload object directly — the browser JSON-stringifies it — and returns errors as `{ error: ToolError }` values, because a rejected `execute` reaches the caller as a bare `UnknownError`.
- The provider never installs a polyfill. When `document.modelContext` is absent (every browser without the trial/flag), registration is a no-op and `ready` resolves. Hosts that want in-page agents there load a polyfill first — [`@mcp-b/webmcp-polyfill`](https://www.npmjs.com/package/@mcp-b/webmcp-polyfill) tracks the draft and the declarative WPT suite — or pass their own `modelContext`.
- One provider per document: tool names are fixed, so a second `createAssistProvider` on the same `document.modelContext` has every registration refused and its `ready` rejects. Detach the old one first.
- `ready` resolves when the host acknowledges registration, or immediately when the provider was detached before that; it rejects only on a host refusal, and never surfaces as an unhandled rejection when nobody awaits it.
- `confirmProfileApply` receives `{ matches, signal }`; the signal aborts when the agent cancels, so dismiss the dialog.
- `registerAssistTools(provider, modelContext, { signal, tools })` is exported for hosts that own the registration lifecycle themselves; `tools` is `'default'`, `'all'`, or a list of tool names.

In-page consumers discover and call tools with `document.modelContext.getTools()` / `executeTool(tool, input)`; the browser's own agent reads them without page script.

## Sidecar Documents

Assist resolves field context from two companion document types:

- **References** — contextual help entries (documentation, examples, regulations) bound to field paths. Entries are filtered by audience (`human`, `agent`, `both`) and sorted by priority (`primary` > `supplementary` > `background`).
- **Ontology** — semantic concept bindings that give fields stable identity across forms. Powers cross-form autofill via profile matching.

Both target a specific definition URL and optional version range. Multiple documents of each type are supported; references merge additively, ontology uses last-loaded-wins for conflicts.

## Architecture

```
┌─────────────────────────────────────────────┐
│  AssistProvider                              │
│  ├── Tool Catalog (see getTools())          │
│  ├── ContextResolver (references + ontology)│
│  ├── ProfileMatcher (concept-based autofill) │
│  ├── ProfileStore (persistent storage)       │
│  └── WebMCP binding (document.modelContext)  │
└─────────────────────────────────────────────┘
         │
         ▼
┌──────────────┐  ┌───────────────┐
│  FormEngine  │  │  Layout       │
│  (layer 1)   │  │  (layer 1)    │
└──────────────┘  └───────────────┘
```

The package sits between the engine layer and consumer-facing transports. It depends on `formspec-engine` (form state), `formspec-layout` (page resolution), and `formspec-types` (shared type vocabulary).

## Testing

```bash
# From package directory
npx vitest run

# With verbose output
npx vitest run --reporter=verbose

# Watch mode
npx vitest
```

Coverage spans the tool catalog, error codes, profile workflows, sidecar resolution, page navigation, repeat groups, and the WebMCP binding (against a spec-shaped fake `ModelContext` in `tests/helpers.ts`).
