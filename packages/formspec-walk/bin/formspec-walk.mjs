#!/usr/bin/env node
/** @filedesc `formspec-walk`: emit a readable Playwright spec from a form's documents, check the reference renderer with axe (`a11y`), or serve that check over HTTP (`serve`). */
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { derivePlan, deriveRecipes, emitSpec } from '@formspec-org/walk';

const USAGE = `usage: formspec-walk emit (--docs <dir> | --manifest <package-manifest.json>) [--form <formId>] --url <page url> [--locale <code>] [--out <file>] [--from <package>]
       formspec-walk a11y (--docs <dir> | --manifest <package-manifest.json>) [--form <formId>] [--locale <code>] [--timeout-ms <ms>] [--out <file>]
       formspec-walk serve [--port <n>] [--host <addr>] [--timeout-ms <ms>]

  --docs      a directory holding the form's documents: the Definition, its Locale(s), its Theme (any *.json), or a package directory containing package-manifest.json
  --manifest  a package-manifest.json file describing one or more forms and their per-form Definition, Locale(s) and Theme files
  --form      the formId (or slug) to select from package-manifest.json (required for emit when the package has multiple forms)
  --url       the page the spec opens; it must mount a <formspec-render> or React <FormspecForm>
  --locale    the Locale to derive the wording from (default: the Definition's inline wording)
  --out       write here instead of stdout
  --from      the package the spec imports the walk from (default @formspec-org/walk)

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
export function readPackageForms(manifestPath, formFilter, code, { requireSingle = false } = {}) {
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
    if (code && !locale && (requireSingle || Boolean(formFilter))) {
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
  if (!['emit', 'a11y', 'serve'].includes(command)) failCli(USAGE);

  const resolveForms = ({ requireSingle = false } = {}) => {
    const docsDir = flag('docs');
    const manifestArg = flag('manifest');
    const formFilter = flag('form');
    const code = flag('locale');
    const autoManifest = !manifestArg && docsDir && existsSync(join(docsDir, 'package-manifest.json'))
      ? join(docsDir, 'package-manifest.json')
      : undefined;
    const manifestPath = manifestArg ?? autoManifest;
    if (manifestPath) {
      return { manifestPath, forms: readPackageForms(manifestPath, formFilter, code, { requireSingle }) };
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
  } else {
    if (!flag('url') || (!flag('docs') && !flag('manifest'))) failCli(USAGE);
    const { manifestPath, forms } = resolveForms({ requireSingle: true });
    const [selectedForm] = forms;
    const { definition, theme, locale } = selectedForm;
    const code = flag('locale');
    const formFilter = flag('form');
    const plan = derivePlan(definition, { locale, theme });
    await initFormspecEngine();
    const recipes = deriveRecipes(createFormEngine(definition), plan);
    const sourceFlag = flag('manifest')
      ? `--manifest ${relative(process.cwd(), flag('manifest')) || basename(flag('manifest'))}`
      : `--docs ${relative(process.cwd(), flag('docs')) || '.'}`;
    const formFlag = formFilter ? ` --form ${formFilter}` : (manifestPath ? ` --form ${selectedForm.formId}` : '');
    const command_ = `npx formspec-walk emit ${sourceFlag}${formFlag} --url ${flag('url')}${code ? ` --locale ${code}` : ''}${flag('out') ? ` --out ${relative(process.cwd(), flag('out'))}` : ''}`;
    const source = manifestPath
      ? `${basename(dirname(manifestPath))}/${selectedForm.formId}${selectedForm.displayName ? ` (${selectedForm.displayName})` : ''}`
      : `${basename(flag('docs'))}/`;
    const spec = emitSpec(plan, definition, { url: flag('url'), source, command: command_, locale, recipes, from: flag('from') });
    await writeOutput(flag('out'), spec);
  }
}
