# Formy — Browser Extension for Formspec Form Assistance

**Date:** 2026-03-26
**Status:** Brainstorm
**Platforms:** Chrome (Manifest V3), Firefox (WebExtensions)
**Implements:** Formspec Assist Specification §8 (Extension Integration)

---

## 1. Overview

Formy is a **cross-site browser extension** that enhances any Formspec form (and degrades gracefully on plain HTML forms). It provides:

- **Semantic autofill** — concept-keyed profiles that match across different forms and sites
- **Contextual help** — side panel with field explanations from References and Ontology
- **Form memory** — save and restore partial responses
- **Multi-profile** — "Fill as: My Org / Personal / Client: Acme Corp"
- **Privacy-first storage** — profiles encrypted at rest with WebAuthn/passkey authentication

Formy is a **pure consumer** of the Formspec Assist Specification. It calls the spec's tools — never bypasses them.

---

## 2. Architecture

```
┌─ Formy Extension ────────────────────────────────────────────────┐
│                                                                   │
│  ┌────────────────────────────┐  ┌─────────────────────────────┐ │
│  │ Side Panel (UI)            │  │ Settings Page               │ │
│  │                            │  │                              │ │
│  │ ┌────────────────────────┐ │  │ • Profile management        │ │
│  │ │ Profile Picker         │ │  │ • Per-site permissions       │ │
│  │ │ "Fill as: [Acme Corp]" │ │  │ • Import/export profiles    │ │
│  │ └────────────────────────┘ │  │ • WebAuthn enrollment        │ │
│  │ ┌────────────────────────┐ │  │ • Encryption settings        │ │
│  │ │ Field Help             │ │  │ • Sync configuration         │ │
│  │ │ Regulations, docs,     │ │  └─────────────────────────────┘ │
│  │ │ examples, concept info │ │                                   │
│  │ └────────────────────────┘ │  ┌─────────────────────────────┐ │
│  │ ┌────────────────────────┐ │  │ Service Worker              │ │
│  │ │ Autofill Preview       │ │  │                              │ │
│  │ │ Match list with        │ │  │ • Profile vault (encrypted)  │ │
│  │ │ confidence + approve   │ │  │ • Sidecar document cache     │ │
│  │ └────────────────────────┘ │  │ • Cross-tab coordination     │ │
│  │ ┌────────────────────────┐ │  │ • WebAuthn key management    │ │
│  │ │ Form Progress          │ │  │ • Form memory storage        │ │
│  │ │ Required: 8/12 ████░░ │ │  │ • Site permission rules      │ │
│  │ └────────────────────────┘ │  └──────────────┬──────────────┘ │
│  └──────────────┬─────────────┘                  │               │
│                 │                                │               │
│  ┌──────────────▼────────────────────────────────▼──────────────┐│
│  │ Content Script (per tab)                                      ││
│  │                                                               ││
│  │ • Mode detection (spec §8.2)                                  ││
│  │ • postMessage transport ↔ in-page Assist Provider             ││
│  │ • Bootstrap formspec-assist when needed (Mode 2)              ││
│  │ • Heuristic field detection (Mode 3)                          ││
│  │ • Sidecar discovery (spec §7.2)                               ││
│  │ • Field highlight overlays                                    ││
│  └───────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Profile Vault — WebAuthn-Protected Storage

### 3.1 Problem

Profiles contain PII (names, addresses, tax IDs, medical identifiers). Browser extension storage (`chrome.storage.local`) is unencrypted — any code with extension access can read it. Password-based encryption is weak (users reuse passwords, phishing risk). We need encryption that is:

- **Phishing-resistant** — no passwords to steal
- **Device-bound** — profiles don't leave the device unless explicitly exported
- **Biometric-backed** — fingerprint/face to unlock (on supported hardware)
- **Transparent** — user understands what's protected and when

### 3.2 WebAuthn Integration

Formy uses the **Web Authentication API (WebAuthn)** to derive encryption keys from hardware authenticators (platform authenticators like Touch ID / Windows Hello, or roaming authenticators like YubiKeys).

#### Enrollment Flow

```
1. User creates first profile (or enables encryption in settings)
2. Extension calls navigator.credentials.create() with:
   - rp: { name: "Formy", id: extension origin }
   - user: { id: vaultId, name: "Formy Profile Vault" }
   - authenticatorSelection: {
       authenticatorAttachment: "platform",    // prefer built-in biometric
       residentKey: "preferred",
       userVerification: "required"            // biometric/PIN required
     }
   - pubKeyCredParams: [{ type: "public-key", alg: -7 }]  // ES256
   - extensions: { prf: { eval: { first: salt } } }        // PRF extension for key derivation
3. Authenticator creates a credential bound to the device
4. Extension stores credentialId in chrome.storage.local (not secret)
5. PRF output → HKDF → 256-bit AES-GCM encryption key
6. Encryption key encrypts the profile vault
7. Key is held in memory only while the vault is unlocked; cleared on lock
```

#### Unlock Flow

```
1. User triggers autofill or opens side panel
2. Extension calls navigator.credentials.get() with:
   - allowCredentials: [{ id: storedCredentialId }]
   - userVerification: "required"
   - extensions: { prf: { eval: { first: salt } } }
3. User authenticates (fingerprint, face, PIN)
4. PRF output → HKDF → same 256-bit AES-GCM key
5. Key decrypts the profile vault into memory
6. Vault auto-locks after configurable timeout (default: 5 minutes idle)
```

#### Key Derivation

```typescript
async function deriveKey(prfOutput: ArrayBuffer, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', prfOutput, 'HKDF', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('formy-vault-v1') },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

### 3.3 PRF Extension Support

The `prf` (Pseudo-Random Function) extension is the key piece — it lets WebAuthn credentials derive stable, deterministic secrets that can be used as encryption key material.

**Browser support (March 2026):**
- Chrome: Supported (platform authenticators)
- Firefox: Supported (since v130)
- Safari: Partial (platform authenticators only)

**Fallback when PRF is unavailable:**
1. Check for `prf` support in `authenticatorData.extensions`
2. If unsupported, fall back to **password-derived key** (PBKDF2 with 600,000 iterations)
3. Show user a warning that biometric protection is unavailable
4. Still use WebAuthn for authentication (just not for key derivation) — the credential proves the user is present, and the password encrypts the vault

### 3.4 Vault Structure

```typescript
interface EncryptedVault {
  version: 1;
  credentialId: string;              // base64url, stored unencrypted
  salt: string;                      // base64url, stored unencrypted (for HKDF)
  iv: string;                        // base64url, per-encryption nonce
  ciphertext: string;                // base64url, AES-GCM encrypted VaultContents
  tag: string;                       // base64url, AES-GCM auth tag (if separate)
}

interface VaultContents {
  profiles: UserProfile[];           // per Assist Spec §4.1
  formMemory: FormMemoryEntry[];     // saved partial responses
  settings: VaultSettings;           // per-site permissions, preferences
}
```

### 3.5 Lock/Unlock Lifecycle

| Event | Action |
|-------|--------|
| Extension installed | No vault. User prompted on first profile creation. |
| User creates profile | Enrollment flow (§3.2). Vault created and encrypted. |
| User opens side panel | Unlock flow. Vault decrypted into memory. |
| User triggers autofill | Unlock flow (if locked). |
| Idle timeout (5min default) | Key cleared from memory. Vault locked. |
| Browser closed | Key cleared. Vault locked. |
| User clicks "Lock" | Key cleared immediately. |
| User exports profile | Vault must be unlocked. Exported JSON is plaintext (user's responsibility). |
| User imports profile | Vault must be unlocked. Imported data encrypted into vault. |

---

## 4. Operating Modes (per Assist Spec §8.2)

### 4.1 Mode 1: Full Assist Provider

**Detection:** `document.modelContext.getTools()` lists `formspec.*` tools (native WebMCP), or the polyfill's bridge reports them; `toolchange` on `document.modelContext` signals arrival.

**Behavior:**
- Extension announces itself via `CustomEvent('formspec-consumer-connect')` (spec §8.6)
- All form interaction via postMessage transport → tool catalog
- Side panel calls `formspec.field.help` for contextual help
- Autofill calls `formspec.profile.match` then `formspec.profile.apply` with `confirm: true`
- Profile learning calls `formspec.profile.learn` after user completes a form
- Sidecar documents already loaded by the in-page provider — no fetch needed

### 4.2 Mode 2: Bootstrap Assist Provider

**Detection:** `document.querySelector('formspec-render')` exists but no `formspec.*` tool appears via `getTools()` within 2 seconds of DOM ready.

**Behavior:**
- Content script reads `element.engine` from the `<formspec-render>` element
- Content script injects `formspec-assist` bundle (shipped with extension)
- Extension's injected code calls `createAssistProvider({ engine })` with sidecar documents:
  1. Check `<link rel="formspec-references">` / `<link rel="formspec-ontology">`
  2. Check definition's `sidecars` metadata
  3. Fall back to well-known paths
  4. Cache sidecar documents in extension storage keyed by `(definitionUrl, version)`
- From here, same as Mode 1 — full tool catalog available via postMessage

### 4.3 Mode 3: Plain HTML Form (Degraded)

**Detection:** No `<formspec-render>`, no `data-formspec-form`, no `formspec.*` tool within 2 seconds.

**Behavior:**
- Content script scans the DOM for `<form>` elements
- Builds a field model from:
  - `<label for="...">` associations
  - `name`, `id`, `placeholder`, `aria-label` attributes
  - `autocomplete` tokens → reverse concept mapping
  - Input `type` attributes (email, tel, date → infer concept)
- Profile matching uses:
  - `autocomplete` → concept URI (high confidence)
  - Label fuzzy match → concept URI (low confidence)
  - `name`/`id` → field-key lookup (lowest confidence)
- Autofill writes values via DOM manipulation + event dispatch:
  ```typescript
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  ```
- No validation, no references, no ontology — degraded but useful

---

## 5. Side Panel UI

### 5.1 Layout

The side panel is the extension's primary UI. It uses Chrome's Side Panel API (`chrome.sidePanel`) / Firefox's sidebar API.

```
┌─ Formy ──────────────────────────┐
│ [🔒 Locked] [⚙ Settings]        │
│                                   │
│ ┌─ Active Profile ──────────────┐│
│ │ Acme Corporation         [▼]  ││
│ └───────────────────────────────┘│
│                                   │
│ ┌─ Autofill ────────────────────┐│
│ │ 7 fields matched               ││
│ │                                ││
│ │ ✓ Organization Name   ● 0.95  ││
│ │   "Acme Corporation"           ││
│ │ ✓ EIN                 ● 0.95  ││
│ │   "12-3456789"                 ││
│ │ ~ City                ● 0.60  ││
│ │   "Springfield" (broader)      ││
│ │                                ││
│ │ [Fill Selected] [Fill All]     ││
│ └───────────────────────────────┘│
│                                   │
│ ┌─ Field Help ──────────────────┐│
│ │ ▸ EIN (focused)                ││
│ │                                ││
│ │ Employer Identification Number ││
│ │ IRS-assigned 9-digit number.   ││
│ │                                ││
│ │ 📜 26 CFR § 301.7701-12       ││
│ │ 📄 IRS EIN Application Guide  ││
│ │ 💡 Format: XX-XXXXXXX         ││
│ └───────────────────────────────┘│
│                                   │
│ ┌─ Progress ────────────────────┐│
│ │ Required: 8/12 ████████░░░░   ││
│ │ Total:   15/24 ██████████░░░  ││
│ │ ⚠ 2 validation errors         ││
│ └───────────────────────────────┘│
└───────────────────────────────────┘
```

### 5.2 Autofill Confirmation

When the user clicks "Fill All" or "Fill Selected":

1. Extension calls `formspec.profile.apply` with `confirm: true`
2. In Mode 1, the tool carries `consequentialHint`, so the browser/agent may prompt before calling; the in-page provider's `confirmProfileApply` handler then shows the form's own confirmation (assist-spec §7.1(4))
3. In Mode 2/3, the extension shows its own confirmation dialog in the side panel
4. User reviews and approves/rejects each field
5. Applied fields are highlighted briefly in the page (green flash)

### 5.3 Field Focus Tracking

When the user focuses a form field:

1. Content script detects `focusin` event
2. Resolves the field path (from `data-field-path` attribute or heuristic)
3. Sends field path to side panel via `chrome.runtime.sendMessage`
4. Side panel calls `formspec.field.help(path)` and renders the help section
5. Side panel also calls `formspec.field.describe(path)` for state info

---

## 6. Cross-Site Profile Learning

### 6.1 Learn Flow

After a user submits a form (or navigates away with filled fields):

1. Content script detects form submission (`submit` event) or page unload
2. Extension calls `formspec.profile.learn` (Mode 1/2) or reads field values from DOM (Mode 3)
3. New concept-keyed entries are added to the active profile in the vault
4. If a concept already exists in the profile:
   - If values match: update `lastUsed`, increase `confidence`
   - If values differ: prompt user — "Your EIN was 12-3456789 on grants.gov but you entered 98-7654321 here. Which should I remember?"
   - User can keep old, keep new, or keep both (separate profiles)

### 6.2 Conflict Resolution

```typescript
interface ConflictPrompt {
  concept: string;                    // concept URI
  conceptLabel: string;               // "Employer Identification Number"
  existingValue: unknown;
  existingSource: ProfileEntrySource;
  newValue: unknown;
  newSource: ProfileEntrySource;
  options: Array<{
    action: "keep-existing" | "keep-new" | "keep-both";
    label: string;
  }>;
}
```

Conflicts are queued and presented in the side panel — never as blocking popups.

---

## 7. Form Memory

### 7.1 Purpose

Save and restore partial form responses across browser sessions. Keyed by `(definitionUrl, definitionVersion)`.

### 7.2 Structure

```typescript
interface FormMemoryEntry {
  definitionUrl: string;
  definitionVersion: string;
  pageUrl: string;                    // where the form was rendered
  savedAt: string;
  data: Record<string, unknown>;      // field path → value
  progress: { total: number; filled: number };
}
```

### 7.3 Behavior

- **Auto-save:** On page unload, if the form has unsaved changes and > 2 fields filled, save to form memory
- **Restore prompt:** When the user visits a page with a matching `(definitionUrl, definitionVersion)`, show a notification: "You have a saved draft from March 20. Restore?"
- **Restore action:** Calls `formspec.field.bulkSet` with saved values
- **Expiry:** Form memory entries expire after 30 days (configurable)

---

## 8. Manifest & Permissions

### 8.1 Chrome Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Formy — Smart Form Assistant",
  "version": "1.0.0",
  "description": "Semantic autofill, contextual help, and form memory for Formspec forms",

  "permissions": [
    "storage",
    "sidePanel",
    "activeTab"
  ],

  "optional_permissions": [
    "tabs"
  ],

  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }],

  "side_panel": {
    "default_path": "side-panel.html"
  },

  "background": {
    "service_worker": "service-worker.js"
  },

  "action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
  },

  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

### 8.2 Permission Rationale

| Permission | Why |
|-----------|-----|
| `storage` | Profile vault, sidecar cache, form memory, settings |
| `sidePanel` | Primary UI surface |
| `activeTab` | Read form state from current tab (content script needs page access) |
| `tabs` (optional) | Cross-tab profile sync. Requested at runtime when user enables cross-tab features. |

**Not requested:**
- `<all_urls>` host permission — not needed; `activeTab` + content script `matches` is sufficient
- `webRequest` — not intercepting network traffic
- `cookies` — not reading session state
- `debugger` — not using CDP (unlike Claude extension)

### 8.3 Firefox WebExtensions

Same structure with minor adjustments:
- `"browser_specific_settings": { "gecko": { "id": "formy@formspec.org" } }`
- `sidebar_action` instead of `side_panel` (Firefox uses sidebar API)
- `browser.storage.local` instead of `chrome.storage.local`
- Use `browser.*` namespace with Promise-based API

---

## 9. Privacy Model

### 9.1 Principles

1. **Local-first.** All data stays on-device by default. No cloud sync unless explicitly enabled.
2. **Encrypted at rest.** Profile vault encrypted with WebAuthn-derived key (§3).
3. **Explicit consent.** Every autofill requires user approval. Every profile.learn requires user acknowledgment.
4. **Per-site control.** User can allow/deny Formy per site. Deny means content script is dormant.
5. **No telemetry.** No usage analytics, no crash reports, no network calls except sidecar document fetches.
6. **Auditable.** Open source. No obfuscated code.

### 9.2 Data Classification

| Data | Storage | Encrypted | Retention |
|------|---------|-----------|-----------|
| Profiles (PII) | Extension storage (vault) | Yes (AES-256-GCM via WebAuthn) | Until user deletes |
| Form memory (may contain PII) | Extension storage (vault) | Yes | 30 days default |
| Sidecar cache (no PII) | Extension storage | No | Until definition version changes |
| Site permissions | Extension storage | No | Until user changes |
| Settings | Extension storage | No | Until user changes |

### 9.3 Optional Cloud Sync

If the user enables sync:
- Only the **encrypted vault blob** is synced — the cloud provider never sees plaintext
- Sync target is user-chosen (Chrome Sync, self-hosted, S3, etc.)
- WebAuthn credential is device-bound — each device must independently authenticate to decrypt
- A new device enrollment creates a new WebAuthn credential; the user must export/import the vault or use a roaming authenticator (YubiKey) shared between devices

---

## 10. Development Plan

### Phase 1: MVP

- Chrome Manifest V3
- Mode 1 only (page has Assist Provider)
- Single profile
- Side panel: autofill preview, field help, progress
- `localStorage` encryption (password-based) — WebAuthn in Phase 2
- No form memory, no cross-tab learning

### Phase 2: Full Featured

- WebAuthn vault encryption
- Mode 2 (bootstrap Assist Provider)
- Multi-profile management
- Form memory (auto-save/restore)
- Cross-tab profile learning
- Sidecar document caching

### Phase 3: Cross-Browser

- Firefox WebExtensions port
- Mode 3 (plain HTML forms)
- Profile import/export
- Optional cloud sync (encrypted)

---

## 11. Open Questions

1. **Extension bundling formspec-assist.** For Mode 2, the extension needs to inject the `formspec-assist` package into the page context. How large is the bundle? Can it be loaded lazily? Should it be a separate content script that's only injected when needed?

2. **WebAuthn in extension context.** Can `navigator.credentials.create()` / `.get()` be called from the extension's side panel or popup? Or must it be called from a content script in a page context? This affects the UX flow for vault unlock.

3. **PRF extension availability.** If the user's platform authenticator doesn't support PRF, the fallback to password-derived keys is weaker. Should Formy refuse to store high-sensitivity fields (SSN, tax ID) without PRF?

4. **Content script injection ordering.** In Mode 2, the content script needs to inject `formspec-assist` AFTER the `<formspec-render>` element has initialized its engine. What's the right timing? `MutationObserver` on `formspec-render` + wait for `.engine` property?

5. **`<all_urls>` content script concern.** Running a content script on every page has a performance cost (even if it exits early on non-formspec pages). Should Formy use `declarativeContent` to only activate on pages with formspec indicators?

6. **Profile schema.** Should `profile.schema.json` be a new addition to the `schemas/` directory in the Formspec repo? This would formalize the portability format and allow tooling validation.
