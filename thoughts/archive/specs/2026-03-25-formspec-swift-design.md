# formspec-swift — Native SwiftUI Form Renderer

**Date:** 2026-03-25
**Status:** Approved

## Problem

Formspec has no native mobile story. iOS apps can't render formspec-defined forms without embedding a full web view with the web component — which means no native UI, no SwiftUI composability, and no "bring your own components" story for iOS developers. The same gap exists on Android (Kotlin/Compose), but this spec targets Swift/SwiftUI first.

## Key Insight

`FormEngine` already manages the full reactive form lifecycle: field values, visibility, validation, FEL evaluation, repeat groups, and locale resolution. Rather than rewriting this in Swift, we embed the existing TS engine + WASM in a hidden `WKWebView` and bridge state updates to Swift `@Observable` objects. The public API is designed so the internal bridge can later be swapped to a native Rust FFI (Approach C) without breaking consumers.

## Design Decisions

1. **Approach B** — WebView bridge (hidden `WKWebView` running `formspec-engine` + WASM), with Approach C (thin Rust FFI + Swift reactive shell) documented as the future migration path
2. **Layer 2** in the dependency fence, peer to `formspec-webcomponent` and `formspec-react`
3. **iOS 17+** — uses `@Observable` macro for the cleanest SwiftUI integration
4. **Pre-generated layout plans** — the server/CLI runs the TS layout planner; the mobile app receives a `LayoutNode` JSON tree and renders it
5. **RenderingBundle** — single input type carrying definition, layout plan, component doc, theme, registry entries, and locale data. Developers load these however they want.
6. **Component map with overrides** — same pattern as formspec-react. Default components use native SwiftUI; developers override any subset.
7. **Runtime locale switching** — bundle carries all locale documents; engine supports `setLocale()` at runtime

## Architecture

```
formspec-engine (layer 1)        formspec-layout (layer 1)
    │ FormEngine + WASM              │ LayoutNode, planner
    │ FEL eval, validation           │ theme cascade
    │ Preact signals                 │
    └──────────┬─────────────────────┘
               │ (bundled into HTML resource)
    ┌──────────▼──────────────────────┐
    │  Hidden WKWebView               │
    │  ├─ formspec-engine JS bundle   │
    │  ├─ WASM binary                 │
    │  └─ Message dispatcher          │
    └──────────┬──────────────────────┘
               │ JSON messages (WKScriptMessageHandler)
    ┌──────────▼──────────────────────┐
    │      formspec-swift              │  Layer 2
    │                                  │
    │  Bridge Layer (internal):        │
    │    WebViewEngine                 │  hidden WKWebView lifecycle
    │    MessageProtocol               │  typed command/event envelopes
    │                                  │
    │  Public API Layer:               │
    │    FormspecEngine                 │  @Observable engine wrapper
    │    FieldState                    │  @Observable per-field state
    │    FormState                     │  @Observable form-level state
    │    RenderingBundle               │  definition + all documents
    │                                  │
    │  Renderer Layer:                 │
    │    FormspecForm                   │  walks LayoutNode → SwiftUI
    │    FormspecField                  │  dispatches to field component
    │    FormspecLayout                 │  dispatches to layout component
    │                                  │
    │  Default Components:             │
    │    Native SwiftUI controls       │  TextField, Toggle, Picker, etc.
    │    Accessibility from FieldState │
    └──────────────────────────────────┘
```

## RenderingBundle

The single input type. Developers don't care where the data comes from — bundled assets, API fetch, local cache.

```swift
struct RenderingBundle: Codable {
    let definition: JSONValue          // assembled definition ($refs resolved)
    let layoutPlan: JSONValue          // pre-generated LayoutNode tree
    let component: JSONValue?          // component document (optional)
    let theme: JSONValue?              // theme document (optional)
    let registry: [JSONValue]?         // registry entries (optional)
    let locales: [String: JSONValue]?  // "en" → locale doc, "es" → locale doc
    let defaultLocale: String?         // initial locale (defaults to "en")
    let runtimeContext: RuntimeContext? // runtime context for FEL evaluation
}

struct RuntimeContext: Codable {
    let meta: [String: JSONValue]?     // form-instance metadata ($meta.key in FEL)
    let timeZone: String?              // IANA timezone (defaults to device timezone)
    let seed: Int?                     // deterministic random seed
}
```

`JSONValue` is a lightweight `Codable` enum: `string | number | bool | null | array | object`.

## FormspecEngine

```swift
@MainActor @Observable
class FormspecEngine {
    // Field state lookup (lazy — creates/caches on first access, supports repeat groups)
    func fieldState(for path: String) -> FieldState?

    // Form-level state
    let formState: FormState

    // Locale
    private(set) var currentLocale: String
    var availableLocales: [String]

    // Factory (async because WebView must load)
    static func create(bundle: RenderingBundle) async throws -> FormspecEngine

    // Mutations
    func setValue(_ path: String, value: Any?)
    func setLocale(_ languageCode: String)
    func setResponse(_ data: JSONValue)
    func addRepeatInstance(_ groupName: String) -> Int?
    func removeRepeatInstance(_ groupName: String, at index: Int)

    // Queries
    func getResponse() -> JSONValue
    func getValidationReport(mode: ValidationMode = .continuous) -> ValidationReport

    // Layout
    let rootLayoutNode: LayoutNode

    // Lifecycle
    func dispose()
}

enum ValidationMode {
    case continuous  // validate as user types
    case submit      // validate on submit (suppresses untouched fields)
}
```

`@MainActor` because `WKWebView` is MainActor-bound and all state updates flow through it. `create()` is a static async factory because `WKWebView` loading is async and Swift `init` cannot be async on `@Observable` classes. `fieldState(for:)` is a method (not a dictionary) because repeat groups create new field instances dynamically — the engine lazily creates and caches `FieldState` objects from bridge events. `dispose()` tears down the `WKWebView` and cleans up subscriptions; also called from `deinit`.

## FieldState

Mirrors `FieldViewModel` from `formspec-engine`. All properties are `@Observable` — SwiftUI views that read them re-render automatically.

```swift
@Observable
class FieldState {
    // Identity (stable)
    let templatePath: String
    let instancePath: String
    let id: String
    let itemKey: String
    let dataType: String
    let disabledDisplay: DisabledDisplay  // resolved once from definition, not reactive

    // Presentation (reactive, locale-resolved, FEL-interpolated)
    private(set) var label: String
    private(set) var hint: String?
    private(set) var description: String?

    // State (reactive)
    private(set) var value: Any?
    private(set) var required: Bool
    private(set) var visible: Bool
    private(set) var readonly: Bool

    // Interaction tracking (reactive)
    private(set) var touched: Bool

    // Validation (reactive)
    private(set) var errors: [ResolvedValidationResult]
    private(set) var firstError: String?

    // Options (reactive, for choice fields)
    private(set) var options: [ResolvedOption]
    private(set) var optionsLoading: Bool
    private(set) var optionsError: String?

    // Write — delegates to engine
    func setValue(_ value: Any?)
    func touch()
}
```

`templatePath` and `instancePath` are both exposed (intentional divergence from React's single `path` — more information for custom components). `disabledDisplay` is `let` (constant) because it is resolved once from the definition and does not change reactively. `touched` tracks whether the user has interacted with the field; validation errors are typically suppressed for untouched fields in UX.

## FormState

Mirrors `FormViewModel`. Reactive form-level state.

```swift
@Observable
class FormState {
    private(set) var title: String
    private(set) var description: String
    private(set) var isValid: Bool
    private(set) var validationSummary: ValidationSummary

    // Page titles/descriptions are reactive (update on locale change, FEL recalc)
    // Cached internally as @Observable properties keyed by pageId
    func pageTitle(_ pageId: String) -> String
    func pageDescription(_ pageId: String) -> String
}

struct ValidationSummary {
    let errors: Int
    let warnings: Int
    let infos: Int
}
```

`pageTitle` and `pageDescription` are methods that return reactive values — internally they cache per-pageId strings as `@Observable` properties, so SwiftUI views that call them re-render when the locale changes or FEL dependencies update. This matches the engine's `FormViewModel` which returns `ReadonlyEngineSignal<string>` for these methods.

## WebView Bridge (Internal)

Two internal files — not public API.

### WebViewEngine

Manages the hidden `WKWebView` lifecycle:

- Loads a self-contained `formspec-engine.html` shipped as a Swift Package resource
- The HTML bundles the tree-shaken `formspec-engine` JS and inlined WASM binary
- On load: calls `initFormspecEngine()`, creates `FormEngine`, sets definition and rendering context
- Installs a `WKScriptMessageHandler` named `formspec` to receive batched state updates
- Exposes `callEngine(_ command: EngineCommand) async throws`

### MessageProtocol

Typed command/event envelopes:

```swift
// Swift → JS (commands)
enum EngineCommand: Codable {
    case initialize(RenderingBundle)       // creates engine, loads all locales, sets definition
    case setValue(path: String, value: JSONValue?)
    case setLocale(languageCode: String)
    case setResponse(JSONValue)            // bulk-load existing response data
    case touchField(path: String)
    case addRepeatInstance(groupName: String)
    case removeRepeatInstance(groupName: String, index: Int)
    case getResponse
    case getValidationReport(mode: String) // "continuous" or "submit"
}

// JS → Swift (state updates)
enum EngineEvent: Codable {
    case fieldStateChanged(path: String, changes: FieldStatePatch)
    case formStateChanged(changes: FormStatePatch)
    case repeatChanged(groupName: String, count: Int)
    case responseResult(JSONValue)
    case validationReportResult(ValidationReport)
    case engineReady
    case engineError(message: String)
}
```

The `initialize` command creates the `FormEngine` with the definition and runtime context, then calls `engine.loadLocale()` for each entry in the `locales` map, and sets the active locale to `defaultLocale`. After initialization, the JS side installs signal effects on all field and form state, and posts a batch of initial `fieldStateChanged` / `formStateChanged` events followed by `engineReady`.

### Batching

The JS side collects all signal changes within a microtask (using `queueMicrotask` after the first change), then posts a single message with an array of `EngineEvent`s. A single `setValue` that triggers cascading FEL recalculations, visibility changes, and validation results arrives as one batched update, minimizing bridge crossings.

### HTML Bundle

A single `formspec-engine.html` resource containing:
- Inlined `formspec-engine` JS bundle (tree-shaken — no renderer, no webcomponent, no studio code)
- WASM binary loaded from package resources
- A thin message dispatcher: `EngineCommand` → engine method calls, engine signal effects → batched `EngineEvent` array → `webkit.messageHandlers.formspec.postMessage()`

## LayoutNode

Swift `Codable` representation of the pre-generated layout tree. Decoded from the `layoutPlan` JSON in the `RenderingBundle`.

```swift
struct LayoutNode: Codable {
    let id: String
    let component: String              // "TextInput", "Stack", "Card", etc.
    let category: NodeCategory         // .layout, .field, .display, .interactive, .special
    let props: [String: JSONValue]
    let style: [String: JSONValue]?
    let cssClasses: [String]
    let accessibility: AccessibilityInfo?
    let children: [LayoutNode]

    // Field binding
    let bindPath: String?
    let fieldItem: FieldItemInfo?
    let presentation: Presentation?
    let labelPosition: LabelPosition?

    // Conditional rendering
    let when: String?                  // FEL expression string
    let whenPrefix: String?
    let fallback: String?

    // Repeat groups
    let repeatGroup: String?
    let repeatPath: String?
    let isRepeatTemplate: Bool?
}

struct FieldItemInfo: Codable {
    let key: String
    let label: String
    let hint: String?
    let dataType: String?
}

struct AccessibilityInfo: Codable {
    let role: String?
    let description: String?
    let liveRegion: String?
}

struct Presentation: Codable {
    let widget: String?
    let widgetConfig: [String: JSONValue]?
    let labelPosition: LabelPosition?
    let style: [String: JSONValue]?
    let accessibility: AccessibilityInfo?
    let cssClass: String?
}

enum NodeCategory: String, Codable {
    case layout, field, display, interactive, special
}

enum LabelPosition: String, Codable {
    case top, start, hidden
}
```

## Error Handling

```swift
enum FormspecError: Error {
    case wasmLoadFailed(underlying: Error)      // WASM binary failed to initialize
    case engineLoadFailed(message: String)      // JS engine initialization failed
    case definitionInvalid(message: String)     // definition JSON rejected by engine
    case bridgeDisconnected                     // WKWebView process crashed or was terminated
    case bridgeTimeout                          // engine did not respond within deadline
    case localeNotAvailable(languageCode: String) // requested locale not in bundle
}
```

`bridgeDisconnected` is detected via `WKNavigationDelegate.webViewWebContentProcessDidTerminate`. The engine attempts one automatic recovery (reload the WebView, re-initialize with the same bundle). If recovery fails, the error is surfaced to the consumer.

## Component Map

```swift
struct ComponentMap {
    var fields: [String: any FieldComponent.Type]
    var layout: [String: any LayoutComponent.Type]

    static let defaults: ComponentMap

    func replacing(field key: String, with type: any FieldComponent.Type) -> ComponentMap
    func replacing(layout key: String, with type: any LayoutComponent.Type) -> ComponentMap
}

protocol FieldComponent: View {
    init(state: FieldState, node: LayoutNode)
}

protocol LayoutComponent: View {
    init(node: LayoutNode, children: [AnyView])
}
```

`FieldComponent` receives the full `LayoutNode` (not just `Presentation?`) so custom components can access `node.props`, `node.cssClasses`, `node.style`, `node.accessibility`, and `node.presentation`. This matches the React pattern where field components receive the full node context.

## Auto-Renderer

`FormspecForm` walks the `LayoutNode` tree and dispatches to the component map:

```swift
struct FormspecForm: View {
    let engine: FormspecEngine
    var components: ComponentMap = .defaults

    var body: some View {
        FormspecLayout(
            node: engine.rootLayoutNode,
            engine: engine,
            components: components
        )
    }
}
```

`FormspecField` reads `FieldState` for the node's `bindPath`, resolves the component type from the map, and passes state + presentation. `FormspecLayout` reads the `LayoutNode` component type, resolves the layout component, and passes node + rendered children.

### Default Component Mapping

| LayoutNode component | SwiftUI control | Notes |
|---------------------|-----------------|-------|
| `TextInput` | `TextField` | `.accessibilityLabel(state.label)` |
| `NumberInput` | `TextField` | `.keyboardType(.decimalPad)` |
| `TextArea` | `TextEditor` | |
| `Checkbox` | `Toggle` | |
| `Select` | `Picker` | |
| `MultiSelect` | `List` + `Toggle` rows | |
| `DateInput` | `DatePicker` | |
| `RadioGroup` | `Picker(.segmented)` or custom | |
| `Stack` | `VStack` / `HStack` | direction from props |
| `Card` | `GroupBox` or `Section` | |
| `Grid` | `LazyVGrid` | columns from props |
| `Page` | Container with title | |
| `Wizard` | `TabView(.page)` or custom stepper | |

All default components apply:
- `accessibilityLabel` from `state.label`
- `accessibilityHint` from `state.hint`
- Validation error announcements
- Disabled state from `state.readonly`
- Visibility from `state.visible`
- Required indicator from `state.required`

## Usage

### State-only (full control):

```swift
import FormspecSwift

struct MyFormView: View {
    let engine: FormspecEngine

    var body: some View {
        if let name = engine.fieldState(for: "contactInfo.fullName") {
            VStack(alignment: .leading) {
                Text(name.label)
                TextField("", text: Binding(
                    get: { name.value as? String ?? "" },
                    set: { name.setValue($0) }
                ))
                if let error = name.firstError {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.caption)
                }
            }
        }
    }
}
```

### Auto-renderer (drop-in):

```swift
import FormspecSwift

struct ContentView: View {
    @State private var engine: FormspecEngine?

    var body: some View {
        Group {
            if let engine {
                FormspecForm(engine: engine)
            } else {
                ProgressView("Loading form...")
                    .task { try? await loadForm() }
            }
        }
    }

    func loadForm() async throws {
        let bundle = RenderingBundle(
            definition: loadJSON("survey.definition"),
            layoutPlan: loadJSON("survey.layout"),
            component: loadJSON("survey.component"),
            theme: loadJSON("survey.theme"),
            registry: nil,
            locales: [
                "en": loadJSON("survey.locale.en"),
                "es": loadJSON("survey.locale.es")
            ],
            defaultLocale: "en"
        )
        engine = try await FormspecEngine.create(bundle: bundle)
    }
}
```

### Auto-renderer with custom components:

```swift
import FormspecSwift

struct BrandedFormView: View {
    let engine: FormspecEngine

    var body: some View {
        FormspecForm(
            engine: engine,
            components: .defaults
                .replacing(field: "TextInput", with: BrandedTextField.self)
                .replacing(field: "Select", with: BrandedPicker.self)
                .replacing(layout: "Card", with: BrandedCard.self)
        )
    }
}

struct BrandedTextField: FieldComponent {
    let state: FieldState
    let node: LayoutNode

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(state.label)
                .font(.caption)
                .foregroundColor(.secondary)
            TextField("", text: Binding(
                get: { state.value as? String ?? "" },
                set: { state.setValue($0) }
            ))
            .textFieldStyle(.roundedBorder)
            if let error = state.firstError {
                Text(error)
                    .foregroundColor(.red)
                    .font(.caption2)
            }
        }
    }
}
```

### Language switching:

```swift
struct LanguageSwitcher: View {
    let engine: FormspecEngine

    var body: some View {
        Picker("Language", selection: Binding(
            get: { engine.currentLocale },
            set: { engine.setLocale($0) }
        )) {
            ForEach(engine.availableLocales, id: \.self) { locale in
                Text(locale).tag(locale)
            }
        }
    }
}
```

## Kotlin/Compose (Parallel Design)

A parallel `formspec-kotlin` package will follow this same architecture with Kotlin-idiomatic API. Key differences:

- **Bridge:** Android's `WebView` class (same HTML bundle, same message protocol, same batching)
- **Reactivity:** `FieldState` properties are Compose `State<T>` or `StateFlow<T>` for non-Compose consumers
- **Components:** `@Composable` function types instead of View protocols
- **Engine:** `suspend fun FormspecEngine.create(bundle)` instead of `async throws`
- **Threading:** `Dispatchers.Main` instead of `@MainActor`

The message protocol and HTML bundle are shared across both platforms. A dedicated `formspec-kotlin` spec will detail the Kotlin API surface when implementation begins.

## Future Direction — Approach C (Native Rust FFI)

The public API (`FormspecEngine`, `FieldState`, `FormState`, `ComponentMap`, `FormspecForm`) is designed so the internal bridge can be swapped without breaking consumers.

### Migration path:

1. **Add UniFFI bindings** to `fel-core`, `formspec-core`, `formspec-eval` Rust crates — exposing `evalFEL(expr, context) → Value`, `validate(value, constraints) → [Error]`, `getDependencies(expr) → [Path]`
2. **Build a Swift-native reactive engine** that calls Rust for FEL/validation but manages the signal graph with `@Observable` directly — no WebView, no message protocol
3. **Swap `WebViewEngine` for `NativeEngine`** behind the same `FormspecEngine` public interface
4. **Remove WebView dependency** — the HTML bundle, `WKWebView` setup, and message protocol go away

### Consumer impact: none

`FormspecEngine.create(bundle:)` returns the same type with the same properties. The only visible differences:
- No WebView startup latency
- Lower memory footprint
- Synchronous state updates instead of batched async messages
- Works fully offline (no JS runtime)

### When to migrate:

When the form rendering use case is proven and there's demand for:
- Offline-first or airplane-mode scenarios
- Performance-sensitive contexts (forms in scrolling lists, rapid repeat-group manipulation)
- Reduced app size (no JS/WASM bundle)

## Exports

| Module | Contents |
|--------|----------|
| `FormspecSwift` | Everything: engine + renderer + defaults |
| `FormspecSwift/State` | State only: `FormspecEngine`, `FieldState`, `FormState`, `RenderingBundle` |

## Peer Dependencies

- iOS 17+ / macOS 14+ / visionOS 1+
- Swift 5.9+
- WebKit framework (system, for `WKWebView`)

## What's NOT in This Spec

- **Authoring/editing** — no `Project`, no handlers, no undo/redo. Rendering only.
- **Layout planning on device** — plans are pre-generated server-side or at build time.
- **`$ref` resolution on device** — definitions must be assembled before bundling.
- **Android-first implementation** — Kotlin spec follows Swift, same architecture.
