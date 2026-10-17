#!/usr/bin/env node
/** @filedesc `formspec-walk`: emit a readable Playwright spec from a form's documents, check the reference renderer with axe (`a11y`), or serve that check over HTTP (`serve`). */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { derivePlan, deriveRecipes, emitSpec } from '@formspec-org/walk';

const USAGE = `usage: formspec-walk emit --docs <dir> --url <page url> [--locale <code>] [--out <file>] [--from <package>]
       formspec-walk a11y --docs <dir> [--locale <code>] [--timeout-ms <ms>] [--out <file>]
       formspec-walk serve [--port <n>] [--host <addr>] [--timeout-ms <ms>]

  --docs    a directory holding the form's documents: the Definition, its Locale(s), its Theme (any *.json)
  --url     the page the spec opens; it must mount a <formspec-render>
  --locale  the Locale to derive the wording from (default: the Definition's inline wording)
  --out     write here instead of stdout
  --from    the package the spec imports the walk from (default @formspec-org/walk)

  a11y   runs axe (WCAG A/AA) on every page of the form and again with validation errors shown, in the
         reference web renderer, and prints the report as JSON. Exit 0: axe ran and found nothing; 1: it
         found violations; 3: it could not finish (timeout, browser failure) — never a pass.
  serve  POST /check with {definition, theme?, locales?, locale?} answers with the same report: 200 when
         axe ran, 503 when it could not finish and a retry may (timeout, browser), 422 when it never can
         (the form does not draw, a page cannot be reached, a Theme names an adapter the host lacks). GET /health for liveness. Needs @axe-core/playwright.
         POST /print with {documents, receipt} answers with the read-only print page (every page of the form, the
         Response's answers, then the receipt) that the receipt PDF is rendered from; it starts no browser.
  --timeout-ms  hard cap on one check, browser start to report (default 60000)`;

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const command = args[0];
if (!['emit', 'a11y', 'serve'].includes(command)) { console.error(USAGE); process.exit(2); }

/** The documents in a directory, as the pinned set a form version would carry. */
function readDocuments(dir, code) {
  const docs = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const definition = docs.find((d) => d.$formspec);
  if (!definition) { console.error(`${dir}: no Definition document ($formspec) found`); process.exit(2); }
  const theme = docs.find((d) => d.$formspecTheme);
  const locales = docs.filter((d) => d.$formspecLocale);
  const locale = code ? locales.find((d) => d.locale === code) : undefined;
  if (code && !locale) { console.error(`${dir}: no Locale document for ${code}`); process.exit(2); }
  return { definition, theme, locales, locale };
}

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
  if (!flag('docs')) { console.error(USAGE); process.exit(2); }
  const { definition, theme, locales, locale } = readDocuments(flag('docs'), flag('locale'));
  const server = new AccessibilityServer({ timeoutMs });
  await server.listen(0);
  const report = await server.check({ definition, theme, locales, locale: locale?.locale });
  await server.close();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (flag('out')) writeFileSync(flag('out'), json);
  else process.stdout.write(json);
  process.exit(report.status === 'failed' ? 3 : report.violations.length ? 1 : 0);
} else {
  if (!flag('docs') || !flag('url')) { console.error(USAGE); process.exit(2); }
  const dir = flag('docs');
  const code = flag('locale');
  const { definition, theme, locale } = readDocuments(dir, code);
  const plan = derivePlan(definition, { locale, theme });
  await initFormspecEngine();
  const recipes = deriveRecipes(createFormEngine(definition), plan);
  const command_ = `npx formspec-walk emit --docs ${relative(process.cwd(), dir) || '.'} --url ${flag('url')}${code ? ` --locale ${code}` : ''}${flag('out') ? ` --out ${relative(process.cwd(), flag('out'))}` : ''}`;
  const spec = emitSpec(plan, definition, { url: flag('url'), source: `${basename(dir)}/`, command: command_, locale, recipes, from: flag('from') });
  if (flag('out')) writeFileSync(flag('out'), spec);
  else process.stdout.write(spec);
}
