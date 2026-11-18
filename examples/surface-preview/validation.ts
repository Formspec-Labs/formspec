/** @filedesc Validate preview sidecars and source payloads with the published schemas. */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import scenarioSchema from '../../schemas/surface-scenario.schema.json';
import common from '../../schemas/common.schema.json';
import selection from '../../schemas/response-selection.schema.json';
import response from '../../schemas/response.schema.json';

const scenarios = new Ajv2020({ strict: true, allErrors: true });
addFormats(scenarios);
// The scenario references shared Response definitions, independent of its document root.
scenarios.addSchema([common, { $id: response.$id, $defs: response.$defs }, selection]);
const checkScenario = scenarios.compile(scenarioSchema);

const payloads = new Ajv2020({ strict: false, allErrors: true, addUsedSchema: false });
addFormats(payloads);

export const previewValidators = {
  validateSchema: (value: unknown) => checkScenario(value) ? { valid: true }
    : { valid: false, errors: [scenarios.errorsText(checkScenario.errors)] },
  validatePayload: ({ schema, value }: { schema: object; value: unknown }) => {
    const validate = payloads.compile(schema);
    return validate(value) ? { valid: true } : { valid: false, reason: payloads.errorsText(validate.errors) };
  },
};
