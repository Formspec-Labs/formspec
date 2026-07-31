/** @filedesc Exact, renderer-owned semantic control lookup and activation. */

import type {
    ResponseActionInvocationContext,
    ResponseActionInvocationResult,
} from '@formspec-org/engine';

export type SemanticControlSubjectKind = 'definition-item' | 'response-action';

/**
 * Portable owner identity. This deliberately contains no DOM selector,
 * generated layout-node id, visible label, or projection metadata.
 */
export interface QualifiedSemanticSubjectRef {
    artifactRef: string;
    artifactDigest: string;
    subjectKind: SemanticControlSubjectKind;
    subjectRef: string;
}

export interface SemanticArtifactIdentity {
    artifactRef: string;
    artifactDigest: string;
}

export interface SemanticResponseBinding {
    responseId: string;
    responseRevision: number;
}

export interface SemanticControlTarget {
    renderInstanceId: string;
    control: QualifiedSemanticSubjectRef;
}

/**
 * Host-paired runtime identity for one mounted Definition renderer.
 * Artifact digests and Response identity are required: omission means the
 * renderer simply does not publish semantic controls.
 */
export interface SemanticControlScope {
    registry: SemanticControlRegistry;
    renderInstanceId: string;
    definitionArtifact: SemanticArtifactIdentity;
    responseActionsArtifact?: SemanticArtifactIdentity;
    responseId: string;
    initialResponseRevision?: number;
}

export type SemanticControlRefusalReason =
    | 'unresolved'
    | 'ambiguous'
    | 'stale'
    | 'unmounted'
    | 'disabled'
    | 'unsupported'
    | 'operation-failed'
    | 'invocation-mismatch'
    | 'owner-mismatch'
    | 'response-mismatch';

export interface SemanticControlRefusal {
    status: 'refused';
    reason: SemanticControlRefusalReason;
    target: SemanticControlTarget;
    message: string;
}

export interface SemanticSetItemSuccess {
    status: 'set';
    target: SemanticControlTarget;
    responseBinding: SemanticResponseBinding;
}

export type SemanticSetItemResult =
    | SemanticSetItemSuccess
    | SemanticControlRefusal;

export interface SemanticControlActivation<
    TDetail = unknown,
> {
    invocation: ResponseActionInvocationResult<TDetail>;
    responseBinding: SemanticResponseBinding;
}

export interface SemanticActivateControlContext
    extends ResponseActionInvocationContext {
    invocationId: string;
    /** Exact prior set-item binding named by the activation step. */
    responseBinding: SemanticResponseBinding;
}

export interface SemanticActivateControlSuccess<
    TDetail = unknown,
> {
    status: 'activated';
    target: SemanticControlTarget;
    invocationId: string;
    actionOwner: QualifiedSemanticSubjectRef & {
        subjectKind: 'response-action';
    };
    responseBinding: SemanticResponseBinding;
    invocation: ResponseActionInvocationResult<TDetail>;
}

export type SemanticActivateControlResult<
    TDetail = unknown,
> =
    | SemanticActivateControlSuccess<TDetail>
    | SemanticControlRefusal;

interface SemanticControlRegistrationBase {
    renderInstanceId: string;
    /** Exact owner Response for this mounted control instance. */
    responseId: string;
    control: QualifiedSemanticSubjectRef;
    disabled: () => boolean;
}

export interface SemanticSetItemControlRegistration
    extends SemanticControlRegistrationBase {
    capability: 'set-item';
    setItem: (value: unknown) => SemanticResponseBinding;
}

export interface SemanticActivateControlRegistration<
    TDetail = unknown,
> extends SemanticControlRegistrationBase {
    capability: 'activate-control';
    activate: (
        context: ResponseActionInvocationContext,
    ) =>
        | SemanticControlActivation<TDetail>
        | Promise<SemanticControlActivation<TDetail>>;
}

export type SemanticControlRegistration =
    | SemanticSetItemControlRegistration
    | SemanticActivateControlRegistration;

export interface SemanticControlRegistry {
    /**
     * Registers one mounted control. The returned cleanup is idempotent and
     * must run on unmount.
     */
    register(registration: SemanticControlRegistration): () => void;
    setItem(target: SemanticControlTarget, value: unknown): SemanticSetItemResult;
    activateControl<TDetail = unknown>(
        target: SemanticControlTarget,
        context: SemanticActivateControlContext,
    ): Promise<SemanticActivateControlResult<TDetail>>;
}

type StoredRegistration = SemanticControlRegistration & {
    registrationId: number;
};

function nonEmpty(value: string): boolean {
    return value.trim() === value && value.length > 0;
}

function assertRegistrationValid(registration: SemanticControlRegistration): void {
    const { control, renderInstanceId, responseId } = registration;
    if (
        !nonEmpty(renderInstanceId)
        || !nonEmpty(responseId)
        || !nonEmpty(control.artifactRef)
        || !nonEmpty(control.artifactDigest)
        || !nonEmpty(control.subjectRef)
    ) {
        throw new TypeError('semantic control identity fields must be non-empty');
    }
    if (
        registration.capability === 'set-item'
        && control.subjectKind !== 'definition-item'
    ) {
        throw new TypeError('set-item controls must identify a definition-item');
    }
    if (
        registration.capability === 'activate-control'
        && control.subjectKind !== 'response-action'
    ) {
        throw new TypeError('activate-control controls must identify a response-action');
    }
}

function exactKey(target: SemanticControlTarget): string {
    const { control } = target;
    return JSON.stringify([
        target.renderInstanceId,
        control.artifactRef,
        control.artifactDigest,
        control.subjectKind,
        control.subjectRef,
    ]);
}

function renderSubjectKey(target: SemanticControlTarget): string {
    const { control } = target;
    return JSON.stringify([
        target.renderInstanceId,
        control.artifactRef,
        control.subjectKind,
        control.subjectRef,
    ]);
}

function subjectKey(target: SemanticControlTarget): string {
    const { control } = target;
    return JSON.stringify([
        control.artifactRef,
        control.subjectKind,
        control.subjectRef,
    ]);
}

function targetFor(registration: SemanticControlRegistration): SemanticControlTarget {
    return {
        renderInstanceId: registration.renderInstanceId,
        control: registration.control,
    };
}

function refusal(
    target: SemanticControlTarget,
    reason: SemanticControlRefusalReason,
    message: string,
): SemanticControlRefusal {
    return { status: 'refused', target, reason, message };
}

function controlEquals(
    left: QualifiedSemanticSubjectRef,
    right: QualifiedSemanticSubjectRef,
): boolean {
    return left.artifactRef === right.artifactRef
        && left.artifactDigest === right.artifactDigest
        && left.subjectKind === right.subjectKind
        && left.subjectRef === right.subjectRef;
}

function responseBindingProblem(
    binding: SemanticResponseBinding,
): string | undefined {
    if (!nonEmpty(binding.responseId)) {
        return 'the owner returned an empty Response identity';
    }
    if (
        !Number.isInteger(binding.responseRevision)
        || binding.responseRevision < 0
    ) {
        return 'the owner returned an invalid Response revision';
    }
    return undefined;
}

/**
 * Creates one aggregation domain. A Surface normally supplies one registry to
 * every mounted route/slot renderer, so exact lookup works across generic
 * Definition forms without querying the DOM.
 */
export function createSemanticControlRegistry(): SemanticControlRegistry {
    let registrationSequence = 0;
    const active = new Map<string, StoredRegistration[]>();
    const exactHistory = new Set<string>();
    const subjectHistory = new Set<string>();
    const latestResponseRevision = new Map<string, number>();

    const recordResponseBinding = (
        target: SemanticControlTarget,
        binding: SemanticResponseBinding,
        operation: 'set-item' | 'activate-control',
    ): SemanticControlRefusal | undefined => {
        const problem = responseBindingProblem(binding);
        if (problem) return refusal(target, 'response-mismatch', problem);
        const previousRevision = latestResponseRevision.get(binding.responseId);
        if (previousRevision !== undefined) {
            const revisionWentBack = binding.responseRevision < previousRevision;
            const setDidNotAdvance =
                operation === 'set-item'
                && binding.responseRevision === previousRevision;
            if (revisionWentBack || setDidNotAdvance) {
                return refusal(
                    target,
                    'response-mismatch',
                    'the owner returned a non-monotonic Response revision',
                );
            }
        }
        latestResponseRevision.set(binding.responseId, binding.responseRevision);
        return undefined;
    };

    const resolve = (
        target: SemanticControlTarget,
        capability: SemanticControlRegistration['capability'],
    ): StoredRegistration | SemanticControlRefusal => {
        const exact = active.get(exactKey(target)) ?? [];
        if (exact.length > 1) {
            return refusal(
                target,
                'ambiguous',
                'more than one mounted control has the exact qualified identity',
            );
        }
        if (exact.length === 1) {
            const registration = exact[0]!;
            if (registration.capability !== capability) {
                return refusal(
                    target,
                    'unsupported',
                    `the exact control does not support ${capability}`,
                );
            }
            if (registration.disabled()) {
                return refusal(target, 'disabled', 'the exact rendered control is disabled');
            }
            return registration;
        }

        const mounted = [...active.values()].flat();
        const sameRenderSubject = mounted.some(
            (registration) =>
                renderSubjectKey(targetFor(registration)) === renderSubjectKey(target),
        );
        const sameSubject = mounted.some(
            (registration) => subjectKey(targetFor(registration)) === subjectKey(target),
        );
        if (sameRenderSubject || sameSubject) {
            return refusal(
                target,
                'stale',
                'the subject exists under a different digest or render instance',
            );
        }
        if (exactHistory.has(exactKey(target))) {
            return refusal(target, 'unmounted', 'the exact rendered control is no longer mounted');
        }
        if (subjectHistory.has(subjectKey(target))) {
            return refusal(
                target,
                'stale',
                'the subject was previously rendered under a different qualified identity',
            );
        }
        return refusal(target, 'unresolved', 'no rendered control has the qualified identity');
    };

    return {
        register(registration) {
            assertRegistrationValid(registration);
            registrationSequence += 1;
            const stored: StoredRegistration = {
                ...registration,
                control: Object.freeze({ ...registration.control }),
                registrationId: registrationSequence,
            };
            const target = targetFor(stored);
            const key = exactKey(target);
            const responseId = stored.responseId;
            exactHistory.add(key);
            subjectHistory.add(subjectKey(target));
            active.set(key, [...(active.get(key) ?? []), stored]);
            let mounted = true;
            return () => {
                if (!mounted) return;
                mounted = false;
                const remaining = (active.get(key) ?? []).filter(
                    (candidate) => candidate.registrationId !== stored.registrationId,
                );
                if (remaining.length > 0) active.set(key, remaining);
                else active.delete(key);
                const responseStillMounted = [...active.values()].some(
                    (registrations) => registrations.some(
                        (candidate) => candidate.responseId === responseId,
                    ),
                );
                if (!responseStillMounted) {
                    latestResponseRevision.delete(responseId);
                }
            };
        },

        setItem(target, value) {
            const registration = resolve(target, 'set-item');
            if ('status' in registration) return registration;
            if (registration.capability !== 'set-item') {
                return refusal(target, 'unsupported', 'the exact control cannot set an item');
            }
            try {
                const responseBinding = registration.setItem(value);
                if (responseBinding.responseId !== registration.responseId) {
                    return refusal(
                        target,
                        'response-mismatch',
                        'the control returned a different owner Response identity',
                    );
                }
                const bindingRefusal = recordResponseBinding(
                    target,
                    responseBinding,
                    'set-item',
                );
                if (bindingRefusal) return bindingRefusal;
                return { status: 'set', target, responseBinding };
            } catch (error) {
                return refusal(
                    target,
                    'operation-failed',
                    error instanceof Error ? error.message : String(error),
                );
            }
        },

        async activateControl<TDetail>(
            target: SemanticControlTarget,
            context: SemanticActivateControlContext,
        ): Promise<SemanticActivateControlResult<TDetail>> {
            const registration = resolve(target, 'activate-control');
            if ('status' in registration) return registration;
            if (registration.capability !== 'activate-control') {
                return refusal(target, 'unsupported', 'the exact control cannot activate an Action');
            }
            let activation: SemanticControlActivation<TDetail>;
            const expectedBindingProblem = responseBindingProblem(context.responseBinding);
            const currentRevision = latestResponseRevision.get(
                context.responseBinding.responseId,
            );
            if (
                expectedBindingProblem
                || currentRevision === undefined
                || currentRevision !== context.responseBinding.responseRevision
            ) {
                return refusal(
                    target,
                    'response-mismatch',
                    expectedBindingProblem
                        ?? 'the activation does not name the current set-item Response revision',
                );
            }
            try {
                const {
                    responseBinding: _expectedResponseBinding,
                    ...invocationContext
                } = context;
                activation = await registration.activate({
                    ...invocationContext,
                    actionArtifact: {
                        artifactRef: target.control.artifactRef,
                        artifactDigest: target.control.artifactDigest,
                    },
                }) as SemanticControlActivation<TDetail>;
            } catch (error) {
                return refusal(
                    target,
                    'operation-failed',
                    error instanceof Error ? error.message : String(error),
                );
            }

            const { invocation, responseBinding } = activation;
            if (invocation.invocationId !== context.invocationId) {
                return refusal(
                    target,
                    'invocation-mismatch',
                    'the renderer returned a different or missing invocation identity',
                );
            }
            if (
                !invocation.actionOwner
                || !controlEquals(invocation.actionOwner, target.control)
            ) {
                return refusal(
                    target,
                    'owner-mismatch',
                    'the invocation did not return the exact registered Action owner',
                );
            }
            const response = invocation.detail && typeof invocation.detail === 'object'
                ? (invocation.detail as { response?: { id?: unknown } }).response
                : undefined;
            if (response?.id !== responseBinding.responseId) {
                return refusal(
                    target,
                    'response-mismatch',
                    'the invoked Action returned a different or missing Response identity',
                );
            }
            if (
                responseBinding.responseId !== registration.responseId
                ||
                responseBinding.responseId !== context.responseBinding.responseId
                || responseBinding.responseRevision < context.responseBinding.responseRevision
            ) {
                return refusal(
                    target,
                    'response-mismatch',
                    'the invoked Action did not continue the expected Response revision',
                );
            }
            const bindingRefusal = recordResponseBinding(
                target,
                responseBinding,
                'activate-control',
            );
            if (bindingRefusal) return bindingRefusal;
            return {
                status: 'activated',
                target,
                invocationId: context.invocationId,
                actionOwner: invocation.actionOwner,
                responseBinding,
                invocation,
            };
        },
    };
}
