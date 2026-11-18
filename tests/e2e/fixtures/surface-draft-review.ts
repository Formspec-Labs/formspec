/** @filedesc Widget copy and Registry entries for the synthetic draft-review route. */
import { RESPONSE_REVIEW_COPY_KEYS, RESPONSE_REVIEW_WIDGET_SHAPE } from '../../../packages/formspec-surface-react/src/widget-metadata';

export const reviewModule = 'x-draft-review-fixture';

export const reviewRegistry = {
  $formspecRegistry: '1.1', publisher: { name: 'Test', url: 'https://example.test' }, published: '2026-01-01T00:00:00Z',
  entries: [
    { name: reviewModule, category: 'module', version: '1.0.0', status: 'stable', contributes: ['x-review-widget'] },
    { name: 'x-review-widget', category: 'widget', version: '0.1.0', status: 'stable', widgetShape: RESPONSE_REVIEW_WIDGET_SHAPE },
  ],
};

export const reviewSlot = {
  id: 'review', slotType: 'module-widget', binding: {
    moduleId: reviewModule, widgetName: 'ResponseReview',
    config: { copy: { en: {
      ...Object.fromEntries(RESPONSE_REVIEW_COPY_KEYS.map(key => [key, key])),
      heading: 'Review your saved answers', unavailable: 'Review unavailable',
    } } },
    draftReview: { routeRef: 'form', slotRef: 'form' },
  },
};
