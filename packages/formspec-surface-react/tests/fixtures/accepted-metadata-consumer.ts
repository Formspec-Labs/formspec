/** @filedesc Consumer type checks for inherited accepted-review schema properties. */
import {
  ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA as presentation,
  ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA as state,
  ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA as data,
  RESPONSE_REVIEW_PRESENTATION_UNION_SCHEMA as presentations,
  RESPONSE_REVIEW_STATE_UNION_SCHEMA as states,
} from '@formspec-org/surface-react/widget-metadata';

const hashType: 'string' = presentation.properties.responseHash.type;
const definitionType: 'string' = presentation.properties.definitionUrl.type;
const versionType: 'string' = presentation.properties.definitionVersion.type;
const localeType: 'string' = presentation.properties.locale.type;
const fieldsType: 'object' = presentation.properties.fields.type;
const acceptedPhase: 'accepted-record' = presentation.properties.phase.const;
const handoffType: 'string' = presentation.properties.handoffId.type;
const status: 'pending' = state.properties.status.enum[0];
const contextType: 'string' = state.properties.contextIdentity.type;
const stateHashType: 'string' = state.properties.responseHash.type;
const stateLocaleType: 'string' = state.properties.locale.type;
const dataFieldType: 'object' = data.properties.presentation.properties.fields.type;
const unionFieldType: 'object' = presentations.oneOf[1].properties.fields.type;
const unionContextType: 'string' = states.oneOf[1].properties.contextIdentity.type;

// Accepted schemas expose display identity without signing actor or draft authority.
// @ts-expect-error accepted presentation excludes signing actor identity
presentation.properties.actorRef;
// @ts-expect-error accepted presentation excludes applicant draft identity
presentation.properties.draft;
// @ts-expect-error accepted state excludes signing actor identity
state.properties.actorRef;
// @ts-expect-error accepted state excludes applicant draft identity
state.properties.draft;

void [hashType, definitionType, versionType, localeType, fieldsType, acceptedPhase,
  handoffType, status, contextType, stateHashType, stateLocaleType, dataFieldType,
  unionFieldType, unionContextType];
