/** @filedesc Screener types for formspec-react. */
import type {
  Bind,
  LocaleDocument,
  DeterminationRecord,
  FormItem,
  Phase,
  Route,
  ScreenerDocument,
} from '@formspec-org/types';

export type ScreenerRouteType = 'internal' | 'external' | 'none';

/** JSON-compatible screener field answer (aligned with engine FormFieldValue). */
export type ScreenerFieldValue =
  | string
  | number
  | boolean
  | null
  | ScreenerFieldValue[]
  | { [key: string]: ScreenerFieldValue };

export type ScreenerAnswers = Record<string, ScreenerFieldValue | undefined>;

/**
 * Author-facing screener document: canonical {@link ScreenerDocument} plus
 * optional UI/runtime fields not in the schema.
 */
export type ScreenerDocumentInput = ScreenerDocument & {
  submitLabel?: string;
  targetDefinition?: { url?: string };
};

/** Route definition with optional runtime routeType / legacy type hints. */
export type ScreenerRouteDef = Route & {
  routeType?: ScreenerRouteType;
  type?: string;
  externalUrl?: string;
};

export interface ScreenerRoute {
  target: string;
  label?: string;
  extensions?: Record<string, unknown>;
}

export interface ScreenerStateSnapshot {
  hasScreener: boolean;
  completed: boolean;
  routeType: ScreenerRouteType | null;
  route: ScreenerRoute | null;
  answers: ScreenerAnswers;
}

export type ScreenerCompletionDisposition = { status: 'accepted' } | { status: 'refused'; reason: string; retry?: 'same-act' | 'new-act' };
export interface UseScreenerOptions {
  /** Host-admitted Screener-target Locale resources; Definition/App targets stay separate. */
  localeDocuments?: readonly LocaleDocument[] | undefined;
  activeLocale?: string | undefined;
  /** Opt-in native completion. Acceptance precedes leaving answering state. */
  onDetermination?: (record: DeterminationRecord, answers: ScreenerAnswers, evaluationTime: string,
    context: { signal: AbortSignal; completionId: string }) => ScreenerCompletionDisposition | Promise<ScreenerCompletionDisposition>;
  /** Opaque completion scope; replacement retires the act while preserving answers. */
  completionKey?: string | undefined;
  /** Pre-fill answers. */
  seedAnswers?: ScreenerAnswers;
  /** Standalone Screener Document. */
  screenerDocument?: ScreenerDocumentInput | null;
  /** Callback when a route is determined. */
  onRoute?: (route: ScreenerRoute, routeType: ScreenerRouteType, answers: ScreenerAnswers) => void;
}

export interface UseScreenerResult {
  /** Current screener state. */
  state: 'idle' | 'answering' | 'completing' | 'routed';
  /** Current answers. */
  answers: ScreenerAnswers;
  /** Screener items from the loaded document. */
  items: FormItem[];
  /** Flattened route list from all evaluation phases. */
  routes: ScreenerRouteDef[];
  /** Bind declarations on the screener document. */
  binds: Bind[];
  /** Set a single answer. */
  setAnswer: (key: string, value: ScreenerFieldValue | undefined) => void;
  /** Submit answers for evaluation. */
  submit: () => void;
  /** Restart the screener (clear answers and route). */
  restart: () => void;
  /** Skip the screener entirely. */
  skip: () => void;
  /** The route result, if routed. */
  routeResult: { route: ScreenerRoute; routeType: ScreenerRouteType } | null;
  /** Whether the screener is skipped. */
  skipped: boolean;
  /** Validation errors for screener fields (key -> error message). */
  errors: Record<string, string>;
  /** Target-qualified display text; answer/evaluation state remains canonical. */
  presentation: import('./use-screener-text').ScreenerPresentationText;
}

export type { Bind, DeterminationRecord, FormItem, Phase, Route, ScreenerDocument };
