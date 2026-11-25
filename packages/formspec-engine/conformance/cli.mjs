#!/usr/bin/env node
/** @filedesc CLI for running external Formspec conformance suites and rule-mutation coverage. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runSuite } from './index.mjs';

const USAGE = `Usage:
  formspec-conformance run --suite <file|dir> --root <dir> [--ledger <file>] [--out <file>] [--native <binary>]
  formspec-conformance mutate --suite <file|dir> --root <dir> --definition <file> [--ledger <file>] [--named <file>] [--only <id>...] [--workers <n>] [--exhaustive] [--native <binary>] [--out <file>]
`;

export async function runCli(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === 'run') {
    const { values } = parseArgs({
      args: rest,
      options: {
        suite: { type: 'string' },
        root: { type: 'string', default: '.' },
        ledger: { type: 'string' },
        out: { type: 'string' },
        native: { type: 'string' },
      },
    });
    if (!values.suite) {
      throw new Error('Expected --suite <file|dir>');
    }
    const report = await runSuite({
      suite: values.suite,
      root: values.root,
      ledger: values.ledger,
      native: values.native,
    });
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (values.out) {
      const outPath = path.resolve(values.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, text, 'utf8');
    }
    process.stdout.write(text);
    return report.ok ? 0 : 1;
  }

  if (command === 'mutate') {
    const mutationMod = await import('./rule-mutation.mjs');
    const { values } = parseArgs({
      args: rest,
      options: {
        suite: { type: 'string' },
        definition: { type: 'string' },
        root: { type: 'string', default: '.' },
        only: { type: 'string', multiple: true },
        named: { type: 'string' },
        ledger: { type: 'string' },
        workers: { type: 'string' },
        exhaustive: { type: 'boolean' },
        native: { type: 'string' },
        out: { type: 'string' },
      },
    });
    if (!values.suite || !values.definition) {
      throw new Error('Expected --suite <file|dir> --definition <file>');
    }
    const { readJson } = await import('./load-suite.mjs');
    const report = await mutationMod.runMutationCoverage({
      suite: values.suite,
      definitionPath: values.definition,
      root: values.root,
      ledger: values.ledger,
      only: values.only,
      workers: values.workers === undefined ? undefined : Number(values.workers),
      exhaustive: values.exhaustive,
      native: values.native,
      named: values.named ? readJson(path.resolve(values.root, values.named)) : undefined,
    });
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (values.out) {
      const outPath = path.resolve(values.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, text, 'utf8');
    }
    process.stdout.write(text);
    return 0;
  }

  throw new Error(`Unknown command: ${command}\n${USAGE}`);
}

const invokedAsMain = process.argv[1]
  && (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
    || fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url));

if (invokedAsMain) {
  runCli(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exitCode = 1;
    },
  );
}
