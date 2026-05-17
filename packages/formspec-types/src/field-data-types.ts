/**
 * @filedesc Canonical core field dataType values from definition.schema.json.
 */

/** Core built-in field data types (definition.schema.json Field.dataType enum). */
export const CORE_FIELD_DATA_TYPES = [
  'string',
  'text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'dateTime',
  'time',
  'uri',
  'attachment',
  'choice',
  'multiChoice',
  'money',
] as const;

export type CoreFieldDataType = (typeof CORE_FIELD_DATA_TYPES)[number];
