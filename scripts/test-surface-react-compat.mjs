/**
 * @filedesc Exercise the packed Surface React binding against both supported
 * React majors without changing this workspace's lockfile or installation.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockfile = join(workspace, 'package-lock.json');
const initialLockHash = sha256(readFileSync(lockfile));
const temporaryRoot = mkdtempSync(join(tmpdir(), 'formspec-surface-react-compat-'));
const packDirectory = join(temporaryRoot, 'packs');
mkdirSync(packDirectory);

const packageDirectories = [
  'packages/formspec-types',
  'packages/formspec-app-graph',
  'packages/formspec-layout',
  'packages/formspec-engine',
  'packages/formspec-react',
  'packages/formspec-surface',
  'packages/formspec-surface-react',
];

const reactVersions = ['18.2.0', '19.2.4'];

try {
  for (const packageDirectory of packageDirectories) {
    execFileSync(
      'npm',
      [
        'pack',
        '--ignore-scripts',
        '--pack-destination',
        packDirectory,
        join(workspace, packageDirectory),
      ],
      { cwd: workspace, stdio: 'ignore' },
    );
  }

  const tarballs = readdirSync(packDirectory)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(packDirectory, name));
  if (tarballs.length !== packageDirectories.length) {
    throw new Error(
      `Expected ${packageDirectories.length} package archives, found ${tarballs.length}.`,
    );
  }

  for (const reactVersion of reactVersions) {
    const testDirectory = join(temporaryRoot, `react-${reactVersion}`);
    mkdirSync(testDirectory);
    writeFileSync(
      join(testDirectory, 'package.json'),
      `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
    );
    writeFileSync(join(testDirectory, 'compat.mjs'), compatibilityHarness());

    process.stdout.write(`React ${reactVersion}: installing isolated test dependencies\n`);
    execFileSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-package-lock',
        '--no-audit',
        '--no-fund',
        '--legacy-peer-deps',
        `react@${reactVersion}`,
        `react-dom@${reactVersion}`,
        'happy-dom@17.6.3',
        'tsx@4.19.0',
        ...tarballs,
      ],
      { cwd: testDirectory, stdio: 'inherit' },
    );
    execFileSync(
      join(testDirectory, 'node_modules', '.bin', 'tsx'),
      ['compat.mjs'],
      { cwd: testDirectory, stdio: 'inherit' },
    );

    if (existsSync(join(testDirectory, 'package-lock.json'))) {
      throw new Error(`React ${reactVersion} compatibility run created a lockfile.`);
    }
  }

  const finalLockHash = sha256(readFileSync(lockfile));
  if (finalLockHash !== initialLockHash) {
    throw new Error('The workspace package-lock.json changed during compatibility testing.');
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function compatibilityHarness() {
  return String.raw`
import { Window } from 'happy-dom';

const browser = new Window({ url: 'https://example.test/home' });
for (const [name, value] of Object.entries({
  window: browser,
  self: browser,
  document: browser.document,
  navigator: browser.navigator,
  HTMLElement: browser.HTMLElement,
  Element: browser.Element,
  Node: browser.Node,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const act = React.act ?? (await import('react-dom/test-utils')).act;
const publicBinding = await import('@formspec-org/surface-react');
if (typeof publicBinding.SurfaceApp !== 'function') {
  throw new Error('The packed public binding did not export SurfaceApp.');
}

function rootContent(strict, child) {
  return strict ? React.createElement(React.StrictMode, null, child) : child;
}

function diagnostic(message = 'No route matched.') {
  return {
    code: 'ROUTE-UNMATCHED',
    severity: 'warning',
    message,
    site: { surfaceId: 'compat', routeId: 'home' },
    details: { nested: { second: 2, first: 1 }, sequence: [1, 2] },
  };
}

function diagnosticBundle(message = 'No route matched.') {
  return {
    manifest: { $formspecBundle: '2.0', title: 'Compatibility app' },
    title: 'Compatibility app',
    surfaces: [{
      $formspecSurface: '0.1',
      id: 'compat',
      entry: 'home',
      routes: [{
        id: 'home',
        path: '/home',
        title: 'Home',
        routeClass: 'operation',
        slots: [],
      }],
    }],
    experiences: [],
    tenantTheme: undefined,
    registries: [],
    responseActions: [],
    definitions: new Map(),
    diagnostics: [diagnostic(message)],
  };
}

async function runStateUpdatingHost(strict) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let deliveries = 0;
  let deliveredCodes = [];

  function StateUpdatingHost() {
    const [, setRevision] = React.useState(0);
    return React.createElement(publicBinding.SurfaceApp, {
      bundle: diagnosticBundle(),
      location: '/home',
      onNavigate: () => {},
      setDocumentTitle: false,
      onDiagnostics: (nextDiagnostics) => {
        deliveries += 1;
        deliveredCodes = nextDiagnostics.map((diagnostic) => diagnostic.code);
        if (deliveries < 4) setRevision((value) => value + 1);
      },
    });
  }

  const app = React.createElement(StateUpdatingHost);
  await act(async () => {
    root.render(rootContent(strict, app));
  });
  if (deliveries !== 1) {
    throw new Error(
      (strict ? 'StrictMode' : 'ordinary root') +
        ' delivered diagnostics ' +
        deliveries +
        ' times; expected once.',
    );
  }
  await act(async () => root.unmount());
  container.remove();
  return deliveredCodes;
}

async function runSubscriptionTransitions(strict) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const received = { first: [], replacement: [], resubscribed: [] };

  const renderHarness = async (message, onDiagnostics) => {
    await act(async () => {
      root.render(
        rootContent(
          strict,
          React.createElement(publicBinding.SurfaceApp, {
            bundle: diagnosticBundle(message),
            location: '/home',
            onNavigate: () => {},
            setDocumentTitle: false,
            onDiagnostics,
          }),
        ),
      );
    });
  };

  const first = (diagnostics) => received.first.push(
    diagnostics.map((entry) => entry.message),
  );
  const replacement = (diagnostics) => received.replacement.push(
    diagnostics.map((entry) => entry.message),
  );
  const resubscribed = (diagnostics) => received.resubscribed.push(
    diagnostics.map((entry) => entry.message),
  );

  await renderHarness('No route matched.', first);
  await renderHarness('No route matched.', replacement);
  await renderHarness('Route changed.', replacement);
  await renderHarness('Route changed.', undefined);
  await renderHarness('Route changed.', resubscribed);
  await renderHarness('Another change.', resubscribed);

  const expected = {
    first: [['No route matched.']],
    replacement: [['Route changed.']],
    resubscribed: [['Route changed.'], ['Another change.']],
  };
  if (JSON.stringify(received) !== JSON.stringify(expected)) {
    throw new Error(
      (strict ? 'StrictMode' : 'ordinary root')
        + ' subscription transitions differed: '
        + JSON.stringify(received),
    );
  }

  await act(async () => root.unmount());
  container.remove();
  return received;
}

const ordinary = {
  initial: await runStateUpdatingHost(false),
  transitions: await runSubscriptionTransitions(false),
};
const strict = {
  initial: await runStateUpdatingHost(true),
  transitions: await runSubscriptionTransitions(true),
};
if (JSON.stringify(strict) !== JSON.stringify(ordinary)) {
  throw new Error('Ordinary and StrictMode roots delivered different diagnostic ordering.');
}

process.stdout.write(
  JSON.stringify({
    react: React.version,
    publicSurfaceAppImported: true,
    publicSurfaceAppRendered: true,
    ordinaryInitialDeliveries: 1,
    strictModeInitialDeliveries: 1,
    diagnosticCodes: ordinary.initial,
    subscriptionTransitions: ordinary.transitions,
  }) + '\n',
);
`;
}
