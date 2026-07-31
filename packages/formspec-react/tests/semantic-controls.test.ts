/** @filedesc Generic semantic-control registry refusal and identity coverage. */

import { describe, expect, it, vi } from 'vitest';
import {
    createSemanticControlRegistry,
    type SemanticControlTarget,
} from '../src/semantic-controls';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

function itemTarget(
    overrides: Partial<SemanticControlTarget> = {},
): SemanticControlTarget {
    return {
        renderInstanceId: 'render-1',
        control: {
            artifactRef: 'https://example.test/definitions/intake',
            artifactDigest: DIGEST_A,
            subjectKind: 'definition-item',
            subjectRef: 'contact.email',
        },
        ...overrides,
    };
}

describe('semantic control registry', () => {
    it('resolves only one exact qualified mounted control', () => {
        const registry = createSemanticControlRegistry();
        const setItem = vi.fn(() => ({
            responseId: 'response-1',
            responseRevision: 3,
        }));
        registry.register({
            capability: 'set-item',
            ...itemTarget(),
            responseId: 'response-1',
            disabled: () => false,
            setItem,
        });

        expect(registry.setItem(itemTarget(), 'person@example.test')).toEqual({
            status: 'set',
            target: itemTarget(),
            responseBinding: {
                responseId: 'response-1',
                responseRevision: 3,
            },
        });
        expect(setItem).toHaveBeenCalledWith('person@example.test');
    });

    it('refuses unresolved, ambiguous, disabled, stale, and unmounted controls', () => {
        const registry = createSemanticControlRegistry();
        const target = itemTarget();
        expect(registry.setItem(target, 'value')).toMatchObject({
            status: 'refused',
            reason: 'unresolved',
        });

        let disabled = true;
        const registration = {
            capability: 'set-item' as const,
            ...target,
            responseId: 'response-1',
            disabled: () => disabled,
            setItem: () => ({ responseId: 'response-1', responseRevision: 1 }),
        };
        const unmountFirst = registry.register(registration);
        expect(registry.setItem(target, 'value')).toMatchObject({
            status: 'refused',
            reason: 'disabled',
        });

        disabled = false;
        const unmountSecond = registry.register(registration);
        expect(registry.setItem(target, 'value')).toMatchObject({
            status: 'refused',
            reason: 'ambiguous',
        });
        unmountSecond();

        const staleDigest = itemTarget({
            control: { ...target.control, artifactDigest: DIGEST_B },
        });
        expect(registry.setItem(staleDigest, 'value')).toMatchObject({
            status: 'refused',
            reason: 'stale',
        });
        const staleRender = itemTarget({ renderInstanceId: 'render-older' });
        expect(registry.setItem(staleRender, 'value')).toMatchObject({
            status: 'refused',
            reason: 'stale',
        });

        unmountFirst();
        expect(registry.setItem(target, 'value')).toMatchObject({
            status: 'refused',
            reason: 'unmounted',
        });
    });

    it('requires item edits to advance one continuous Response revision', () => {
        const registry = createSemanticControlRegistry();
        const target = itemTarget();
        registry.register({
            capability: 'set-item',
            ...target,
            responseId: 'response-1',
            disabled: () => false,
            setItem: () => ({ responseId: 'response-1', responseRevision: 1 }),
        });

        expect(registry.setItem(target, 'first')).toMatchObject({ status: 'set' });
        expect(registry.setItem(target, 'second')).toMatchObject({
            status: 'refused',
            reason: 'response-mismatch',
            message: expect.stringContaining('non-monotonic'),
        });
    });

    it('releases Response revision custody after its final mounted control unmounts', () => {
        const registry = createSemanticControlRegistry();
        const target = itemTarget();
        const firstOwner = registry.register({
            capability: 'set-item',
            ...target,
            responseId: 'response-reused',
            disabled: () => false,
            setItem: () => ({
                responseId: 'response-reused',
                responseRevision: 3,
            }),
        });

        expect(registry.setItem(target, 'first generation')).toMatchObject({
            status: 'set',
            responseBinding: { responseRevision: 3 },
        });
        firstOwner();

        const secondOwner = registry.register({
            capability: 'set-item',
            ...target,
            responseId: 'response-reused',
            disabled: () => false,
            setItem: () => ({
                responseId: 'response-reused',
                responseRevision: 1,
            }),
        });
        expect(registry.setItem(target, 'fresh generation')).toMatchObject({
            status: 'set',
            responseBinding: { responseRevision: 1 },
        });

        expect(registry.setItem(target, 'same live generation')).toMatchObject({
            status: 'refused',
            reason: 'response-mismatch',
            message: expect.stringContaining('non-monotonic'),
        });
        secondOwner();
    });

    it('propagates deterministic invocation identity and owner-produced facts', async () => {
        const registry = createSemanticControlRegistry();
        const actionTarget: SemanticControlTarget = {
            renderInstanceId: 'render-community-room',
            control: {
                artifactRef: 'https://community.example/actions/schedule',
                artifactDigest: DIGEST_A,
                subjectKind: 'response-action',
                subjectRef: 'publish-schedule',
            },
        };
        const responseTarget = itemTarget({
            renderInstanceId: actionTarget.renderInstanceId,
        });
        registry.register({
            capability: 'set-item',
            ...responseTarget,
            responseId: 'schedule-response',
            disabled: () => false,
            setItem: () => ({
                responseId: 'schedule-response',
                responseRevision: 7,
            }),
        });
        expect(registry.setItem(responseTarget, 'ready')).toMatchObject({
            status: 'set',
        });
        const activate = vi.fn((context) => ({
            responseBinding: {
                responseId: 'schedule-response',
                responseRevision: 7,
            },
            invocation: {
                status: 'completed' as const,
                invocationId: context.invocationId,
                actionOwner: {
                    ...context.actionArtifact,
                    subjectKind: 'response-action' as const,
                    subjectRef: 'publish-schedule',
                },
                resolution: {
                    resolved: true,
                    action: { id: 'publish-schedule' },
                },
                validationTuple: {
                    profile: 'on-submit',
                    blocking: 'block-on-error',
                    persistence: 'complete-response',
                },
                detail: {
                    response: { id: 'schedule-response' },
                    validationReport: { valid: true },
                },
                effectTrace: [],
            },
        }));
        registry.register({
            capability: 'activate-control',
            ...actionTarget,
            responseId: 'schedule-response',
            disabled: () => false,
            activate,
        });

        const result = await registry.activateControl(actionTarget, {
            invocationId: 'case/run/activate-schedule',
            responseBinding: {
                responseId: 'schedule-response',
                responseRevision: 7,
            },
        });

        expect(result).toMatchObject({
            status: 'activated',
            invocationId: 'case/run/activate-schedule',
            actionOwner: actionTarget.control,
            responseBinding: {
                responseId: 'schedule-response',
                responseRevision: 7,
            },
        });
        expect(activate).toHaveBeenCalledWith({
            invocationId: 'case/run/activate-schedule',
            actionArtifact: {
                artifactRef: actionTarget.control.artifactRef,
                artifactDigest: actionTarget.control.artifactDigest,
            },
        });
    });

    it('refuses an activation whose owner returns a different Response', async () => {
        const registry = createSemanticControlRegistry();
        const actionTarget: SemanticControlTarget = {
            renderInstanceId: 'render-1',
            control: {
                artifactRef: 'https://example.test/actions/intake',
                artifactDigest: DIGEST_A,
                subjectKind: 'response-action',
                subjectRef: 'submit',
            },
        };
        const responseTarget = itemTarget();
        registry.register({
            capability: 'set-item',
            ...responseTarget,
            responseId: 'response-expected',
            disabled: () => false,
            setItem: () => ({
                responseId: 'response-expected',
                responseRevision: 2,
            }),
        });
        expect(registry.setItem(responseTarget, 'ready')).toMatchObject({
            status: 'set',
        });
        registry.register({
            capability: 'activate-control',
            ...actionTarget,
            responseId: 'response-expected',
            disabled: () => false,
            activate: (context) => ({
                responseBinding: { responseId: 'response-expected', responseRevision: 2 },
                invocation: {
                    status: 'completed',
                    invocationId: context.invocationId,
                    actionOwner: {
                        ...context.actionArtifact!,
                        subjectKind: 'response-action',
                        subjectRef: 'submit',
                    },
                    resolution: { resolved: true, action: { id: 'submit' } as never },
                    validationTuple: null,
                    detail: { response: { id: 'response-other' } },
                    effectTrace: [],
                },
            }),
        });

        await expect(
            registry.activateControl(actionTarget, {
                invocationId: 'inv-1',
                responseBinding: {
                    responseId: 'response-expected',
                    responseRevision: 2,
                },
            }),
        ).resolves.toMatchObject({
            status: 'refused',
            reason: 'response-mismatch',
        });
    });
});
