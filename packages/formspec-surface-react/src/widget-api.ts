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
 * - `emitAction` — the only action capability. The widget names a declared
 *   output. It never sees the mapped Response Actions id or a route.
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
  /** The widget's sole action capability; the shell owns mapping and execution. */
  emitAction: (outputName: string) => void;
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
}

/**
 * Host adapter to the existing Response Actions executor. The shell supplies
 * identity and exact action resolution; this port owns preconditions,
 * validation, effects, retry, idempotency and durable execution.
 */
export type SurfaceWidgetActionExecutor = (
  input: SurfaceWidgetActionExecutorInput,
) =>
  | ResponseActionInvokerResult<SubmitResult>
  | Promise<ResponseActionInvokerResult<SubmitResult>>;

export interface SurfaceWidgetActionOutcomeKey {
  generation: string;
  source: SurfaceWidgetActionSource;
}

export interface SurfaceWidgetStoredActionOutcome {
  invocationId: string;
  result: ResponseActionInvocationResult<SubmitResult>;
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
  result?: ResponseActionInvocationResult<SubmitResult> | undefined;
  navigation:
    | 'not-attempted'
    | 'none'
    | 'advanced'
    | 'ambiguous'
    | 'obsolete-generation';
}
