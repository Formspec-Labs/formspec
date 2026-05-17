# Makefile for Formspec — documentation, tests, and full compile (Rust + JS/WASM + PyO3).

PANDOC = pandoc
TEMPLATE = docs/template.html
DOCS_DIR = docs
SPECS_DIR = specs
# Normative FEL grammar lives in sibling `fel-core` (path-coupled stack layout).
FEL_GRAMMAR_SRC = ../fel-core/specs/fel/fel-grammar.md

all: build

# npm install gate: refreshed when package-lock.json changes. Every target
# that calls `npm run` depends on this so a clean checkout's `make build`
# (or `make test`) installs deps automatically.
node_modules: package-lock.json package.json
	npm ci
	@touch node_modules

spec-artifacts: node_modules
	npm run docs:generate

docs-check: node_modules
	npm run docs:check

test-unit: build-js
	npm run test:unit

test-e2e: node_modules
	npm run test:e2e

# formspec-studio extracted to sibling repo formspec-stack/formspec-studio/ on 2026-05-04.
# Its e2e suite is owned there; not run as part of formspec's `make test`.

test-python: build-python
	.venv/bin/python -m pytest tests/

test-scripts: node_modules
	npm run test:scripts

build-wasm: node_modules
	npm run build:wasm --workspace=@formspec-org/engine

# Full compile: Rust workspace + npm workspaces (WASM via formspec-engine) +
# formspec_rust into active Python.
build: build-rust build-js build-python

build-rust:
	cargo build --workspace

build-js: node_modules
	npm run build


# Python venv gate: refreshed when pyproject.toml or formspec-py crate changes.
# Installs maturin (build backend for formspec-py) and the test extras up front
# so vitest's globalSetup `pip install --no-build-isolation ./crates/formspec-py`
# (in packages/formspec-core/tests/python.ts) finds maturin in the venv.
#
# Keyed off `.venv/.deps-stamp` rather than `.venv/` itself so a pre-existing
# venv created without these deps still triggers re-provisioning. Removing
# the stamp (or bumping pyproject.toml / formspec-py Cargo.toml) re-runs the
# install steps without recreating the venv from scratch.
.venv/.deps-stamp: pyproject.toml crates/formspec-py/Cargo.toml
	@if [ ! -d .venv ]; then python3 -m venv .venv; fi
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install maturin
	.venv/bin/pip install -e '.[test]'
	.venv/bin/pip install --no-build-isolation ./crates/formspec-py
	@touch .venv/.deps-stamp

# Builds the Rust extension and places the .so into the source tree for editable installs.
# Uses maturin develop so the in-tree _native.so stays current (pip install writes to
# site-packages, which is shadowed by the editable src/formspec/ on sys.path).
build-python: .venv/.deps-stamp
	.venv/bin/maturin develop --release

# Force-rebuild the Python extension from scratch. Use this when tests pick up
# stale bindings — typical symptom: a function signature was changed in Rust
# but Python still sees the old shape.
# maturin develop with python-source="src" places the .so directly in src/formspec/.
rebuild-python: .venv/.deps-stamp
	rm -f src/formspec/_native*.so
	.venv/bin/maturin develop --release

test-rust:
	cargo nextest run --workspace

test: test-unit test-python test-rust test-scripts test-e2e

test-engine-isolation: build-js
	npm run --workspace=@formspec-org/engine test:init-entry-runtime-only
	npm run --workspace=@formspec-org/engine test:render-entry-runtime-only
	npm run --workspace=@formspec-org/engine test:fel-runtime-entry-only
	npm run --workspace=@formspec-org/engine test:wasm-runtime-isolation
	npm run --workspace=@formspec-org/engine test:wasm-tools-import-count

check: docs-check test test-engine-isolation
	npm run check:deps
	npm run check:studio-source-sizes

api-docs:
	PYTHONPATH=src python3 -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('pdoc') else 1)" || python3 -m pip install -e '.[docs]'
	PYTHONPATH=src python3 -m pdoc formspec --output-directory $(DOCS_DIR)/api/formspec
	npx typedoc --entryPoints packages/formspec-types/src/index.ts --tsconfig packages/formspec-types/tsconfig.json --out $(DOCS_DIR)/api/formspec-types
	npx typedoc --entryPoints packages/formspec-engine/src/index.ts --tsconfig packages/formspec-engine/tsconfig.json --out $(DOCS_DIR)/api/formspec-engine
	npx typedoc --entryPoints packages/formspec-layout/src/index.ts --tsconfig packages/formspec-layout/tsconfig.json --out $(DOCS_DIR)/api/formspec-layout
	npx typedoc --entryPoints packages/formspec-webcomponent/src/index.ts --tsconfig packages/formspec-webcomponent/tsconfig.json --out $(DOCS_DIR)/api/formspec-webcomponent
	npx typedoc --entryPoints packages/formspec-adapters/src/index.ts --tsconfig packages/formspec-adapters/tsconfig.json --out $(DOCS_DIR)/api/formspec-adapters
	npx typedoc --entryPoints packages/formspec-assist/src/index.ts --tsconfig packages/formspec-assist/tsconfig.json --out $(DOCS_DIR)/api/formspec-assist
	npx typedoc --entryPoints packages/formspec-react/src/index.ts --tsconfig packages/formspec-react/tsconfig.json --out $(DOCS_DIR)/api/formspec-react
	npx typedoc --entryPoints packages/formspec-core/src/index.ts --tsconfig packages/formspec-core/tsconfig.json --out $(DOCS_DIR)/api/formspec-core
	npx typedoc --entryPoints packages/formspec-chat/src/index.ts --tsconfig packages/formspec-chat/tsconfig.json --out $(DOCS_DIR)/api/formspec-chat
	cargo doc --workspace --no-deps
	rm -rf $(DOCS_DIR)/api/rust && cp -r target/doc $(DOCS_DIR)/api/rust
	PYTHONPATH=src python3 scripts/generate-api-markdown.py src/formspec/API.llm.md
	node scripts/generate-ts-api-markdown.mjs

html-docs: \
      $(DOCS_DIR)/spec.html \
      $(DOCS_DIR)/mapping.html \
      $(DOCS_DIR)/fel-grammar.html \
      $(DOCS_DIR)/changelog.html \
      $(DOCS_DIR)/extension-registry.html \
      $(DOCS_DIR)/theme-spec.html \
      $(DOCS_DIR)/component-spec.html \
      $(DOCS_DIR)/references-spec.html \
      $(DOCS_DIR)/ontology-spec.html \
      $(DOCS_DIR)/locale-spec.html \
      $(DOCS_DIR)/grant-application.html

docs: html-docs api-docs

$(DOCS_DIR)/spec.html: $(SPECS_DIR)/core/spec.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec Core Specification" -o $@ $<

$(DOCS_DIR)/mapping.html: $(SPECS_DIR)/mapping/mapping-spec.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec Mapping Specification" -o $@ $<

$(DOCS_DIR)/fel-grammar.html: $(FEL_GRAMMAR_SRC) $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="FEL Grammar Specification" -o $@ $<

$(DOCS_DIR)/changelog.html: $(SPECS_DIR)/registry/changelog-spec.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec Changelog Specification" -o $@ $<

$(DOCS_DIR)/extension-registry.html: $(SPECS_DIR)/registry/extension-registry.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec Extension Registry" -o $@ $<

$(DOCS_DIR)/theme-spec.html: $(SPECS_DIR)/theme/theme-spec.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec Theme Specification" -o $@ $<

$(DOCS_DIR)/component-spec.html: $(SPECS_DIR)/component/component-spec.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec Component Specification" -o $@ $<

$(DOCS_DIR)/references-spec.html: $(SPECS_DIR)/core/references-spec.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec References Specification" -o $@ $<

$(DOCS_DIR)/ontology-spec.html: $(SPECS_DIR)/ontology/ontology-spec.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec Ontology Specification" -o $@ $<

$(DOCS_DIR)/locale-spec.html: $(SPECS_DIR)/locale/locale-spec.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Formspec Locale Specification" -o $@ $<

$(DOCS_DIR)/grant-application.html: docs/grant-application-guide.md $(TEMPLATE)
	$(PANDOC) -s --toc --template=$(TEMPLATE) --metadata title="Grant Application — Formspec Walkthrough" -o $@ $<

setup: .venv/.deps-stamp
	.venv/bin/pip install pre-commit
	.venv/bin/pre-commit install

serve:
	busybox httpd -f -p 8000 -h docs

clean:
	rm -f $(DOCS_DIR)/spec.html \
	      $(DOCS_DIR)/mapping.html \
	      $(DOCS_DIR)/fel-grammar.html \
	      $(DOCS_DIR)/changelog.html \
	      $(DOCS_DIR)/extension-registry.html \
	      $(DOCS_DIR)/theme-spec.html \
	      $(DOCS_DIR)/component-spec.html \
	      $(DOCS_DIR)/references-spec.html \
	      $(DOCS_DIR)/ontology-spec.html \
	      $(DOCS_DIR)/locale-spec.html \
	      $(DOCS_DIR)/grant-application.html
	rm -rf $(DOCS_DIR)/api
	rm -f src/formspec/API.llm.md \
	      packages/formspec-engine/API.llm.md \
	      packages/formspec-layout/API.llm.md \
	      packages/formspec-webcomponent/API.llm.md \
	      packages/formspec-core/API.llm.md \
	      packages/formspec-chat/API.llm.md \
	      packages/formspec-react/API.llm.md

.PHONY: all spec-artifacts docs-check check docs html-docs api-docs build build-rust build-js build-python rebuild-python build-wasm test test-unit test-engine-isolation test-python test-rust test-scripts test-e2e setup serve clean
