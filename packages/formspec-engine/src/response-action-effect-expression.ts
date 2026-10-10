/** @filedesc Tools-backed native adapter for Response Action effect expressions. */
import { RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS } from './precondition-catalog.js';
import { wasmEvalFELWithContextEnvelope } from './wasm-bridge-runtime.js';
import { wasmExtractDependencies } from './wasm-bridge-tools.js';

/**
 * Native FEL evaluation of fields and effect-time object bindings. Requires
 * initFormspecEngineTools(). Callable bindings (including @now()) are not yet
 * supported by this adapter; a host with a full binding catalog may supply its
 * own evaluateEffectExpression port.
 */
export function evaluateResponseActionEffectExpression(expression: string, context: {
    fields: Record<string, unknown>;
    bindings?: Record<string, unknown>;
    nowIso?: string;
}): unknown {
    const { contextRefs } = wasmExtractDependencies(expression);
    for (const reference of contextRefs) {
        // Native parser output is canonical: @name, followed by a call or tail.
        const name = reference.slice(1).split(/[.(]/, 1)[0];
        const binding = RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS.find(entry => entry.name === name);
        if (!binding) throw new Error('unregistered effect expression binding');
        if (binding.kind !== 'object' || reference.startsWith(`@${name}(`)) {
            throw new Error('callable effect expression bindings are unsupported by this adapter');
        }
        if (!Object.prototype.hasOwnProperty.call(context.bindings ?? {}, name)) {
            throw new Error('missing effect expression binding');
        }
    }
    const evaluated = wasmEvalFELWithContextEnvelope(expression, {
        fields: context.fields,
        variables: context.bindings,
        nowIso: context.nowIso,
    });
    if (evaluated.hasErrorDiagnostics) throw new Error('effect expression evaluation failed');
    return evaluated.value;
}

