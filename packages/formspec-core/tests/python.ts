import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve the correct Python binary.
 *
 * Prefers `.venv/bin/python3` (matching where `make build-python` installs)
 * so the test always uses the same environment that `make build` targets.
 * Falls back to pyenv, then bare `python3`.
 */
export function resolvePython(): string {
  const rootDir = path.resolve(__dirname, '../../..');
  const venvPython = path.join(rootDir, '.venv', 'bin', 'python3');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  try {
    return execSync('pyenv which python3', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return 'python3';
  }
}

export function pythonTestEnv(rootDir: string): NodeJS.ProcessEnv {
  return { ...process.env, PYTHONPATH: path.join(rootDir, 'src') };
}

/** Check that the installed formspec_rust has the expected function signatures. */
function hasCurrentEvaluateDefSignature(pythonBin: string, rootDir: string): boolean {
  const output = execSync(
    `${pythonBin} - <<'PY'
import inspect
import formspec._rust as rust
print(inspect.signature(rust.formspec_rust.evaluate_def))
PY`,
    {
      cwd: rootDir,
      env: pythonTestEnv(rootDir),
      encoding: 'utf8',
      stdio: 'pipe',
    },
  ).trim();

  return output.includes('registry_documents=None') && output.includes('instances=None') && output.includes('context=None');
}

/**
 * Check that the installed formspec_rust CRATE_VERSION matches the version
 * in the workspace Cargo.toml. When the Rust crate is rebuilt (e.g. after a
 * schema change), the version stamp changes, catching stale binaries that
 * would otherwise pass the signature check.
 */
function hasCrateVersionMatch(pythonBin: string, rootDir: string): boolean {
  try {
    const installed = execSync(
      `${pythonBin} -c "import formspec._rust as rust; print(rust.formspec_rust.CRATE_VERSION)"`,
      { cwd: rootDir, env: pythonTestEnv(rootDir), encoding: 'utf8', stdio: 'pipe' },
    ).trim();
    const cargoToml = fs.readFileSync(path.join(rootDir, 'Cargo.toml'), 'utf8');
    const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
    if (!match) return true; // can't parse — skip check
    return installed === match[1];
  } catch {
    return false;
  }
}

/** Smoke-check the editable native extension's embedded component vocabulary. */
function hasCurrentComponentVocabulary(pythonBin: string, rootDir: string): boolean {
  try {
    const output = execSync(
      `${pythonBin} - <<'PY'
from formspec._rust import lint
valid_component = {
    "$formspecComponent": "1.0",
    "version": "0.1.0",
    "targetDefinition": {"url": "urn:formspec:test"},
    "tree": {
        "component": "Stack",
        "children": [{"component": "Section", "title": "A", "children": []}],
    },
}
valid_errors = [d.code for d in lint(valid_component) if d.severity == "error"]
retired_results = []
for name in ["Page", "Columns", "Spacer"]:
    invalid_component = {
        "$formspecComponent": "1.0",
        "version": "0.1.0",
        "targetDefinition": {"url": "urn:formspec:test"},
        "tree": {"component": name},
    }
    retired_results.append(any(d.severity == "error" for d in lint(invalid_component)))
print(valid_errors, retired_results)
PY`,
      { cwd: rootDir, env: pythonTestEnv(rootDir), encoding: 'utf8', stdio: 'pipe' },
    ).trim();
    return output === '[] [True, True, True]';
  } catch {
    return false;
  }
}

export function ensureCurrentFormspecRust(pythonBin: string, rootDir: string): void {
  if (
    hasCurrentEvaluateDefSignature(pythonBin, rootDir)
    && hasCrateVersionMatch(pythonBin, rootDir)
    && hasCurrentComponentVocabulary(pythonBin, rootDir)
  ) {
    return;
  }

  execSync(`${pythonBin} -m maturin develop --release`, {
    cwd: rootDir,
    env: pythonTestEnv(rootDir),
    encoding: 'utf8',
    stdio: 'inherit',
  });
}
