/** @filedesc The Assist tool catalog: names, titles, descriptions, input schemas, and WebMCP annotations. */

import type { ToolAnnotations, ToolDeclaration } from './types.js';

const READ_ONLY: ToolAnnotations = { readOnlyHint: true };
/** Relays sidecar content (References `content`, possibly fetched from third-party URIs) — flagged so agents spotlight it. */
const READ_ONLY_UNTRUSTED: ToolAnnotations = { readOnlyHint: true, untrustedContentHint: true };
/** Writes the respondent's form or profile — the browser/agent gates these behind its own confirmation. */
const CONSEQUENTIAL: ToolAnnotations = { consequentialHint: true };

// Model-facing text (Assist spec §3.2–3.6): titles are imperative; descriptions say what the tool does, when to
// use it, and what comes back in ≤ 500 chars; property descriptions ≤ 150 chars. tool-declarations.test.ts holds the caps.

const PATH_PROPERTY = { type: 'string', description: 'Field path, e.g. "organization.ein" or "items[0].amount".' };
const VALUE_PROPERTY = {
  description: 'New value. For choice fields pass the option value or its label. Dates as YYYY-MM-DD. Omit or pass null to clear.',
};
const OVERWRITE_PROPERTY = {
  type: 'boolean',
  description: 'Replace values the person already typed. Defaults to false: such fields are skipped with x-user-edited.',
};
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
      description:
        'Describe the active form: title, description, version, field and page counts, and whether it is complete. '
        + 'Call it first to orient before listing fields or setting values. '
        + 'Returns the form metadata and a status of complete or in-progress.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.field.list',
      title: 'List fields',
      description:
        'List the form\'s fields with path, label, data type, and required/relevant/readonly/filled/valid flags. '
        + 'Use it to find paths before describing or setting fields; filter to required, empty, invalid, or all fields. '
        + 'Returns one summary per field.',
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
      description:
        'Describe one field in full: current value, data type, options for choice fields, required/relevant/readonly flags, '
        + 'validation results, repeat metadata, and authoritative guidance (definition, examples, the rule behind it). '
        + 'Use it before setting a value you are unsure about. Returns the field state with its help.',
      inputSchema: { type: 'object', properties: { path: PATH_PROPERTY }, required: ['path'], additionalProperties: false },
      annotations: READ_ONLY_UNTRUSTED,
    },
    {
      name: 'formspec.field.help',
      title: 'Get field help',
      description:
        'Get authoritative guidance for one field: definition, examples, the rule behind it, and the concept it represents. '
        + 'Use it when a value\'s meaning or format is unclear, or when a validation message needs explaining. '
        + 'Returns titled entries with an excerpt and source link each; pass includeContent for the full text.',
      inputSchema: {
        type: 'object',
        properties: {
          path: PATH_PROPERTY,
          audience: {
            type: 'string',
            enum: ['human', 'agent', 'both'],
            description: 'Whose help entries to return. Defaults to "agent".',
          },
          includeContent: {
            type: 'boolean',
            description: 'Include each entry\'s full text, not just the excerpt. Defaults to false.',
          },
          maxBytes: {
            type: 'integer',
            minimum: 512,
            description: 'Byte cap on the references payload (min 512, default 4096). Lowest-priority entries drop first.',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
      annotations: READ_ONLY_UNTRUSTED,
    },
    {
      name: 'formspec.form.progress',
      title: 'Show form progress',
      description:
        'Show how far the form is: total, filled, required, and valid field counts, plus per-page counts when pages are known. '
        + 'Use it to report progress or decide where to go next. '
        + 'Returns the counts, a complete flag, and a pages array when page structure exists.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.field.set',
      title: 'Set field value',
      description:
        'Set one field\'s value and run the form\'s validation on it. Use it for a single write. '
        + 'Readonly and hidden fields are refused, and a value the person already typed is kept unless overwrite is true. '
        + 'Returns the stored value and the validation results the write produced.',
      inputSchema: {
        type: 'object',
        properties: { path: PATH_PROPERTY, value: VALUE_PROPERTY, overwrite: OVERWRITE_PROPERTY },
        required: ['path'],
        additionalProperties: false,
      },
      annotations: CONSEQUENTIAL,
    },
    {
      name: 'formspec.field.bulkSet',
      title: 'Set several field values',
      description:
        'Set several field values in one call; each entry succeeds or fails on its own. Use it to fill a page or a batch of related fields. '
        + 'Readonly and hidden fields are refused; values the person already typed are kept unless overwrite is true. '
        + 'Returns a result per entry and a summary of accepted, rejected, and skipped counts.',
      inputSchema: {
        type: 'object',
        properties: { entries: ENTRIES_SCHEMA, overwrite: OVERWRITE_PROPERTY },
        required: ['entries'],
        additionalProperties: false,
      },
      annotations: CONSEQUENTIAL,
    },
    {
      name: 'formspec.form.validate',
      title: 'Validate form',
      description:
        'Validate the whole form and report every problem with its field path, severity, and message. '
        + 'Use it before submitting, or after a batch of writes, to find what still needs attention. '
        + 'Returns a validation report; profile selects which rules run (default: live).',
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
      description:
        'Validate one field and report its problems. Use it after a write to check a single value without reading the whole form. '
        + 'Returns the field\'s validation results, empty when the value is acceptable.',
      inputSchema: { type: 'object', properties: { path: PATH_PROPERTY }, required: ['path'], additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.profile.match',
      title: 'Match saved profile',
      description:
        'Match the person\'s saved profile against this form, using each field\'s concept to find reusable values. '
        + 'Use it before profile.apply to see what can be filled. '
        + 'Returns one match per field with its confidence; the values themselves are written by profile.apply.',
      inputSchema: { type: 'object', properties: { profileRef: PROFILE_REF_PROPERTY }, additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.profile.apply',
      title: 'Apply saved profile values',
      description:
        'Apply the person\'s saved profile values to the fields profile.match found on this form. '
        + 'Pass paths to fill a subset, confirm to ask the person first, and overwrite to replace values they already typed. '
        + 'Returns the fields filled, the fields skipped with a reason, and the form\'s validation report.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string', description: 'Field path from profile.match.' },
            description: 'Field paths to fill, from profile.match. Defaults to every current match.',
          },
          confirm: { type: 'boolean', description: 'Ask the person to approve before writing.' },
          overwrite: OVERWRITE_PROPERTY,
        },
        additionalProperties: false,
      },
      annotations: CONSEQUENTIAL,
    },
    {
      name: 'formspec.profile.learn',
      title: 'Save values to profile',
      description:
        'Save the values currently on this form to the person\'s profile so other forms can reuse them. '
        + 'Use it after the person has completed and checked their answers. '
        + 'Returns how many values were saved by concept and by field key.',
      inputSchema: { type: 'object', properties: { profileRef: PROFILE_REF_PROPERTY }, additionalProperties: false },
      annotations: CONSEQUENTIAL,
    },
    {
      name: 'formspec.form.pages',
      title: 'Show page progress',
      description:
        'Show progress per page: field count, filled count, and whether the page is complete. '
        + 'Use it to summarize a multi-page form; form.progress already includes the same pages. '
        + 'Returns one entry per page, in order.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: READ_ONLY,
    },
    {
      name: 'formspec.form.nextIncomplete',
      title: 'Find next incomplete',
      description:
        'Find the next field, or the next page, that still needs attention and why: required, invalid, or empty. '
        + 'Use it to walk the person through the form in order. '
        + 'Returns the path and label, or the page id and title, with the reason; reason is complete when nothing is left.',
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
