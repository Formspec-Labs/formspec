#!/usr/bin/env node
/** @filedesc Definition Walk CLI: emit specs, run them, or check renderer accessibility. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { derivePlan, deriveRecipes, emitSpec } from '@formspec-org/walk';

const USAGE = `usage: formspec-walk emit (--docs <dir> | --manifest <package-manifest.json>) [--form <formId>] --url <page url> [--root <selector>] [--locale <code>] [--out <file>] [--from <package>]
       formspec-walk emit --bundle <export.json> --url <hash preview URL> [--params <JSON>] [--locale <code>] [--out <file>]
       formspec-walk a11y (--docs <dir> | --manifest <package-manifest.json>) [--form <formId>] [--locale <code>] [--timeout-ms <ms>] [--out <file>]
       formspec-walk test [Playwright test arguments]
       formspec-walk serve [--port <n>] [--host <addr>] [--timeout-ms <ms>]

  --bundle    emit one keyboard, screen-reader and axe test per exported Surface form slot and Definition Locale
  --params    route parameters for the export, e.g. '{"state":"ny"}'; the URL is the static hash preview before routing
  --docs      a directory holding the form's documents: the Definition, its Locale(s), its Theme (any *.json), or a package directory containing package-manifest.json
  --manifest  a package-manifest.json file describing one or more forms and their per-form Definition, Locale(s) and Theme files
  --form      the formId (or slug) to select from package-manifest.json (required for emit when the package has multiple forms)
  --url       the page the spec opens; it must mount a <formspec-render> or React <FormspecForm>
  --root      selector for one renderer on a multi-form route (e.g. '[data-slot="filing"] [data-formspec-render-root]')
  --locale    the Locale to derive the wording from (default: the Definition's inline wording)
  --out       write here instead of stdout
  --all       emit every --manifest form to --out-dir <dir> using --url-template <url> with {formId} or {slug}
  --axe       include a host-page axe test in each emitted spec
  --summary   test --summary <file> writes per-form results, findings, axe reports and uncovered items
  --from      the package the spec imports the walk from (default @formspec-org/walk)

  test   runs installed Playwright with an execution reporter: no executed tests (including all skipped) fails.
         Listing tests and shards with no assigned tests do not require execution.
         Other Playwright failures retain their exit status. CLI --reporter values are retained; config reporters are replaced.
         To retain configured reporters and their options, add @formspec-org/walk/reporter to your config and use your existing runner.
  a11y   runs axe (WCAG A/AA) on every page of the form and again with validation errors shown, in the
         reference web renderer, and prints the report as JSON. Exit 0: axe ran and found nothing; 1: it
         found violations; 3: it could not finish (timeout, browser failure) — never a pass.
  serve  POST /check with {definition, theme?, locales?, locale?} answers with the same report: 200 when
         axe ran, 503 when it could not finish and a retry may (timeout, browser), 422 when it never can
         (the form does not draw, a page cannot be reached, a Theme names an adapter the host lacks). GET /health for liveness. Needs @axe-core/playwright.
         POST /print with {documents, receipt} answers with the read-only print page (every page of the form, the
         Response's answers, then the receipt) that the receipt PDF is rendered from; it starts no browser.
  --timeout-ms  hard cap on one check, browser start to report (default 60000)`;

function failCli(message) {
  console.error(message);
  process.exit(2);
}

function writeOutput(outFile, content) {
  if (outFile) {
    writeFileSync(outFile, content);
    return Promise.resolve();
  }
  return new Promise((resolveOut) => {
    process.stdout.write(content, () => resolveOut());
  });
}

/** The documents in a directory, as the pinned set a form version would carry. */
export function readDocuments(dir, code) {
  const docs = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const definition = docs.find((d) => d.$formspec);
  if (!definition) failCli(`${dir}: no Definition document ($formspec) found`);
  const theme = docs.find((d) => d.$formspecTheme);
  const locales = docs.filter((d) => d.$formspecLocale);
  const locale = code ? locales.find((d) => d.locale === code) : undefined;
  if (code && !locale) failCli(`${dir}: no Locale document for ${code}`);
  return { definition, theme, locales, locale };
}

/** The forms in a package-manifest.json, with each form's Definition, Theme and strictly scoped Locale documents. */
export function readPackageForms(manifestPath, formFilter, code, { requireSingle = false, requireAll = false } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const baseDir = dirname(manifestPath);
  const allForms = Array.isArray(manifest.forms) ? manifest.forms : [];
  if (allForms.length === 0) {
    failCli(`${manifestPath}: no forms found in package-manifest.json`);
  }
  const availableIds = allForms.map((f) => f.formId).join(', ');
  if (requireSingle && !formFilter && allForms.length > 1) {
    failCli(`${manifestPath}: package has multiple forms; pass --form <formId> (available: ${availableIds})`);
  }
  const selected = formFilter
    ? allForms.filter((f) => f.formId === formFilter || f.slug === formFilter)
    : allForms;
  if (selected.length === 0) {
    failCli(`${manifestPath}: no form matching '${formFilter}' (available: ${availableIds})`);
  }
  const loaded = selected.map((form) => {
    const definition = JSON.parse(readFileSync(join(baseDir, form.definition.file), 'utf8'));
    const locales = (form.locales ?? []).map((l) => JSON.parse(readFileSync(join(baseDir, l.file), 'utf8')));
    const themeFile = form.theme?.file ?? manifest.theme?.file;
    const theme = themeFile ? JSON.parse(readFileSync(join(baseDir, themeFile), 'utf8')) : undefined;
    const locale = code ? locales.find((d) => d.locale === code) : undefined;
    if (code && !locale && (requireSingle || requireAll || Boolean(formFilter))) {
      failCli(`${manifestPath} (${form.formId}): no Locale document for ${code}`);
    }
    return { formId: form.formId, slug: form.slug, displayName: form.displayName, definition, theme, locales, locale };
  });
  if (code && !requireSingle && !formFilter) {
    const matching = loaded.filter((f) => Boolean(f.locale));
    if (matching.length === 0) {
      failCli(`${manifestPath}: no form has a Locale document for ${code}`);
    }
    return matching;
  }
  return loaded;
}

/** Expand resolved forms into the ordered `(form, localeCode)` checks that `a11y` executes. */
export function planA11yChecks(forms, { manifestPath, code } = {}) {
  return forms.flatMap((form) => {
    const localesToCheck = manifestPath
      ? (code ? [form.locale?.locale] : [undefined, ...form.locales.map((l) => l.locale)])
      : [form.locale?.locale];
    return localesToCheck.map((localeCode) => ({ form, localeCode }));
  });
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
})();

if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const command = args[0];
  if (command === 'test') {
    const require = createRequire(import.meta.url);
    const forwarded = [];
    const reporters = [];
    let summary;
    const testArgs = args.slice(1);
    for (let i = 0; i < testArgs.length; i += 1) {
      const arg = testArgs[i];
      if (arg === '--summary' || arg.startsWith('--summary=')) {
        summary = arg === '--summary' ? testArgs[++i] : arg.slice('--summary='.length);
        if (!summary || summary.startsWith('--')) failCli('--summary requires a JSON output path');
      } else if (arg === '--reporter') reporters.push(testArgs[++i] ?? 'list');
      else if (arg.startsWith('--reporter=')) reporters.push(arg.slice('--reporter='.length));
      else forwarded.push(arg);
    }
    const gate = fileURLToPath(new URL('../dist/reporter.js', import.meta.url));
    const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test',
      '--reporter', [...(reporters.length ? reporters : ['list']), gate].join(','), ...forwarded], { stdio: 'inherit',
        env: { ...process.env, ...(summary ? { FORMSPEC_WALK_SUMMARY: resolve(summary) } : {}) } });
    if (result.error) console.error(result.error.message);
    process.exit(result.status ?? 1);
  }
  if (!['emit', 'a11y', 'serve'].includes(command)) failCli(USAGE);

  const resolveForms = ({ requireSingle = false, requireAll = false } = {}) => {
    const docsDir = flag('docs');
    const manifestArg = flag('manifest');
    const formFilter = flag('form');
    const code = flag('locale');
    const autoManifest = !manifestArg && docsDir && existsSync(join(docsDir, 'package-manifest.json'))
      ? join(docsDir, 'package-manifest.json')
      : undefined;
    const manifestPath = manifestArg ?? autoManifest;
    if (manifestPath) {
      return { manifestPath, forms: readPackageForms(manifestPath, formFilter, code, { requireSingle, requireAll }) };
    }
    if (!docsDir) failCli(USAGE);
    return { manifestPath: undefined, forms: [{ formId: basename(docsDir), ...readDocuments(docsDir, code) }] };
  };

  const timeoutMs = flag('timeout-ms') ? Number(flag('timeout-ms')) : undefined;

  /** The serve module loads the webcomponent and a browser driver; only the commands that need them pay for it. */
  const { AccessibilityServer } = command === 'emit' ? {} : await import('@formspec-org/walk/serve');

  if (command === 'serve') {
    const server = new AccessibilityServer({ timeoutMs });
    await server.listen(Number(flag('port') ?? 8099), flag('host') ?? '127.0.0.1');
    console.error(`formspec-walk serve: ${server.url}`);
    const stop = () => void server.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } else if (command === 'a11y') {
    const { manifestPath, forms } = resolveForms({ requireSingle: false });
    const code = flag('locale');
    const checks = planA11yChecks(forms, { manifestPath, code });
    const server = new AccessibilityServer({ timeoutMs });
    await server.listen(0);
    if (checks.length === 1) {
      const [{ form, localeCode }] = checks;
      const report = await server.check({
        definition: form.definition,
        theme: form.theme,
        locales: form.locales,
        locale: localeCode,
      });
      await server.close();
      const json = `${JSON.stringify(report, null, 2)}\n`;
      await writeOutput(flag('out'), json);
      process.exit(report.status === 'failed' ? 3 : report.violations.length ? 1 : 0);
    } else {
      const started = performance.now();
      const results = [];
      for (const { form, localeCode } of checks) {
        const report = await server.check({
          definition: form.definition,
          theme: form.theme,
          locales: form.locales,
          locale: localeCode,
        });
        results.push({ formId: form.formId, locale: localeCode ?? null, report });
      }
      await server.close();
      const totalMs = Math.round(performance.now() - started);
      const anyFailed = results.some((r) => r.report.status === 'failed');
      const violations = results.flatMap((r) =>
        r.report.violations.map((v) => ({ formId: r.formId, locale: r.locale, ...v })),
      );
      const summary = {
        status: anyFailed ? 'failed' : 'completed',
        forms: results,
        violations,
        totalMs,
      };
      const json = `${JSON.stringify(summary, null, 2)}\n`;
      await writeOutput(flag('out'), json);
      process.exit(anyFailed ? 3 : violations.length ? 1 : 0);
    }
  } else if (flag('bundle')) {
    if (!flag('url') || ['docs', 'manifest', 'form', 'root'].some(key => flag(key))) failCli(USAGE);
    if (flag('mode') && flag('mode') !== 'hash') failCli('Surface export emission requires a hash-mode preview URL');
    try {
      const { surfaceWalkTargets, emitSurfaceWalk } = await import('./surface-walk.mjs');
      const targets = surfaceWalkTargets(JSON.parse(readFileSync(flag('bundle'), 'utf8')), {
        url: flag('url'), params: JSON.parse(flag('params') ?? '{}'), locale: flag('locale'),
      });
      await writeOutput(flag('out'), emitSurfaceWalk(targets, flag('from')));
    } catch (error) {
      failCli(`formspec-walk emit: ${error.message}`);
    }
  } else {
    const all = args.includes('--all');
    const template = flag('url-template');
    const outDir = flag('out-dir');
    if (all) {
      if (!flag('manifest') || !template || !outDir || outDir.startsWith('--') || ['url', 'form', 'out', 'docs'].some(key => flag(key))) failCli(USAGE);
      if (!/{(?:formId|slug)}/.test(template)) failCli('--url-template requires {formId} or {slug}');
    } else if (template || outDir || !flag('url') || (!flag('docs') && !flag('manifest'))) failCli(USAGE);

    const { manifestPath, forms } = resolveForms({ requireSingle: !all, requireAll: all });
    const urls = new Set();
    const files = new Set();
    const targets = forms.map(form => {
      if (!all) return { form, url: flag('url'), file: flag('out') };
      if (typeof form.formId !== 'string' || !form.formId) failCli('Every manifest form requires a formId');
      const url = template.replace(/{(formId|slug)}/g, (_, key) => {
        if (!form[key]) failCli(`${form.formId} has no ${key} for --url-template`);
        return encodeURIComponent(form[key]);
      });
      const filename = encodeURIComponent(form.formId) + '.spec.ts';
      if (files.has(filename.toLowerCase()) || urls.has(url)) failCli(`${form.formId}: duplicate spec filename or host URL`);
      files.add(filename.toLowerCase());
      urls.add(url);
      return { form, url, file: join(outDir, filename) };
    });
    if (all && existsSync(outDir)) {
      const wanted = new Set(targets.map(target => basename(target.file)));
      const stale = readdirSync(outDir).find(name => name.endsWith('.spec.ts') && !wanted.has(name));
      if (stale) failCli(`${outDir} contains another spec (${stale}); use a dedicated output directory`);
    }
    await initFormspecEngine();
    const commandLine = ['formspec-walk', ...args].map(arg => /^[a-zA-Z0-9_./:@=-]+$/.test(arg)
      ? arg : "'" + arg.replaceAll("'", "'\\''") + "'").join(' ');
    const outputs = targets.map(({ form, url, file }) => {
      const { definition, theme, locale } = form;
      const plan = derivePlan(definition, { locale, theme });
      const recipes = deriveRecipes(createFormEngine(definition), plan);
      const source = manifestPath
        ? `${basename(dirname(manifestPath))}/${form.formId}${form.displayName ? ` (${form.displayName})` : ''}`
        : `${basename(flag('docs'))}/`;
      const spec = emitSpec(plan, definition, { url, source, command: commandLine, locale, recipes,
        formId: form.formId, root: flag('root'), axe: args.includes('--axe'), theme, from: flag('from') });
      return { file, spec };
    });
    if (all) mkdirSync(outDir, { recursive: true });
    for (const { file, spec } of outputs) await writeOutput(file, spec);
  }
}
