/** @filedesc Formspec COSE_Sign1 compatibility shim over integrity-stack. */

export type { CoseSign1 } from '@integrity-stack/cose';
export {
  COSE_LABEL_ALG,
  COSE_LABEL_KID,
  COSE_LABEL_PROFILE_ID,
  COSE_LABEL_SUITE_ID,
  COSE_SIGN1_TAG,
  CoseError,
  FORMSPEC_PROFILE_ID,
  SUITE_ID_PHASE_1,
  WOS_PROFILE_ID,
  decodeFormspecCoseSign1 as decodeCoseSign1,
  encodeCoseSign1,
  extractFormspecProfileId as extractProfileId,
  protectedHeaderBytesForFormspec as protectedHeaderBytes,
  resolvePayload,
  sigStructureBytes,
} from '@integrity-stack/cose';
