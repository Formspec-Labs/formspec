/** @filedesc The React-free starter contract table is the one starterWidgetModule publishes. */
import { describe, expect, it } from 'vitest';
import * as metadata from '../src/widget-metadata.js';
import { starterWidgetModule } from '../src/widgets/index.js';

describe('starter widget contract metadata', () => {
  it('publishes every supported Registry entry version', () => {
    expect(metadata.STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS).toEqual(['0.1.0', '0.1.1', '0.1.2']);
    expect(metadata.ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS).toEqual(['0.1.0', '0.1.1']);
  });

  it('is the table starterWidgetModule delivers, for every supported version pair', () => {
    for (const structuredPanelRegistryEntryVersion of metadata.STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS) {
      for (const acceptedResponseReviewRegistryEntryVersion of metadata.ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS) {
        const options = { structuredPanelRegistryEntryVersion, acceptedResponseReviewRegistryEntryVersion };
        const contracts = metadata.starterWidgetContracts(options);
        expect(starterWidgetModule('x-any', options).contracts).toEqual(contracts);
        expect(contracts.StructuredPanel?.registryEntryVersion).toBe(structuredPanelRegistryEntryVersion);
        expect(contracts.AcceptedResponseReview?.registryEntryVersion).toBe(acceptedResponseReviewRegistryEntryVersion);
      }
    }
  });

  it('refuses versions it does not ship', () => {
    // @ts-expect-error Deliberately exercise the JavaScript admission boundary.
    expect(() => metadata.starterWidgetContracts({ structuredPanelRegistryEntryVersion: '0.1.3' }))
      .toThrow(/Unsupported StructuredPanel Registry entry version/);
  });
});
