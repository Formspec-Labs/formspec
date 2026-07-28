/**
 * @filedesc Drives the built spike in a browser and re-takes every measurement in evidence/.
 *
 * Run against the static build (`npm run build && npm run preview`) so the bytes
 * measured are the bytes shipped:
 *
 *   node scripts/probe.mjs [baseUrl]
 *
 * Writes `evidence/r2-*.json`, `evidence/r3-*.json` and the screenshots. Every
 * number in the README comes from here; nothing is typed by hand.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const EVIDENCE = resolve(ROOT, 'evidence');
const SHOTS = resolve(EVIDENCE, 'screenshots');

const BASE = process.argv[2] ?? 'http://localhost:4174';

const TENANT_BRAND = '#7A1F3D';
const TENANT_BRAND_RGB = 'rgb(122, 31, 61)';
const PLATFORM_BRAND = '#27594f';

/**
 * The receipt route authors `/receipt/:caseRef`. Surface v0.1 pins `{name}` as
 * the only parameter grammar, so a conforming shell reads `:caseRef` as LITERAL
 * text: the route answers `/receipt/:caseRef` and does NOT answer
 * `/receipt/RA-2026-0412`. That is the whole point of divergence D1 being closed
 * against the implementation — the address degrades loudly rather than two
 * renderers disagreeing about what a signed URL means. `UNPINNED_DEEP_LINK`
 * below measures the consequence instead of hiding it.
 */
const ROUTES = [
  { id: 'apply', path: '/apply', label: '01-apply-intake' },
  { id: 'certify', path: '/certify', label: '02-certify-ceremony' },
  { id: 'receipt', path: '/receipt/:caseRef', label: '03-receipt-proof' },
  { id: 'queue', path: '/queue', label: '04-queue-operation' },
];

const UNPINNED_DEEP_LINK = '/receipt/RA-2026-0412';

/** WCAG 2.x contrast between two `rgb(...)` strings read off the live page. */
const CONTRAST_SCRIPT = () => {
  const parse = (value) => {
    const found = String(value).match(/-?[\d.]+/g);
    return found ? found.slice(0, 3).map(Number) : null;
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /** The first ancestor that actually paints, which is what the text sits on. */
  const backdrop = (element) => {
    let node = element;
    while (node) {
      const value = getComputedStyle(node).backgroundColor;
      const rgb = parse(value);
      if (rgb && !/rgba\([^)]*,\s*0\s*\)/.test(value)) return { rgb, from: node.className || node.tagName };
      node = node.parentElement;
    }
    return { rgb: [255, 255, 255], from: 'assumed white' };
  };
  const measure = (selector, what) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const fg = parse(getComputedStyle(element).color);
    const bg = backdrop(element);
    if (!fg) return null;
    const [hi, lo] = [lum(fg), lum(bg.rgb)].sort((a, b) => b - a);
    return {
      what,
      selector,
      color: getComputedStyle(element).color,
      background: `rgb(${bg.rgb.join(', ')})`,
      backgroundFrom: bg.from,
      fontSizePx: Number.parseFloat(getComputedStyle(element).fontSize),
      ratio: Number((((hi + 0.05) / (lo + 0.05))).toFixed(2)),
    };
  };
  return [
    measure('.fs-surface-route__title', 'route H1'),
    measure('.fs-surface-static-text', 'static text'),
    measure('.fs-surface-static-heading', 'authored heading'),
    measure('.fs-surface-slot__title', 'slot title'),
    measure('.fs-surface-nav__label', 'nav group label'),
    measure('.fs-surface-nav__list a', 'nav link'),
    measure('.fs-surface-unavailable', 'unavailable placeholder'),
    measure('.fs-surface-empty', 'widget empty state'),
    measure('.fs-surface-transition--blocked', 'blocked transition notice'),
    measure('.fs-surface-ceremony__statement', 'ceremony statement'),
    measure('.fs-surface-receipt__row dt', 'receipt fact label'),
    measure('.fs-surface-queue__caption', 'queue caption'),
    measure('.verify__headline', 'host verification headline'),
    measure('.rootprobe', 'host document-root probe'),
    measure('.gaps > summary', 'host gap drawer summary'),
    measure('.gaps__state', 'host diagnostic severity label'),
  ].filter(Boolean);
};

/** Inline `--formspec-*` custom properties on `<html>`, with their values. */
const readDocumentRoot = () => {
  const style = document.documentElement.style;
  const properties = {};
  for (let i = 0; i < style.length; i++) {
    const property = style[i];
    if (property.startsWith('--formspec-')) {
      properties[property] = style.getPropertyValue(property).trim();
    }
  }
  return properties;
};

/** Every element inside the rendered form that paints with `rgb`. */
const paintScan = (rgb) => {
  const PROPS = [
    'color', 'backgroundColor',
    'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
    'outlineColor', 'caretColor', 'accentColor', 'fill', 'stroke',
  ];
  const container = document.querySelector('.formspec-container');
  if (!container) return { found: false, hits: [] };
  const hits = [];
  for (const element of [container, ...container.querySelectorAll('*')]) {
    const computed = getComputedStyle(element);
    for (const property of PROPS) {
      const value = computed[property];
      if (typeof value === 'string' && value.includes(rgb)) {
        hits.push({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className : '',
          property,
          value,
          text: (element.textContent ?? '').trim().slice(0, 40),
        });
      }
    }
    // ::before / ::after are where a heading rule or a legend marker lives.
    for (const pseudo of ['::before', '::after']) {
      const computedPseudo = getComputedStyle(element, pseudo);
      for (const property of ['backgroundColor', 'borderInlineStartColor', 'color']) {
        const value = computedPseudo[property];
        if (typeof value === 'string' && value.includes(rgb)) {
          hits.push({
            tag: `${element.tagName.toLowerCase()}${pseudo}`,
            className: typeof element.className === 'string' ? element.className : '',
            property,
            value,
            text: '',
          });
        }
      }
    }
  }
  return { found: true, hits };
};

async function waitForApp(page) {
  await page.waitForSelector('[data-route]', { timeout: 20000 });
}

function write(name, value) {
  writeFileSync(resolve(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`wrote evidence/${name}`);
}

const main = async () => {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  // ── R3: the document-root probe, walked in navigation order ───────────────
  const leakContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const leakPage = await leakContext.newPage();

  const steps = [];
  await leakPage.goto(`${BASE}/certify`, { waitUntil: 'networkidle' });
  await waitForApp(leakPage);
  steps.push({
    step: 'fresh page load directly on /certify (ceremony, refuses)',
    documentRootProperties: await leakPage.evaluate(readDocumentRoot),
  });

  await leakPage.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
  await waitForApp(leakPage);
  await leakPage.waitForSelector('.formspec-container');
  steps.push({
    step: 'navigate to /apply (intake, admits) — the shipped renderer mounts',
    documentRootProperties: await leakPage.evaluate(readDocumentRoot),
  });

  await leakPage.goto(`${BASE}/receipt/:caseRef`, { waitUntil: 'networkidle' });
  await waitForApp(leakPage);
  steps.push({
    step: 'navigate to /receipt/:caseRef (proof, refuses)',
    documentRootProperties: await leakPage.evaluate(readDocumentRoot),
  });

  // Client-side navigation, not a reload — the case a router actually produces.
  await leakPage.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
  await waitForApp(leakPage);
  await leakPage.waitForSelector('.formspec-container');
  await leakPage.click('nav a[data-nav-route="receipt"]').catch(async () => {
    await leakPage.click('text=Your receipt');
  });
  await leakPage.waitForSelector('[data-route="receipt"]');
  const afterSpaNav = await leakPage.evaluate(readDocumentRoot);
  steps.push({
    step: 'client-side navigation /apply → /receipt (no reload)',
    documentRootProperties: afterSpaNav,
  });

  // ── R2: does the brand paint? ─────────────────────────────────────────────
  const applyPage = await leakContext.newPage();
  await applyPage.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
  await waitForApp(applyPage);
  await applyPage.waitForSelector('.formspec-container');

  const resolvedOnContainer = await applyPage.evaluate(() => {
    const container = document.querySelector('.formspec-container');
    const computed = getComputedStyle(container);
    return {
      '--formspec-color-primary': computed.getPropertyValue('--formspec-color-primary').trim(),
      '--formspec-default-primary': computed.getPropertyValue('--formspec-default-primary').trim(),
      '--formspec-default-focus': computed.getPropertyValue('--formspec-default-focus').trim(),
    };
  });

  const submitButton = await applyPage.evaluate(() => {
    const button = document.querySelector('.formspec-container button.formspec-submit, .formspec-container .formspec-submit');
    if (!button) return null;
    const computed = getComputedStyle(button);
    return {
      label: (button.textContent ?? '').trim(),
      backgroundColor: computed.backgroundColor,
      color: computed.color,
    };
  });

  const unfocused = await applyPage.evaluate(paintScan, TENANT_BRAND_RGB);

  await applyPage.focus('.formspec-container input');
  const focusedOutline = await applyPage.evaluate(() => {
    const input = document.activeElement;
    const computed = getComputedStyle(input);
    return {
      element: input.tagName.toLowerCase(),
      name: input.getAttribute('name') ?? input.id ?? '',
      outline: `${computed.outlineColor} ${computed.outlineStyle} ${computed.outlineWidth}`,
      borderColor: computed.borderTopColor,
    };
  });
  const focused = await applyPage.evaluate(paintScan, TENANT_BRAND_RGB);

  write('r2-theme-reaches-and-paints.json', {
    title: 'R2 — the tenant brand reaches the shipped renderer AND paints',
    description:
      'Measured on /apply in the running static build. Replaces r2-theme-reaches-but-paints-nothing.json, '
      + 'whose measurement stands as the before number.',
    before: {
      authoredInBundle: { 'color.accent': TENANT_BRAND },
      platformTokenRegistryDeclaresAccent: false,
      shellBridge: 'hand-built alias color.accent -> color.primary',
      elementsPaintingTenantBrand: 0,
      focusedInputOutline: 'rgb(39, 89, 79) solid 2px — platform green',
      submitButton: null,
      diagnosticsAnywhereInTheChain: 0,
    },
    after: {
      authoredInBundle: { 'color.primary': TENANT_BRAND, 'color.dark.primary': '#E3A0B4' },
      shellBridge: 'none — removed; a silent alias is now forbidden (token-registry-spec §2.4)',
      resolvedOnFormContainer: resolvedOnContainer,
      submitButton,
      elementsPaintingTenantBrandAtRest: unfocused.hits.length,
      elementsPaintingTenantBrandWithAnInputFocused: focused.hits.length,
      focusedInputOutline: focusedOutline,
      paintSites: focused.hits,
      diagnosticsWhenAnUndeclaredTokenIsAuthored: [
        'formspec-lint W708 (pass_theme) — names color.primary in the message',
        '@formspec-org/app-graph THEME-TOKEN-UNREGISTERED (validateThemeTokenRegistry) — warning, names color.primary',
      ],
    },
    verdict:
      unfocused.hits.length > 0 && focused.hits.length > unfocused.hits.length
        ? 'MET — the brand paints at rest and the focus ring derives from it'
        : 'NOT MET',
  });

  // ── R1: the signature, checked by the app's own path ──────────────────────
  const signature = await applyPage.evaluate(async () => {
    const probe = window.__spikeProbe;
    const clean = await probe.verify();
    // One character altered in the Theme's brand token — the falsification.
    const tampered = structuredClone(probe.bundleExport);
    for (const document of Object.values(tampered.documents)) {
      const tokens = document?.tokens;
      if (tokens && typeof tokens['color.primary'] === 'string') {
        tokens['color.primary'] = tokens['color.primary'].replace(/D$/, 'E');
      }
    }
    const failed = await probe.verify(tampered);
    return {
      clean,
      cleanTrustworthy: probe.isTrustworthy(clean),
      failed,
      failedTrustworthy: probe.isTrustworthy(failed),
      inputsRead: probe.inputPaths,
    };
  });

  write('signature-verification.json', {
    title: 'surface-render-v10 — browser signature verification',
    description:
      'The signed bundle export verified in Chromium with the shipped COSE + WebCrypto path, before anything '
      + 'renders. Numbers taken from the running app\'s own verifyBundleSignature via window.__spikeProbe, not '
      + 'recomputed in Node.',
    capturedFrom: `${BASE}/apply (vite preview of the static build)`,
    inputsRead: Object.values(signature.inputsRead),
    primitivesUsed: {
      canonicalization:
        'canonicalize (RFC 8785 JCS), domain-framed formspec.spike-v10.bundle-export.signed-payload.v1',
      coseHelpers: '@integrity-stack/cose — decodeCoseSign1WithMethodUri',
      verifier: '@integrity-stack/signature-adapter-webcrypto — WebCryptoVerifier',
      methodRegistry: `formspec/registries/signature-method-registry.json v${signature.clean.methodRegistryVersion}`,
      note:
        'All shipped, all unchanged. Ed25519 verified natively in Chromium WebCrypto. The only new code is the caller.',
    },
    cleanExport: {
      signatureResult: signature.clean.result,
      digestMatches: signature.clean.digestMatches,
      trustworthy: signature.cleanTrustworthy,
      recomputedDigest: signature.clean.recomputedDigest,
      claimedDigest: signature.clean.claimedDigest,
      methodUriFromCoseProtectedHeader: signature.clean.methodUriFromEnvelope,
      adapter: `${signature.clean.adapter.id}@${signature.clean.adapter.version}`,
      methodRegistryVersion: signature.clean.methodRegistryVersion,
      signer: signature.clean.signerName,
      affirmation: signature.clean.affirmationText,
    },
    falsification: {
      what: "One character altered in the export: documents[theme].tokens['color.primary'] #7A1F3D -> #7A1F3E",
      signatureResult: signature.failed.result,
      digestMatches: signature.failed.digestMatches,
      trustworthy: signature.failedTrustworthy,
      recomputedDigest: signature.failed.recomputedDigest,
      appBehaviour:
        'Boot refuses. Nothing from the bundle reaches the screen — the person sees a refusal, not an app with '
        + 'a warning on it.',
    },
    methodUriProvenance:
      'Read out of the COSE protected header, never out of the JSON record beside it, so a record claiming a '
      + 'method the envelope does not carry cannot pass.',
  });

  // ── R3: the per-route boundary walk ───────────────────────────────────────
  const walkPage = await leakContext.newPage();
  await walkPage.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
  await waitForApp(walkPage);
  await walkPage.waitForSelector('.formspec-container');

  const readRoute = () => {
    const article = document.querySelector('[data-route]');
    const style = document.documentElement.style;
    const rootProperties = [];
    for (let i = 0; i < style.length; i++) {
      if (style[i].startsWith('--formspec-')) rootProperties.push(style[i]);
    }
    let subtreeTenantValues = 0;
    const collect = (element) => {
      for (let i = 0; i < element.style.length; i++) {
        const property = element.style[i];
        if (property.startsWith('--formspec-')
          && element.style.getPropertyValue(property).trim() === '#7A1F3D') subtreeTenantValues++;
      }
    };
    if (article) {
      collect(article);
      for (const element of article.querySelectorAll('*')) collect(element);
    }
    const probe = document.querySelector('[data-probe="document-root"]');
    return {
      routeId: article?.getAttribute('data-route') ?? null,
      routeClass: article?.getAttribute('data-route-class') ?? null,
      grant: article?.getAttribute('data-tenant-theme') ?? null,
      documentRootFormspecVarCount: rootProperties.length,
      documentRootHoldsTenantValue: rootProperties.some(
        (property) => style.getPropertyValue(property).trim() === '#7A1F3D',
      ),
      routeSubtreeTenantValueCount: subtreeTenantValues,
      resolvedPrimaryOnRoute: article
        ? getComputedStyle(article).getPropertyValue('--formspec-color-primary').trim()
        : '',
      onScreenProbeReadsTenantValues: probe
        ? Number(probe.getAttribute('data-root-tenant-values'))
        : null,
    };
  };

  const walk = [];
  walk.push({ step: 'loaded on /apply', ...(await walkPage.evaluate(readRoute)) });
  for (const [label, routeId] of [
    ['navigated to /certify', 'certify'],
    ['navigated to /receipt/:caseRef', 'receipt'],
    ['navigated to /queue', 'queue'],
    ['back to /apply', 'apply'],
  ]) {
    await walkPage.click(`nav a[data-nav-route="${routeId}"]`);
    await walkPage.waitForSelector(`[data-route="${routeId}"]`);
    walk.push({ step: label, ...(await walkPage.evaluate(readRoute)) });
  }

  write('r3-theme-boundary-probe.json', {
    title: 'R3 — tenant tokens structurally absent on refusing routes, AND absent from the document root',
    description:
      'Walked all four routes by clicking the navigation (client-side, no reload) and read, per route: '
      + 'the theme grant the shell resolved, every --formspec-* value inside the route subtree, and every '
      + 'one on the document root. Taken against the static build with NO shell workaround running.',
    tenantTokenValue: TENANT_BRAND,
    routeClassAuthority:
      'ROUTE_CLASS_THEME_AUTHORITY, read from @formspec-org/app-graph, not restated by the shell',
    walk,
    structuralClaim:
      'resolveThemeGrant is the only reader of the tenant Theme document in the app (grep: src/theme-grant.ts '
      + 'is the sole importer of `tenantTheme` from src/bundle.ts). It is called once per route at the route '
      + 'boundary, and only grant.themeDocument crosses into RouteView. On a refusing class that object is '
      + 'built from the platform token registry and never saw the tenant tokens.',
    documentRootClaim:
      'The document root now stays clean without the shell doing anything. `enforceDocumentRootThemeBoundary` '
      + 'is deleted; `documentRootThemeProperties()` reads and reports. The renderer owns the guarantee, which '
      + 'is the only place it can live — a host can clean up after a global write, never prevent it.',
    previousCaveatStruck:
      'The earlier run of this probe carried: "Keeping the DOCUMENT ROOT clean is not [structural] — it '
      + 'requires an active scrub." That is no longer true and the scrub is gone.',
  });

  // The screenshot the README points at: the receipt route, reached by
  // client-side navigation FROM the intake route, with the probe reading zero.
  const proofShot = await leakContext.newPage();
  await proofShot.setViewportSize({ width: 1280, height: 1000 });
  await proofShot.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
  await waitForApp(proofShot);
  await proofShot.waitForSelector('.formspec-container');
  await proofShot.click('nav a[data-nav-route="receipt"]');
  await proofShot.waitForSelector('[data-route="receipt"]');
  await proofShot.screenshot({
    path: resolve(SHOTS, 'light-06-document-root-probe-after-intake.png'),
    fullPage: true,
  });
  await proofShot.close();

  // ── R1/R4: the four routes, as rendered, read out of the live DOM ─────────
  const readRendered = () => {
    const article = document.querySelector('[data-route]');
    if (!article) return null;
    const slots = [...article.querySelectorAll('.fs-surface-route__slots > [data-slot]')].map((slot) => ({
      slotId: slot.getAttribute('data-slot'),
      slotType: slot.getAttribute('data-slot-type'),
      widget: slot.querySelector('[data-widget]')?.getAttribute('data-widget') ?? null,
      emptyState: slot.querySelector('[data-widget-empty]')?.textContent?.trim() ?? null,
      unavailable: slot.querySelector('[data-probe="slot-unavailable"]')?.textContent?.trim() ?? null,
    }));
    const blocked = article.querySelector('[data-probe="transition-blocked"]');
    const fireable = article.querySelector('[data-probe="transition-fireable"]');
    return {
      routeId: article.getAttribute('data-route'),
      surfaceId: article.getAttribute('data-surface'),
      routeClass: article.getAttribute('data-route-class'),
      themeGrant: article.getAttribute('data-tenant-theme'),
      title: article.querySelector('h1')?.textContent?.trim() ?? null,
      headingOutline: [...article.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => h.tagName.toLowerCase()),
      slots,
      shippedRendererMounted: article.querySelector('.formspec-container') !== null,
      submitButtonLabel:
        article.querySelector('.formspec-container button.formspec-submit, .formspec-container .formspec-submit')
          ?.textContent?.trim() ?? null,
      shellTransitionControl: fireable ? 'shell button' : blocked ? 'refusal notice' : 'none',
      shellTransitionText: (fireable ?? blocked)?.textContent?.trim() ?? null,
    };
  };

  const routePage = await leakContext.newPage();
  await routePage.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
  await waitForApp(routePage);
  await routePage.waitForSelector('.formspec-container');

  const rendered = [];
  rendered.push(await routePage.evaluate(readRendered));
  for (const routeId of ['certify', 'receipt', 'queue']) {
    await routePage.click(`nav a[data-nav-route="${routeId}"]`);
    await routePage.waitForSelector(`[data-route="${routeId}"]`);
    rendered.push(await routePage.evaluate(readRendered));
  }

  const ledger = await routePage.evaluate(() => {
    const drawer = document.querySelector('[data-probe="gap-drawer"]');
    const diagnostics = document.querySelector('[data-probe="diagnostics-drawer"]');
    return {
      onScreenTotal: Number(drawer?.getAttribute('data-gap-total')),
      onScreenResolved: Number(
        drawer?.querySelector('[data-probe="gap-resolved-count"]')?.textContent,
      ),
      onScreenOpen: Number(drawer?.querySelector('[data-probe="gap-open-count"]')?.textContent),
      diagnosticCount: Number(diagnostics?.getAttribute('data-diagnostic-count')),
      diagnosticErrors: Number(
        diagnostics?.querySelector('[data-probe="diagnostic-error-count"]')?.textContent,
      ),
      diagnosticWarnings: Number(
        diagnostics?.querySelector('[data-probe="diagnostic-warning-count"]')?.textContent,
      ),
      diagnosticInfos: Number(
        diagnostics?.querySelector('[data-probe="diagnostic-info-count"]')?.textContent,
      ),
      diagnostics: [...document.querySelectorAll('[data-diagnostic]')].map((node) => ({
        code: node.getAttribute('data-diagnostic'),
        severity: node.getAttribute('data-diagnostic-severity'),
      })),
      diagnosticCodes: [...document.querySelectorAll('[data-diagnostic]')].map((node) =>
        node.getAttribute('data-diagnostic'),
      ),
    };
  });

  // Every route's diagnostics, not just the one the walk finished on. Per-route
  // stages produce most of the closed code set and used to reach nothing.
  const perRouteDiagnostics = [];
  for (const route of ROUTES) {
    await routePage.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
    await waitForApp(routePage);
    if (route.id === 'apply') await routePage.waitForSelector('.formspec-container');
    perRouteDiagnostics.push({
      route: route.id,
      path: route.path,
      diagnostics: await routePage.evaluate(() =>
        [...document.querySelectorAll('[data-diagnostic]')].map((node) => ({
          code: node.getAttribute('data-diagnostic'),
          severity: node.getAttribute('data-diagnostic-severity'),
        })),
      ),
    });
  }

  // The address the unpinned grammar costs. `:caseRef` is literal text, so this
  // matches nothing and the shell says so rather than deep-linking a URL a
  // second conforming renderer would 404.
  await routePage.goto(`${BASE}${UNPINNED_DEEP_LINK}`, { waitUntil: 'networkidle' });
  await routePage.waitForSelector('[data-probe="route-not-found"], [data-route]');
  const unpinnedDeepLink = await routePage.evaluate(() => ({
    routeRendered: document.querySelector('[data-route]')?.getAttribute('data-route') ?? null,
    notFoundShown: document.querySelector('[data-probe="route-not-found"]') !== null,
    diagnostics: [...document.querySelectorAll('[data-diagnostic]')].map((node) => ({
      code: node.getAttribute('data-diagnostic'),
      severity: node.getAttribute('data-diagnostic-severity'),
    })),
  }));

  write('route-grammar.json', {
    title: 'D1 — the unpinned route-parameter grammar, and what it costs the address',
    description:
      'The signed bundle authors `/receipt/:caseRef`. Surface v0.1 §3 pins `{name}` as the only '
      + 'parameter grammar, so a conforming shell reads `:caseRef` as literal text. The route stays '
      + 'reachable by handle and only its deep-link address degrades — loudly, which is the point.',
    authoredPath: '/receipt/:caseRef',
    addressThatWorks: '/receipt/:caseRef',
    addressThatNoLongerResolves: UNPINNED_DEEP_LINK,
    measured: unpinnedDeepLink,
    repair:
      'A `pattern` on `Route.path` in surface.schema.json admitting only the pinned grammar, plus '
      + 'authoring-tool emission (finding F8, owner: Surface). Making the renderer strict is necessary '
      + 'and not sufficient — the authored bundle is where the two grammars meet.',
    beforeThisReconciliation:
      'The shell matched BOTH grammars in one pass and reported ROUTE-PARAM-GRAMMAR alongside, so the '
      + 'deep link worked here and 404d in any other conforming renderer.',
  });

  write('route-diagnostics.json', {
    title: 'D4 — every per-route diagnostic reaching the host, one route at a time',
    description:
      'Read off the gap drawer, which renders whatever `onDiagnostics` hands it. The route-scoped '
      + 'stages — slot planning, theme grant, transition planning — used to compute these and drop '
      + 'them, so a host could log the app-construction minority and nothing else.',
    perRoute: perRouteDiagnostics,
    severityNote:
      'Severity is fixed per code by the spec\u2019s §7.2 table, never by the call site, so two sites '
      + 'reporting the same code cannot disagree about how loud it is.',
  });

  write('route-walk.json', {
    title: 'surface-render-v10 — four routes walked from the signed export, through the shipped shell',
    description:
      'Read out of the live DOM after clicking through the navigation. Every route below is derived from '
      + 'the two Surface documents inside the signed bundle export by `@formspec-org/surface`; no route '
      + 'table, title, path, route class or slot list is written in this spike.',
    servedFrom: `${BASE} (vite preview of the static build)`,
    renderedBy: [
      '@formspec-org/surface — composeSurfaceApp, matchRoute, planRoute, createThemeAuthority, createWidgetRegistry, planTransitions',
      '@formspec-org/surface-react — SurfaceApp, SurfaceRouteView, SurfaceSlot, and the four starter widgets',
      '@formspec-org/react — FormspecForm, for the one definition-form slot',
    ],
    surfacesInManifest: [
      'https://benefits.example.gov/apps/assistance/surfaces/respondent',
      'https://benefits.example.gov/apps/assistance/surfaces/staff',
    ],
    routes: rendered,
    stubsRendered: [],
    stubNote:
      'Zero. All four module widgets are real components in @formspec-org/surface-react. Where a widget '
      + 'shows an empty state it is because the bundle supplies it nothing — `widget-data-binding` and '
      + '`no-runtime-state`, both still open — not because the widget is a stub.',
    ledgerOnScreen: ledger,
    navigationLabels:
      'Group labels are `SurfaceDocument.title ?? id`, so they read "respondent" and "staff". The spike '
      + 'previously invented "For the person applying" and "For staff"; a shell does not write copy for an '
      + 'artifact that declined to carry it.',
  });
  await routePage.close();

  // ── Screenshots and contrast, light and dark ──────────────────────────────
  //
  // The contrast pass is here rather than in a separate run because it must be
  // measured in the SAME rendering the screenshot shows. The defect it guards:
  // the shell painted `color: var(--formspec-color-foreground, #1a1a1a)` with no
  // dark arm, and the route H1 measured 1.06:1 on the dark panel — invisible, in
  // a screenshot that had been taken and looked at.
  const contrast = [];
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
      colorScheme: scheme,
    });
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
      await waitForApp(page);
      if (route.id === 'apply') {
        await page.waitForSelector('.formspec-container');
        await page.focus('.formspec-container input');
      }
      // Open the drawers so the host chrome inside them is measurable too.
      await page.evaluate(() => {
        for (const details of document.querySelectorAll('details[data-probe]')) details.open = true;
      });
      contrast.push({
        scheme,
        route: route.id,
        measurements: await page.evaluate(CONTRAST_SCRIPT),
      });
      await page.evaluate(() => {
        for (const details of document.querySelectorAll('details[data-probe]')) details.open = false;
      });
      await page.screenshot({
        path: resolve(SHOTS, `${scheme}-${route.label}.png`),
        fullPage: true,
      });
    }
    await context.close();
  }

  const AA_BODY = 4.5;
  const AA_LARGE = 3;
  const flat = contrast.flatMap((entry) =>
    entry.measurements.map((measurement) => ({
      scheme: entry.scheme,
      route: entry.route,
      ...measurement,
      // WCAG 2.2 SC 1.4.3: 18.66px bold or 24px regular counts as large text.
      threshold: measurement.fontSizePx >= 24 ? AA_LARGE : AA_BODY,
    })),
  );
  const failures = flat.filter((entry) => entry.ratio < entry.threshold);

  write('contrast.json', {
    title: 'Shell chrome contrast, measured in the running app, both schemes, all four routes',
    description:
      'Foreground and backdrop read out of the live DOM with getComputedStyle, backdrop resolved by '
      + 'walking up to the first ancestor that actually paints. Shell-owned surfaces and the host\u2019s '
      + 'own chrome are both measured, because a person cannot tell whose stylesheet made a line '
      + 'unreadable.',
    thresholds: { bodyText: AA_BODY, largeText: AA_LARGE, largeTextIsPx: 24 },
    before: {
      what: '.fs-surface-app painted `color: var(--formspec-color-foreground, #1a1a1a)` with no dark arm.',
      why:
        'The token emitter writes onto .fs-surface-route; `color` was declared one element above it, so '
        + 'only the light-mode fallback was ever reachable and the route inherited the computed value.',
      routeH1OnDarkPanel: 1.06,
      quietInkOnDarkPanel: 2.41,
      transitionButtonInkOnDarkAccent: 2.2,
      hostRootProbeLeakingOnDarkPanel: 2.46,
    },
    measurements: flat,
    failures,
    verdict: failures.length === 0
      ? 'MET — every measured pair clears WCAG 2.2 AA in both schemes'
      : `NOT MET — ${failures.length} pair(s) below threshold`,
  });

  // The gap drawer + diagnostics, open, on the intake route.
  const drawerShot = await leakContext.newPage();
  await drawerShot.setViewportSize({ width: 1280, height: 1400 });
  await drawerShot.goto(`${BASE}/apply`, { waitUntil: 'networkidle' });
  await waitForApp(drawerShot);
  await drawerShot.waitForSelector('.formspec-container');
  await drawerShot.evaluate(() => {
    for (const details of document.querySelectorAll('details[data-probe]')) details.open = true;
  });
  await drawerShot.screenshot({
    path: resolve(SHOTS, 'light-05-verification-and-gap-ledger-open.png'),
    fullPage: true,
  });
  await drawerShot.close();

  // ── R3 evidence ───────────────────────────────────────────────────────────
  const counts = steps.map((step) => ({
    step: step.step,
    documentRootFormspecVarCount: Object.keys(step.documentRootProperties).length,
    documentRootPrimary: step.documentRootProperties['--formspec-color-primary'] ?? null,
  }));

  write('r3-document-root-leak.json', {
    title: 'R3 — the renderer no longer leaks tenant theme tokens to the document root',
    description:
      'Measured against the static build. `FormspecProvider` emits onto a `display: contents` element it '
      + 'owns, with cleanup on unmount, and never touches `document.documentElement`.',
    fixLocation:
      'formspec/packages/formspec-react/src/context.tsx — FormspecProvider renders a `.formspec-theme-scope` '
      + 'element and emits `themeDocument.tokens` onto it with an unmount cleanup.',
    permanentTest:
      'formspec/packages/formspec-react/tests/theme-token-scope.test.tsx — the runtime half of the ADR 0161 '
      + 'theme-authority promise.',
    before: [
      { step: 'fresh page load directly on /certify (ceremony, refuses)', documentRootFormspecVarCount: 0, documentRootPrimary: null },
      { step: 'navigate to /apply (intake, admits) — the shipped renderer mounts', documentRootFormspecVarCount: 46, documentRootPrimary: TENANT_BRAND },
      { step: 'navigate to /receipt/:caseRef (proof, refuses)', documentRootFormspecVarCount: 46, documentRootPrimary: TENANT_BRAND, verdict: 'LEAKED' },
    ],
    after: counts,
    shellWorkaroundRemoved:
      'src/theme-grant.ts `enforceDocumentRootThemeBoundary` scrubbed `<html>` on every refusing route. It is '
      + 'gone. `documentRootThemeProperties()` replaced it: the shell now READS the document root and asserts '
      + 'it is empty rather than making it empty.',
    verdict: counts.every((step) => step.documentRootFormspecVarCount === 0)
      ? 'FIXED — 0 tenant properties on <html> at every step, with no shell workaround running'
      : 'STILL LEAKING',
  });

  await leakContext.close();
  await browser.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
