/** @filedesc Supply all ResponseReview inputs from one authorized committed draft. */
import { createFormEngine, initFormspecEngine, type FormDraftSnapshot } from '@formspec-org/engine';
import {
  placementCovers,
  readWarningAcknowledgementGroups,
  type WarningAcknowledgementGroupView,
} from '@formspec-org/layout';
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

export type DraftReviewReadyDelivery = Extract<WidgetDataDelivery, { status: 'ready' }> & {
  revision: string;
  warningGroups: readonly WarningAcknowledgementGroupView[];
};

export type DraftReviewDelivery = DraftReviewReadyDelivery |
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
    const hasResponseInstances = Object.values(definition.instances ?? {}).some(inst => Boolean(inst.response));
    const responseInstanceResolutions = hasResponseInstances && session.resolveReads
      ? await session.resolveReads(definition, key, draft.pins, signal)
      : undefined;
    signal.throwIfAborted();
    const engine = createFormEngine(definition, {
      savedResponseData: response.data as FormDraftSnapshot['data'], loadExternalSources: false,
      ...(responseInstanceResolutions && { responseInstanceResolutions }),
      ...(response.explanations && { savedExplanations: response.explanations }),
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
      const hrefForPath = (targetPath: string): string | null => {
        if (targetPath === '#') return null;
        const section = plan.sections?.find(sec => sec.fields.some(bind => placementCovers(bind, targetPath)));
        const destination = section?.href ?? plan.formHref ?? null;
        if (!destination) return null;
        const queryIndex = destination.indexOf('?');
        const base = queryIndex >= 0 ? destination.slice(0, queryIndex) : destination;
        const search = new URLSearchParams(queryIndex >= 0 ? destination.slice(queryIndex + 1) : '');
        search.set('field', targetPath);
        return `${base}?${search.toString()}`;
      };
      const warningGroups = readWarningAcknowledgementGroups(engine.getExplanationState(), {
        field: (targetPath) => {
          const vm = engine.getFieldVM(targetPath);
          const label = vm?.label.value ?? engine.getItemLabelSignal(targetPath)?.value;
          if (!vm && label === undefined) return null;
          return { label: label || targetPath, controlId: vm?.id || null };
        },
        rootLabel: () => definition.title || 'Form',
        resolveText: (localeKey, fallback) => engine.resolveLocaleString(localeKey, fallback),
        lookupUi: (uiKey) => engine.lookupLocaleString(`$ui.${uiKey}`),
        jumpable: (targetPath) => hrefForPath(targetPath) !== null,
        hrefForPath,
      });
      const data: DraftResponseReviewData = { definition, response,
        presentation: { phase: 'draft-review', revision, locale: engine.getActiveLocale(), fields } };
      const captured = snapshotFiniteJson(data) as Readonly<Record<string, unknown>>;
      qualifyDraftReview(captured);
      return { status: 'ready', degradedInputs: [], diagnostics: [], data: captured, revision, warningGroups };
    } finally {
      engine.dispose();
    }
  } catch {
    return unavailable('presentation-invalid', 'presentation');
  }
}
