/** AUTO-GENERATED from common.schema.json SigningContentSource; run npm run schema:generate. */
export const SIGNING_CONTENT_SOURCE_PROPS_SCHEMA = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "ref",
    "version"
  ],
  "properties": {
    "ref": {
      "type": "string",
      "minLength": 1,
      "format": "uri"
    },
    "version": {
      "type": "string",
      "minLength": 1
    }
  },
  "description": "Exact authored content entry URI and content version. The URI is the pinned Definition URL followed by #/extensions/x-formspec-signing-content/entries/<simple identifier>."
} as const;
