/** @filedesc Definition constructor helpers: option-set inlining and static FEL cycle detection. */

import type { FormVariable } from '@formspec-org/types';
import type { FormDefinition } from '@formspec-org/types';
import {
    wasmAnalyzeFEL,
    wasmGetFELDependencies,
    wasmResolveOptionSetsOnDefinition,
} from '../wasm-bridge-runtime.js';
import type { EngineBindConfig } from './helpers.js';
import {
    detectNamedCycle,
    parentPathOf,
    resolveRelativeDependency,
    toBasePath,
} from './helpers.js';

export function resolveOptionSetsOnDefinition(definition: FormDefinition): FormDefinition {
    return JSON.parse(
        wasmResolveOptionSetsOnDefinition(JSON.stringify(definition)),
    ) as FormDefinition;
}

export function validateVariableDefinitionCycles(variableDefs: FormVariable[]): void {
    const graph = new Map<string, Set<string>>();
    for (const variableDef of variableDefs) {
        const deps = new Set<string>();
        for (const name of wasmAnalyzeFEL(variableDef.expression).variables) {
            deps.add(name);
        }
        graph.set(variableDef.name, deps);
    }
    detectNamedCycle(graph, 'Circular variable dependency');
}

export function validateCalculateBindCycles(bindConfigs: Record<string, EngineBindConfig>): void {
    const graph = new Map<string, Set<string>>();
    for (const [path, bind] of Object.entries(bindConfigs)) {
        if (!bind.calculate) {
            continue;
        }
        const deps = new Set<string>();
        const parentPath = parentPathOf(path);
        for (const dep of wasmGetFELDependencies(bind.calculate)) {
            const resolved = resolveRelativeDependency(dep, parentPath, path);
            if (resolved) {
                deps.add(toBasePath(resolved));
            }
        }
        graph.set(path, deps);
    }
    detectNamedCycle(graph, 'Cyclic dependency detected');
}
