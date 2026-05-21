import { FormEngine, initFormspecEngine, initFormspecEngineTools } from '@formspec-org/engine';
import type { ComponentDocument, ThemeDocument } from '@formspec-org/types';
import type {
  OntologyDocument,
  ReferencesDocument,
  StorageBackend,
  UserProfile,
} from '../src/types.js';

let initialized = false;

export async function ensureEngine(): Promise<void> {
  if (initialized) return;
  await initFormspecEngine();
  await initFormspecEngineTools();
  initialized = true;
}

export function makeDefinition() {
  return {
    $formspec: '1.0',
    url: 'https://example.org/forms/grant',
    version: '1.0.0',
    title: 'Grant Application',
    description: 'Funding request',
    formPresentation: {
      pageMode: 'wizard',
    },
    items: [
      {
        key: 'organization',
        type: 'group',
        label: 'Organization',
        children: [
          {
            key: 'name',
            type: 'field',
            dataType: 'string',
            label: 'Organization Name',
            required: true,
            semanticType: 'x-concept-org-name',
          },
          {
            key: 'ein',
            type: 'field',
            dataType: 'string',
            label: 'Employer Identification Number',
            required: true,
            semanticType: 'x-concept-org-ein',
          },
        ],
      },
      {
        key: 'contactEmail',
        type: 'field',
        dataType: 'string',
        label: 'Contact Email',
        required: true,
        presentation: { widgetHint: 'TextInput' },
      },
      {
        key: 'details',
        type: 'group',
        label: 'Project Details',
        children: [
          {
            key: 'summary',
            type: 'field',
            dataType: 'string',
            label: 'Project Summary',
            required: false,
          },
        ],
      },
      {
        key: 'budgetItems',
        type: 'group',
        label: 'Budget Items',
        repeatable: true,
        minRepeat: 1,
        maxRepeat: 5,
        children: [
          {
            key: 'description',
            type: 'field',
            dataType: 'string',
            label: 'Item Description',
            required: true,
          },
          {
            key: 'amount',
            type: 'field',
            dataType: 'number',
            label: 'Amount',
            required: true,
          },
        ],
      },
      {
        key: 'derivedScore',
        type: 'field',
        dataType: 'integer',
        label: 'Derived Score',
        readonly: true,
        calculate: "1",
      },
    ],
  } as const;
}

export function createEngine() {
  return new FormEngine(makeDefinition() as any);
}

export function makeReferences(): ReferencesDocument {
  return {
    $formspecReferences: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.org/forms/grant' },
    referenceDefs: {
      einGuide: {
        type: 'documentation',
        audience: 'both',
        title: 'EIN Instructions',
        content: 'Use the IRS-issued EIN.',
        priority: 'primary',
      },
    },
    references: [
      {
        target: '#',
        type: 'regulation',
        audience: 'both',
        title: 'Uniform Guidance',
        content: 'Federal grant rules apply.',
        priority: 'background',
      },
      {
        target: 'organization',
        type: 'context',
        audience: 'agent',
        title: 'Organization context',
        content: 'Use legal registered values.',
        priority: 'supplementary',
      },
      {
        target: 'organization.ein',
        $ref: '#/referenceDefs/einGuide',
      },
      {
        target: 'organization.ein',
        type: 'example',
        audience: 'human',
        title: 'Example EIN',
        content: '12-3456789',
      },
    ],
  };
}

export function makeOntology(): OntologyDocument {
  return {
    $formspecOntology: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.org/forms/grant' },
    concepts: {
      'organization.ein': {
        concept: 'https://www.irs.gov/terms/employer-identification-number',
        system: 'https://www.irs.gov/terms',
        display: 'Employer Identification Number',
        code: 'EIN',
        equivalents: [
          {
            system: 'https://schema.org',
            code: 'taxID',
            type: 'close',
          },
        ],
      },
    },
  };
}

export function makeTheme() : ThemeDocument {
  return {
    $formspecTheme: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.org/forms/grant' },
    pages: [
      {
        id: 'theme-contact',
        title: 'Theme Contact',
        regions: [
          { key: 'contactEmail' },
        ],
      },
      {
        id: 'theme-details',
        title: 'Theme Details',
        regions: [
          { key: 'details' },
        ],
      },
    ],
  };
}

export function makeComponent() : ComponentDocument {
  return {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.org/forms/grant' },
    tree: {
      component: 'Stack',
      children: [
        {
          component: 'Section',
          id: 'component-contact',
          title: 'Component Contact',
          children: [
            { component: 'TextInput', bind: 'contactEmail' },
          ],
        },
        {
          component: 'Section',
          id: 'component-org',
          title: 'Component Organization',
          children: [
            { component: 'TextInput', bind: 'organization.name' },
            { component: 'TextInput', bind: 'organization.ein' },
          ],
        },
        {
          component: 'Section',
          id: 'component-review',
          title: 'Review',
          children: [],
        },
      ],
    },
  } as unknown as ComponentDocument;
}

export function makeProfile(): UserProfile {
  const now = '2026-03-26T12:00:00.000Z';
  return {
    id: 'default',
    label: 'Default',
    created: now,
    updated: now,
    concepts: {
      'https://www.irs.gov/terms/employer-identification-number': {
        value: '12-3456789',
        confidence: 1,
        source: { type: 'manual', timestamp: now },
        lastUsed: now,
        verified: true,
      },
      'https://schema.org/name': {
        value: 'Acme Foundation',
        confidence: 1,
        source: { type: 'manual', timestamp: now },
        lastUsed: now,
        verified: true,
      },
    },
    fields: {
      contactEmail: {
        value: 'owner@example.org',
        confidence: 0.4,
        source: { type: 'manual', timestamp: now },
        lastUsed: now,
        verified: false,
      },
    },
  };
}

export class MemoryStorage implements StorageBackend {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}
