/** @filedesc Supply all ResponseReview inputs from one authorized committed draft. */
import { createFormEngine, initFormspecEngine, type FormDraftSnapshot } from '@formspec-org/engine';
import {
  canonicalFiniteJson, captureResponseFieldMetadata, snapshotFiniteJson, surfaceDiagnostic,
  type DraftReviewPlan, type SurfaceDiagnosticSite, type WidgetDataDelivery,
} from '@formspec-org/surface';
import { targetDefinitionMatches, type LocaleDocument } from '@formspec-org/types';
import type { DraftSession } from './draft-session.js';
import { qualifyDraftReview } from './internal/draft-review-qualification.js';
import type { DraftResponseReviewData } from './widgets/response-review-metadata.js';

type DraftReviewFailure = Extract<DraftReviewPlan, { status: 'unresolved' }>['reason'] |
  'initialized' | 'absent' | 'denied' | 'version-mismatch' | 'unavailable' | 'save-failed' | 'response-invalid' | 'presentation-invalid';

export type DraftReviewDelivery = Extract<WidgetDataDelivery, { status: 'ready' }> |
  (Extract<WidgetDataDelivery, { status: 'unavailable' }> & { draftReviewReason: DraftReviewFailure });

export async function loadDraftReviewInputs(
  plan: DraftReviewPlan, { session, site, signal, localeDocuments, activeLocale }: {
    session: DraftSession | undefined;
    site: SurfaceDiagnosticSite;
    signal: AbortSignal;
    localeDocuments: readonly LocaleDocument[] | undefined;
    activeLocale: string | undefined;
  },
): Promise<DraftReviewDelivery> {
  function unavailable(reason: DraftReviewFailure, inputName = 'response'): DraftReviewDelivery {
    const message = 'The committed draft review inputs are unavailable.';
    return {
      status: 'unavailable', draftReviewReason: reason,
      failures: [{ inputName, required: true, reason: 'unavailable', message }],
      diagnostics: [surfaceDiagnostic('WIDGET-DATA-REQUIRED-UNAVAILABLE', message, site, { reason, inputName })],
    };
  }

  if (plan.status === 'unresolved') return unavailable(plan.reason,
    plan.reason === 'form-unresolved' ? 'definition' : plan.reason === 'invalid-binding' ? 'draftReview' : 'response');
  if (!session) return unavailable('unavailable');
  const { definition, subject } = plan;
  const draft = await session.readCommitted(definition, subject, { afterPendingSaves: true, signal });
  if (draft.status !== 'loaded') return unavailable(draft.status);
  const { response, revision, key } = draft;
  try {
    if (response.$formspecResponse !== '1.0' || response.status !== 'in-progress' ||
        typeof response.id !== 'string' || !response.id || !revision || response.definitionUrl !== definition.url ||
        !response.data || typeof response.data !== 'object' || Array.isArray(response.data) ||
        (key.subject && canonicalFiniteJson(snapshotFiniteJson(response.subject)) !== canonicalFiniteJson(snapshotFiniteJson(key.subject)))) {
      return unavailable('response-invalid');
    }
    if (response.definitionVersion !== definition.version) return unavailable('version-mismatch');
  } catch {
    return unavailable('response-invalid');
  }

  try {
    await initFormspecEngine();
    signal.throwIfAborted();
    const engine = createFormEngine(definition, {
      responseData: response.data as FormDraftSnapshot['data'], loadExternalSources: false,
      ...(key.subject && { responseSubject: key.subject }),
    });
    try {
      if (engine.hasSubjectRefusal()) return unavailable('presentation-invalid', 'presentation');
      for (const locale of localeDocuments ?? []) {
        if (locale.target.kind === 'definition' && targetDefinitionMatches(locale.target, definition)) {
          engine.loadLocale(locale);
        }
      }
      engine.setLocale(activeLocale || 'en');
      const fields = captureResponseFieldMetadata(definition, response, {
        label: path => engine.getItemLabelSignal(path)?.value || path,
        // Blank option metadata is unusable. The widget still displays the stored value.
        options: path => (engine.getFieldVM(path)?.options.value ?? [])
          .filter(option => option.value.length > 0 && option.label.length > 0),
      });
      const data: DraftResponseReviewData = { definition, response,
        presentation: { phase: 'draft-review', revision, locale: engine.getActiveLocale(), fields } };
      const captured = snapshotFiniteJson(data) as Readonly<Record<string, unknown>>;
      qualifyDraftReview(captured);
      return { status: 'ready', degradedInputs: [], diagnostics: [], data: captured };
    } finally {
      engine.dispose();
    }
  } catch {
    return unavailable('presentation-invalid', 'presentation');
  }
}
