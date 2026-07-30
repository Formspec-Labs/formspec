import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBundleReasoningReview } from './reasoning-review.mjs';

const EXPERIENCE_REF = 'https://example.test/experience';
const SURFACE_REF = 'https://example.test/surface';
const ACTIONS_REF = 'https://example.test/actions';

function fixture(exactNeedRefs) {
  const bundle = {
    manifest: { id: 'https://example.test/app' },
    documents: {
      [EXPERIENCE_REF]: {
        $formspecExperience: '1.0',
        actors: [{ id: 'operator' }],
        tasks: [{ id: 'act' }],
        units: [
          {
            id: 'exact',
            actorRef: 'operator',
            taskRefs: ['act'],
            needRefs: exactNeedRefs,
            actionRefs: [{ id: 'open' }],
          },
          {
            id: 'unrelated',
            actorRef: 'operator',
            taskRefs: ['act'],
            needRefs: [{ id: 'operate' }],
          },
        ],
      },
      [SURFACE_REF]: {
        $formspecSurface: '0.2',
        routes: [{
          slots: [
            {
              slotType: 'experience-unit',
              binding: { experienceRef: EXPERIENCE_REF, unitRef: 'exact' },
            },
            {
              slotType: 'experience-unit',
              binding: {
                experienceRef: EXPERIENCE_REF,
                unitRef: 'unrelated',
              },
            },
          ],
        }],
      },
      [ACTIONS_REF]: {
        $formspecResponseActions: '1.0',
        actions: [{ id: 'open' }],
      },
    },
  };
  return {
    name: 'exact-relation',
    bundle,
    needs: {
      needs: [{ id: 'operate', revision: 1, status: 'adopted' }],
    },
    scenario: {},
    scenarioFile: 'scenario.json',
    graphInput: {
      manifest: { slot: 'manifest' },
      handles: [{ slot: 'actions', ref: { url: ACTIONS_REF } }],
    },
    nodes: [{
      source: { artifactSlot: 'actions' },
      kind: 'response-action',
      pointer: '/actions/0',
      label: 'open',
      anchors: [{
        raw: 'need:operate@1',
        needId: 'operate',
        revision: 1,
        pointer: '/actions/0/x-generation/anchors/0',
      }],
      invalidAnchors: [],
    }],
  };
}

test('an exact action relation cannot fall back to an unrelated citing unit', () => {
  const review = buildBundleReasoningReview(fixture([]));

  assert.equal(review.status, 'incomplete');
  assert.deepEqual(review.renderedPointers[0].traces[0].experiencePaths, []);
  assert.equal(
    review.gaps[0].code,
    'rendered_without_experience_path',
  );
});

test('an exact action relation selects only its citing mounted unit', () => {
  const review = buildBundleReasoningReview(
    fixture([{ id: 'operate' }]),
  );

  assert.equal(review.status, 'complete');
  assert.deepEqual(
    review.renderedPointers[0].traces[0].experiencePaths,
    [{
      documentRef: EXPERIENCE_REF,
      unitRef: 'exact',
      actorRef: 'operator',
      taskRefs: ['act'],
      relationReasons: ['needRef', 'actionRef'],
    }],
  );
});
