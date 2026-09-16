/** @filedesc The Assist tool catalog: names, titles, descriptions, input schemas, and WebMCP annotations. */

import type { ToolAnnotations, ToolDeclaration } from './types.js';

const READ_ONLY: ToolAnnotations = { readOnlyHint: true };
/** Relays sidecar content (References `content`, possibly fetched from third-party URIs) — flagged so agents spotlight it. */
const READ_ONLY_UNTRUSTED: ToolAnnotations = { readOnlyHint: true, untrustedContentHint: true };
/** Writes the respondent's form or profile — the browser/agent gates these behind its own confirmation. */
const CONSEQUENTIAL: ToolAnnotations = { consequentialHint: true };

const PATH_PROPERTY = { type: 'string', description: 'Field path, e.g. "organization.ein" or "items[0].amount".' };
const VALUE_PROPERTY = { description: 'New value. Omit or pass null to clear the field.' };
const ENTRIES_SCHEMA = {
  type: 'array',
  description: 'Field writes; each entry is applied independently.',
  items: {
    type: 'object',
    properties: { path: PATH_PROPERTY, value: VALUE_PROPERTY },
    required: ['path'],
    additionalProperties: false,
  },
};
const PROFILE_REF_PROPERTY = { type: 'string', description: 'Profile id. Defaults to the active profile.' };

export function buildToolDeclarations(): ToolDeclaration[] {
  return [
    {
      name: 'formspec.form.describe',
      title: 'Describe form',
      description: 'Title, description, version, field and page counts, and completion status of the active form.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.field.list',
      title: 'List fields',
      description: 'List fields with label, data type, and required/relevant/readonly/filled/valid flags.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['all', 'required', 'empty', 'invalid', 'relevant'],
            description: 'Which fields to include. Defaults to "relevant" (currently shown fields).',
          },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.field.describe',
      title: 'Describe field',
      description: 'Live state of one field: value, options, validation, repeat metadata, and resolved help.',
      inputSchema: { type: 'object', properties: { path: PATH_PROPERTY }, required: ['path'], additionalProperties: false },
      annotations: READ_ONLY_UNTRUSTED,
    },
    {
      name: 'formspec.field.help',
      title: 'Field help',
      description: 'Contextual help for one field from References and Ontology sidecars: documentation, examples, regulations, concept identity.',
      inputSchema: {
        type: 'object',
        properties: {
          path: PATH_PROPERTY,
          audience: {
            type: 'string',
            enum: ['human', 'agent', 'both'],
            description: 'Whose help entries to return. Defaults to "agent".',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
      annotations: READ_ONLY_UNTRUSTED,
    },
    {
      name: 'formspec.form.progress',
      title: 'Form progress',
      description: 'Filled, valid, and required counts across the form, plus per-page progress when pages are known.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.field.set',
      title: 'Set field value',
      description: 'Write one field value. Rejects readonly and non-relevant fields; returns the validation results the write triggered.',
      inputSchema: {
        type: 'object',
        properties: { path: PATH_PROPERTY, value: VALUE_PROPERTY },
        required: ['path'],
        additionalProperties: false,
      },
      annotations: CONSEQUENTIAL,
    },
    {
      name: 'formspec.field.bulkSet',
      title: 'Set multiple field values',
      description: 'Write several field values in one call. Entries succeed or fail independently.',
      inputSchema: {
        type: 'object',
        properties: { entries: ENTRIES_SCHEMA },
        required: ['entries'],
        additionalProperties: false,
      },
      annotations: CONSEQUENTIAL,
    },
    {
      name: 'formspec.form.validate',
      title: 'Validate form',
      description: 'Full validation report for the form.',
      inputSchema: {
        type: 'object',
        properties: {
          profile: {
            type: 'string',
            enum: ['live', 'on-submit', 'on-demand', 'off'],
            description: 'Validation profile to evaluate under. Defaults to "live".',
          },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.field.validate',
      title: 'Validate field',
      description: 'Validation results for one field.',
      inputSchema: { type: 'object', properties: { path: PATH_PROPERTY }, required: ['path'], additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.profile.match',
      title: 'Match profile',
      description: 'Suggest values from the user profile for writable fields, matched by ontology concept identity with a confidence score.',
      inputSchema: { type: 'object', properties: { profileRef: PROFILE_REF_PROPERTY }, additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.profile.apply',
      title: 'Apply profile values',
      description: 'Write suggested profile values to the form. Pass confirm: true to require the user to approve first.',
      inputSchema: {
        type: 'object',
        properties: {
          matches: ENTRIES_SCHEMA,
          confirm: { type: 'boolean', description: 'Require explicit user confirmation before writing.' },
        },
        required: ['matches'],
        additionalProperties: false,
      },
      annotations: CONSEQUENTIAL,
    },
    {
      name: 'formspec.profile.learn',
      title: 'Save values to profile',
      description: 'Save the current form values to the user profile for reuse on other forms, keyed by ontology concept.',
      inputSchema: { type: 'object', properties: { profileRef: PROFILE_REF_PROPERTY }, additionalProperties: false },
      annotations: CONSEQUENTIAL,
    },
    {
      name: 'formspec.form.pages',
      title: 'Page progress',
      description: 'Per-page field and filled counts and completion.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.form.nextIncomplete',
      title: 'Next incomplete',
      description: 'The next field or page that still needs attention, with the reason (required, invalid, or empty).',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['field', 'page'], description: 'Return the next field (default) or the next page.' },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
    },
  ];
}

