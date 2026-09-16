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

| Tool | Category | Description |
|------|----------|-------------|
| `formspec.form.describe` | Introspection | Form metadata and status |
| `formspec.field.list` | Introspection | List fields with filter (`all`, `required`, `empty`, `invalid`, `relevant`) |
| `formspec.field.describe` | Introspection | Field state, validation, widget hint, repeat metadata, and help |
| `formspec.field.help` | Introspection | Resolve references and ontology for a field |
| `formspec.form.progress` | Introspection | Required/filled/valid counts and page progress |
| `formspec.field.set` | Mutation | Set a single field value |
| `formspec.field.bulkSet` | Mutation | Set multiple field values |
| `formspec.form.validate` | Validation | Full validation report (`continuous` or `submit` mode) |
| `formspec.field.validate` | Validation | Field-scoped validation results |
| `formspec.profile.match` | Profile | Match profile values to form fields by concept identity |
| `formspec.profile.apply` | Profile | Apply matched values with optional confirmation |
| `formspec.profile.learn` | Profile | Save form values to profile by concept identity |
| `formspec.form.pages` | Navigation | Page-level progress |
| `formspec.form.nextIncomplete` | Navigation | Next incomplete field or page |

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
  registerWebMCP: true,          // Register on document.modelContext (default)
  modelContext: undefined,       // Or inject a WebMCP.ModelContext (polyfill, fake)
});
await provider.ready;            // WebMCP registration acknowledged
```

## WebMCP

The browser transport is [WebMCP](https://webmachinelearning.github.io/webmcp/) (`document.modelContext`, W3C WebML CG draft; Chrome 149 / Edge 150 origin trials, `chrome://flags/#enable-webmcp-testing` locally). Types come from the CG's [`webmcp-types`](https://www.npmjs.com/package/webmcp-types).

- Every tool registers with `registerTool(tool, { signal })`; `detach()` aborts the signal, which unregisters them and fires `toolchange`.
- Each tool carries a `title` (shown in browser consent UI), per-property `description`s, and annotations: `readOnlyHint` on introspection, `consequentialHint` on writes (`field.set`, `field.bulkSet`, `profile.apply`, `profile.learn`), `untrustedContentHint` where sidecar content is relayed (`field.help`, `field.describe`). Browsers and agents use `consequentialHint` to gate their own confirmation prompt; `confirmProfileApply` is the provider-side gate on top.
- `execute` returns the payload object directly — the browser JSON-stringifies it — and returns errors as `{ error: ToolError }` values, because a rejected `execute` reaches the caller as a bare `UnknownError`.
- The provider never installs a polyfill. When `document.modelContext` is absent (every browser without the trial/flag), registration is a no-op and `ready` resolves. Hosts that want in-page agents there load a polyfill first — [`@mcp-b/webmcp-polyfill`](https://www.npmjs.com/package/@mcp-b/webmcp-polyfill) tracks the draft and the declarative WPT suite — or pass their own `modelContext`.
- `registerAssistTools(provider, modelContext, { signal })` is exported for hosts that own the registration lifecycle themselves.

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
