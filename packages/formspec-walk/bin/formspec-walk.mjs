#!/usr/bin/env node
/** @filedesc `formspec-walk emit`: write a readable Playwright spec from a form's documents. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { derivePlan, deriveRecipes, emitSpec } from '@formspec-org/walk';

const USAGE = `usage: formspec-walk emit --docs <dir> --url <page url> [--locale <code>] [--out <file>] [--from <package>]

  --docs    a directory holding the form's documents: the Definition, its Locale(s), its Theme (any *.json)
  --url     the page the spec opens; it must mount a <formspec-render>
  --locale  the Locale to derive the wording from (default: the Definition's inline wording)
  --out     write here instead of stdout
  --from    the package the spec imports the walk from (default @formspec-org/walk)`;

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
if (args[0] !== 'emit' || !flag('docs') || !flag('url')) { console.error(USAGE); process.exit(2); }

const dir = flag('docs');
const docs = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const definition = docs.find((d) => d.$formspec);
if (!definition) { console.error(`${dir}: no Definition document ($formspec) found`); process.exit(2); }
const theme = docs.find((d) => d.$formspecTheme);
const code = flag('locale');
const locale = code ? docs.find((d) => d.$formspecLocale && d.locale === code) : undefined;
if (code && !locale) { console.error(`${dir}: no Locale document for ${code}`); process.exit(2); }

const plan = derivePlan(definition, { locale, theme });
await initFormspecEngine();
const recipes = deriveRecipes(createFormEngine(definition), plan);
const command = `npx formspec-walk emit --docs ${relative(process.cwd(), dir) || '.'} --url ${flag('url')}${code ? ` --locale ${code}` : ''}${flag('out') ? ` --out ${relative(process.cwd(), flag('out'))}` : ''}`;
const spec = emitSpec(plan, definition, { url: flag('url'), source: `${basename(dir)}/`, command, locale, recipes, from: flag('from') });
if (flag('out')) writeFileSync(flag('out'), spec);
else process.stdout.write(spec);
