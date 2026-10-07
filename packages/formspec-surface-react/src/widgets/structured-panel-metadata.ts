/** @filedesc Pure authored StructuredPanel configuration schemas; channels and native evidence remain separate. */
/** Reusable branch for authored Registry widgetShape.props; not native admission. */
export const STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'id', 'path', 'emptyMessage', 'unavailableMessage', 'x-generation'],
  properties: {
    type: { const: 'json' },
    id: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$' },
    path: { type: 'string', pattern: '^[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$' },
    title: { type: 'string', minLength: 1 },
    emptyMessage: { type: 'string', minLength: 1 },
    unavailableMessage: { type: 'string', minLength: 1 },
    'x-generation': { $ref: 'https://formspec.org/schemas/common/1.0#/$defs/Generation' },
  },
} as const;

const text = { type: 'string', minLength: 1 } as const;
const affix = { type: 'string' } as const;
const id = { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$' } as const;
const path = {
  type: 'string',
  pattern: '^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$',
} as const;
const selectorPath = { anyOf: [{ const: '' }, path] } as const;
const generation = { $ref: 'https://formspec.org/schemas/common/1.0#/$defs/Generation' } as const;
const generated = { 'x-generation': generation } as const;
const emphasis = { enum: ['primary', 'secondary', 'danger'] } as const;
const confirmation = {
  type: 'object', additionalProperties: false,
  required: ['heading', 'body', 'confirmLabel', 'cancelLabel'],
  properties: { heading: text, body: text, confirmLabel: text, cancelLabel: text, ...generated },
} as const;
const payload = {
  type: 'object', propertyNames: id,
  additionalProperties: {
    type: 'object', additionalProperties: false, required: ['path'],
    properties: { path: selectorPath },
  },
} as const;
const actionProperties = {
  outputName: text, emphasis, payload, pendingLabel: text,
  successMessage: text, failureMessage: text, confirmation, ...generated,
} as const;
const stateView = {
  type: 'object', additionalProperties: false,
  properties: {
    heading: text, body: text, ...generated,
    actions: { type: 'array', items: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['kind', 'label'],
        properties: { kind: { const: 'retry' }, label: text, emphasis, ...generated } },
      { type: 'object', additionalProperties: false, required: ['kind', 'outputName'],
        properties: { kind: { const: 'output' }, outputName: text, emphasis, ...generated } },
    ] } },
  },
} as const;
const blockProperties = { id, title: text, emptyMessage: text, ...generated } as const;

/**
 * Whole static panel configuration for Registry widgetShape.props. Named data
 * inputs and action outputs remain owner declarations outside this schema.
 * Need resolution, source admission and channel readiness remain separate checks.
 * The existing JSON branch keeps its stricter required copy and trace fields.
 */
export const STRUCTURED_PANEL_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    id, eyebrow: text, state: text, title: text, body: text, emptyMessage: text, ...generated,
    emptyWhen: {
      type: 'object', additionalProperties: false, required: ['inputName'],
      properties: { inputName: text, path: selectorPath },
    },
    stateViews: {
      type: 'object', additionalProperties: false,
      properties: { loading: stateView, empty: stateView, unavailable: stateView, error: stateView },
    },
    actions: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['outputName'],
      properties: { ...actionProperties, order: { type: 'number' } },
    } },
    blocks: { type: 'array', items: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['type', 'id', 'path'],
        properties: { ...blockProperties, type: { const: 'metric' }, path, label: text, prefix: affix, suffix: affix } },
      { type: 'object', additionalProperties: false, required: ['type', 'id', 'items'],
        properties: { ...blockProperties, type: { const: 'key-value' }, items: {
          type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['id', 'label'],
            properties: { id, label: text, path, routeParam: path, ...generated },
            oneOf: [{ required: ['path'] }, { required: ['routeParam'] }],
          },
        } } },
      { type: 'object', additionalProperties: false, required: ['type', 'id', 'path'],
        properties: { ...blockProperties, type: { const: 'list' }, path, itemPath: path, ordered: { type: 'boolean' } } },
      { type: 'object', additionalProperties: false, required: ['type', 'id', 'path', 'columns'],
        properties: { ...blockProperties, type: { const: 'table' }, path, caption: text,
          responsiveMode: { enum: ['stack', 'scroll'] },
          columns: { type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['id', 'label', 'path'],
            properties: { id, label: text, path, numeric: { type: 'boolean' }, ...generated },
          } },
          rowAction: { type: 'object', additionalProperties: false, required: ['outputName', 'columnLabel'],
            properties: { ...actionProperties, columnLabel: text } },
        } },
      { type: 'object', additionalProperties: false, required: ['type', 'id', 'path'],
        properties: { ...blockProperties, type: { const: 'progress' }, path, label: text,
          max: { type: 'number' }, maxPath: path, suffix: affix } },
      STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA,
    ] } },
  },
} as const;
