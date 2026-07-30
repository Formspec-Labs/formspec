/**
 * @filedesc The module-widget delivery contract, in React terms.
 *
 * The Registry has always been able to *declare* a widget — name, version,
 * status, `childrenPolicy`, `tokenSlots`, a `widgetShape.props` JSON Schema.
 * Nothing could *deliver* one. This is the delivery side: the props a widget
 * receives and the shape a module publishes.
 *
 * ## What a widget is given, and what it is deliberately not
 *
 * - `config` — the authored `binding.config`, kept strictly as static
 *   configuration. Lint E604 validates it against the Registry entry's
 *   `widgetShape.props`; nothing validates it at runtime, so a widget reads it
 *   defensively.
 * - `data` — a frozen object keyed only by Registry-declared input names. Each
 *   value came through the Surface binding's exact Data Sources catalog/source
 *   pair and the canonical loader's availability, authorization and validation
 *   checks. Configuration never enters this object.
 * - `headingLevel` — where this widget's own headings sit in the page outline.
 *   A widget that hardcodes `<h2>` breaks the outline the moment it is embedded.
 * - `admitsTenantTheme` — whether the route it landed on admits tenant chrome.
 *   A widget does not decide this and cannot change it; it is told, so a widget
 *   that would otherwise paint a tenant accent can render its unbranded form.
 *
 * - `actions` — resolved, read-only presentation metadata for mapped Response
 *   Actions. This lets a generic widget use the Action's authored label and
 *   intent without duplicating them in widget configuration.
 * - `emitAction` — the only action capability. The widget still names a
 *   declared output; action ids are metadata and cannot be executed directly.
 *
 * A widget is NOT given navigation, an executor, or the route table. A
 * module-supplied widget navigating the app is a module deciding the app's
 * route graph, and transitions are the shell's (`transitions.ts`).
 */
import type { ReactNode } from 'react';
import type { HeadingLevel, RouteClass, WidgetModule } from '@formspec-org/surface';
import type {
  ResponseActionInvocationResult,
  ResponseActionInvokerResult,
  SubmitResult,
} from '@formspec-org/react';
import type { ResponseActionsDocument } from '@formspec-org/types';

export interface SurfaceWidgetRouteContext {
  surfaceId: string;
  /** Exact App Manifest Surface URL, when the route came from a resolved export. */
  surfaceRef?: string | undefined;
  routeId: string;
  routeClass: RouteClass | undefined;
  /** Resolved route parameters for the current URL. */
  params: Readonly<Record<string, string>>;
}

export type SurfaceWidgetActionLabel =
  | Readonly<{ literal: string }>
  | Readonly<{ ref: string }>;

/**
 * Read-only presentation metadata for one output whose Surface binding
 * resolves to exactly one loaded Response Actions Action.
 */
export interface SurfaceWidgetAction {
  outputName: string;
  actionRef: string;
  intent: string;
  label?: SurfaceWidgetActionLabel | undefined;
  /** Direct authored Need anchors on the resolved Response Actions Action. */
  needAnchors?: readonly string[] | undefined;
}

export type SurfaceWidgetActionValue =
  | null
  | boolean
  | number
  | string
  | readonly SurfaceWidgetActionValue[]
  | Readonly<{ [key: string]: SurfaceWidgetActionValue }>;

/**
 * Selected structured data emitted with an output. The shell admits only
 * finite, own-property JSON data and supplies a detached frozen copy.
 */
export type SurfaceWidgetActionInput = Readonly<{
  [key: string]: SurfaceWidgetActionValue;
}>;

/** Response submission detail or structured input returned by an app action. */
export type SurfaceWidgetActionDetail =
  | SubmitResult
  | SurfaceWidgetActionInput;

export type SurfaceWidgetActionFeedbackStatus =
  | 'completed'
  | 'failed'
  | 'refused'
  | 'obsolete';

export interface SurfaceWidgetActionEmission {
  /** False when this call joins an already-running logical action or is refused. */
  started: boolean;
  completion: Promise<Readonly<{ status: SurfaceWidgetActionFeedbackStatus }>>;
}

export interface SurfaceWidgetProps {
  moduleId: string;
  /** Matches `widgetShape.widgetName` — not the contribution id. */
  widgetName: string;
  slot: { id: string; title?: string | undefined };
  route: SurfaceWidgetRouteContext;
  headingLevel: HeadingLevel;
  /** Authored `binding.config`. `{}` when the slot declares none. */
  config: Readonly<Record<string, unknown>>;
  /** Frozen object containing only successfully delivered declared inputs. */
  data: Readonly<Record<string, unknown>>;
  /**
   * Exact resolved action metadata. Optional for source compatibility with
   * modules compiled against Surface React 0.1; the shell always supplies it.
   */
  actions?: readonly SurfaceWidgetAction[] | undefined;
  /**
   * The widget's sole action capability; the shell owns mapping and execution.
   * The optional emission lets a generic control render pending and terminal
   * feedback without gaining access to the executor.
   */
  emitAction: (
    outputName: string,
    input?: SurfaceWidgetActionInput | undefined,
  ) => SurfaceWidgetActionEmission | void;
  admitsTenantTheme: boolean;
}

export type SurfaceWidget = (props: SurfaceWidgetProps) => ReactNode;

export type SurfaceWidgetModule = WidgetModule<SurfaceWidget>;

export interface SurfaceWidgetActionSource {
  moduleId: string;
  widgetName: string;
  slotId: string;
  route: SurfaceWidgetRouteContext;
  outputName: string;
}

export interface SurfaceWidgetActionExecutorInput {
  /** Exact loaded document that uniquely publishes `actionRef`. */
  document: ResponseActionsDocument;
  actionRef: string;
  /** Shell-generated and stable for this logical emission and its retries. */
  invocationId: string;
  source: SurfaceWidgetActionSource;
  /** Frozen structured data selected by the widget configuration, when any. */
  input?: SurfaceWidgetActionInput | undefined;
}

/**
 * Host adapter to the existing Response Actions executor. The shell supplies
 * identity and exact action resolution; this port owns preconditions,
 * validation, effects, retry, idempotency and durable execution.
 */
export type SurfaceWidgetActionExecutor = (
  input: SurfaceWidgetActionExecutorInput,
) =>
  | ResponseActionInvokerResult<SurfaceWidgetActionDetail>
  | Promise<ResponseActionInvokerResult<SurfaceWidgetActionDetail>>;

export interface SurfaceWidgetActionOutcomeKey {
  generation: string;
  source: SurfaceWidgetActionSource;
  input?: SurfaceWidgetActionInput | undefined;
}

export interface SurfaceWidgetStoredActionOutcome {
  invocationId: string;
  result: ResponseActionInvocationResult<SurfaceWidgetActionDetail>;
}

/**
 * Optional host persistence for already-recorded terminals.
 *
 * `read` returns the prior logical delivery only when the host considers it
 * eligible for replay (for example, a durable completion whose UI
 * acknowledgement was interrupted). The stored value carries the original
 * shell invocation id, so a remounted shell reuses it rather than allocating a
 * second logical action.
 */
export interface SurfaceWidgetActionOutcomeStore {
  read(
    key: SurfaceWidgetActionOutcomeKey,
  ):
    | SurfaceWidgetStoredActionOutcome
    | undefined
    | Promise<SurfaceWidgetStoredActionOutcome | undefined>;
  write(
    key: SurfaceWidgetActionOutcomeKey,
    outcome: SurfaceWidgetStoredActionOutcome,
  ): void | Promise<void>;
}

export interface SurfaceWidgetActionReport {
  invocationId: string;
  actionRef?: string | undefined;
  outputName: string;
  result?: ResponseActionInvocationResult<SurfaceWidgetActionDetail> | undefined;
  navigation:
    | 'not-attempted'
    | 'none'
    | 'advanced'
    | 'ambiguous'
    | 'obsolete-generation';
}
