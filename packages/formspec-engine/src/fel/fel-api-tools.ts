/** @filedesc FEL/registry/lint/changelog helpers backed by tools WASM (`wasm-bridge-tools` only; ADR 0050). */

import type {
    DocumentType,
    ExtensionUsageIssue,
    FELBuiltinFunctionCatalogEntry,
    FELRewriteOptions,
    RegistryEntry,
    RewriteMap,
    SchemaValidationError,
    SchemaValidationResult,
    SchemaValidator,
    SchemaValidatorSchemas,
} from '../interfaces.js';

export type {
    DocumentType,
    ExtensionUsageIssue,
    FELConditionGroupLiftResult,
    FELConditionBuilderOperator,
    FELConditionGroupCondition,
    FELConditionGroupLifted,
    FELConditionGroupUnlifted,
    SchemaValidationError,
    SchemaValidationResult,
    SchemaValidator,
    SchemaValidatorSchemas,
} from '../interfaces.js';

import {
    wasmCollectFELRewriteTargets,
    wasmDeriveJsonLdContext,
    wasmFindRegistryEntry,
    wasmGenerateChangelog,
    wasmLintDocument,
    wasmListBuiltinFunctions,
    wasmParseRegistry,
    wasmPrintFEL,
    wasmRewriteFelForAssembly,
    wasmRewriteFELReferences,
    wasmRewriteMessageTemplate,
    wasmTokenizeFEL,
    wasmTryLiftConditionGroup,
    wasmValidateExtensionUsage,
    wasmValidateLifecycleTransition,
    wasmWellKnownRegistryUrl,
} from '../wasm-bridge-tools.js';

export const tokenizeFEL = wasmTokenizeFEL;

function mapRewriteEntries(
    entries: string[],
    rewrite?: (value: string) => string,
): Record<string, string> | undefined {
    if (!rewrite || entries.length === 0) return undefined;
    const mapped: Record<string, string> = {};
    let changed = false;
    for (const entry of entries) {
        const next = rewrite(entry);
        if (next !== entry) {
            mapped[entry] = next;
            changed = true;
        }
    }
    return changed ? mapped : undefined;
}

function mapRewriteNavigationTargets(
    entries: Array<{ functionName: 'prev' | 'next' | 'parent'; name: string }>,
    rewrite?: (name: string, fn: 'prev' | 'next' | 'parent') => string,
): Record<string, string> | undefined {
    if (!rewrite || entries.length === 0) return undefined;
    const mapped: Record<string, string> = {};
    let changed = false;
    for (const entry of entries) {
        const next = rewrite(entry.name, entry.functionName);
        if (next !== entry.name) {
            mapped[`${entry.functionName}:${entry.name}`] = next;
            changed = true;
        }
    }
    return changed ? mapped : undefined;
}

/** Rewrite FEL references using callback options (bridges to WASM rewrite). */
export function rewriteFELReferences(expression: string, options: FELRewriteOptions): string {
    const targets = wasmCollectFELRewriteTargets(expression);
    return wasmRewriteFELReferences(expression, {
        fieldPaths: mapRewriteEntries(targets.fieldPaths, options.rewriteFieldPath),
        currentPaths: mapRewriteEntries(targets.currentPaths, options.rewriteCurrentPath),
        variables: mapRewriteEntries(targets.variables, options.rewriteVariable),
        instanceNames: mapRewriteEntries(targets.instanceNames, options.rewriteInstanceName),
        navigationTargets: mapRewriteNavigationTargets(targets.navigationTargets, options.rewriteNavigationTarget),
    });
}

export const rewriteMessageTemplate = wasmRewriteMessageTemplate;
export const lintDocument = wasmLintDocument;
export const parseRegistry = wasmParseRegistry;
export const findRegistryEntry = wasmFindRegistryEntry;
export const validateLifecycleTransition = wasmValidateLifecycleTransition;
export const wellKnownRegistryUrl = wasmWellKnownRegistryUrl;
export const deriveJsonLdContext = wasmDeriveJsonLdContext;
export type { JsonLdContextDiagnostic } from '../wasm-bridge-tools.js';
export const generateChangelog = wasmGenerateChangelog;
export const printFEL = wasmPrintFEL;

export const tryLiftConditionGroup = wasmTryLiftConditionGroup;

export function getBuiltinFELFunctionCatalog(): FELBuiltinFunctionCatalogEntry[] {
    return wasmListBuiltinFunctions();
}

export function validateExtensionUsage(
    items: unknown[],
    options: { resolveEntry: (name: string) => RegistryEntry | undefined },
): ExtensionUsageIssue[] {
    const names = new Set<string>();
    collectExtensionNames(items, names);
    const registryEntries: Record<string, RegistryEntry> = {};
    for (const name of names) {
        const entry = options.resolveEntry(name);
        if (entry) {
            registryEntries[name] = entry;
        }
    }
    return wasmValidateExtensionUsage(items, registryEntries) as ExtensionUsageIssue[];
}

export function createSchemaValidator(_schemas?: SchemaValidatorSchemas): SchemaValidator {
    return {
        validate(document: unknown, documentType?: DocumentType | null): SchemaValidationResult {
            const result = lintDocument(document);
            return {
                documentType: (documentType ?? result.documentType ?? null) as DocumentType | null,
                errors: (result.diagnostics ?? [])
                    .filter((diag: any) => diag?.severity === 'error')
                    .map(
                        (diag: any): SchemaValidationError => ({
                            path: typeof diag.path === 'string' ? diag.path : '$',
                            message: typeof diag.message === 'string' ? diag.message : 'Schema validation failed',
                            raw: diag,
                        }),
                    ),
            };
        },
    };
}

export function rewriteFEL(expression: string, map: RewriteMap): string {
    return wasmRewriteFelForAssembly(
        expression,
        JSON.stringify({
            fragmentRootKey: map.fragmentRootKey,
            hostGroupKey: map.hostGroupKey,
            importedKeys: [...map.importedKeys],
            keyPrefix: map.keyPrefix,
        }),
    );
}

function collectExtensionNames(items: unknown[], names: Set<string>): void {
    for (const item of items as Array<Record<string, any>>) {
        for (const [name, enabled] of Object.entries(item?.extensions ?? {})) {
            if (enabled !== false) {
                names.add(name);
            }
        }
        if (Array.isArray(item?.children)) {
            collectExtensionNames(item.children, names);
        }
    }
}
