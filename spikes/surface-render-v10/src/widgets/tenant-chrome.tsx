/**
 * @filedesc Every widget the module `x-formspec-tenant-chrome` declares — all
 * four of them hand-stubbed, because no implementation of any of them exists in
 * any repo in the stack.
 *
 * The Registry document in the signed bundle declares each widget's name,
 * version, status `stable`, `childrenPolicy`, and a `tokenSlots` list. That is
 * enough for the ModuleResolver to admit the widget and for the app-graph
 * validator to reason about its theming. It is not enough for anything to draw
 * it, and there is no delivery channel that would let the module supply the
 * drawing. **A module can declare a widget it has no way to ship.**
 *
 * The second wall is data. The `module-widget` slot binding is
 * `{moduleId, widgetName}` with `additionalProperties: false`. The Registry
 * entry carries `widgetShape.props` as a JSON Schema — props the Surface has no
 * channel to supply. So every value below is invented: the queue rows, the case
 * reference, the amounts, the dates. Gap ledger `widget-data-binding` and
 * `no-runtime-state`.
 *
 * The receipt panel is the exception worth noticing: it shows real facts,
 * because the verification outcome is the one piece of true runtime state this
 * app has.
 */
import type { ReactNode } from 'react';
import type { VerificationOutcome } from '../verify.ts';
import { StubFrame } from './StubFrame.tsx';

export interface WidgetContext {
  /** Filled route parameters — invented, see `no-runtime-state`. */
  params: Readonly<Record<string, string>>;
  verification: VerificationOutcome;
  /** Advance to the route this route transitions to, if it declares one. */
  onAdvance?: () => void;
  nextRouteTitle?: string;
}

export type WidgetComponent = (props: { context: WidgetContext }) => ReactNode;

/* ── x-intake-banner ─────────────────────────────────────────────────── */

function IntakeBanner() {
  return (
    <StubFrame gapId="widget-x-intake-banner">
      <div className="banner">
        <p className="banner__eyebrow">Rent assistance</p>
        <p className="banner__body">
          Most people finish this in about ten minutes. Your answers are saved as you go.
        </p>
      </div>
    </StubFrame>
  );
}

/* ── x-ceremony-frame ────────────────────────────────────────────────── */

function CeremonyFrame() {
  return (
    <StubFrame gapId="widget-x-ceremony-frame">
      <div className="ceremony">
        <p className="ceremony__lead">
          Read this and confirm it is true. Once you confirm, it becomes part of your application.
        </p>
        <blockquote className="ceremony__affirmation">
          Everything I have told you about my household and my rent is true, as far as I know.
        </blockquote>
        <p className="ceremony__note">
          The words above are placeholder text. The bundle names a signing page and carries no
          declaration for it to show, and no signing act for it to perform.
        </p>
      </div>
    </StubFrame>
  );
}

/* ── x-receipt-panel ─────────────────────────────────────────────────── */

function ReceiptPanel({ context }: { context: WidgetContext }) {
  const caseRef = context.params.caseRef ?? '—';
  return (
    <StubFrame gapId="widget-x-receipt-panel">
      <div className="receipt">
        <dl className="receipt__facts">
          <div>
            <dt>Your reference</dt>
            <dd>
              <code>{caseRef}</code>
            </dd>
          </div>
          <div>
            <dt>What you sent</dt>
            <dd className="receipt__empty">
              Nothing to show — the bundle carries no submitted answers.
            </dd>
          </div>
          <div>
            <dt>Signed off by</dt>
            <dd>{context.verification.signerName}</dd>
          </div>
          <div>
            <dt>On</dt>
            <dd>{new Date(context.verification.signedAt).toLocaleString()}</dd>
          </div>
        </dl>
        <p className="receipt__note">
          The reference and the layout are invented for this spike. The name and date are real —
          they come from the signature on the bundle this page is built from.
        </p>
      </div>
    </StubFrame>
  );
}

/* ── x-queue-panel ───────────────────────────────────────────────────── */

/** Invented. There is no data source and no props channel. */
const INVENTED_QUEUE = [
  { ref: 'RA-2026-0412', household: 4, rent: '1,850', behind: 2, waiting: '3 days' },
  { ref: 'RA-2026-0413', household: 1, rent: '940', behind: 1, waiting: '3 days' },
  { ref: 'RA-2026-0417', household: 2, rent: '1,220', behind: 4, waiting: '6 days' },
  { ref: 'RA-2026-0421', household: 6, rent: '2,310', behind: 3, waiting: '8 days' },
];

function QueuePanel() {
  return (
    <StubFrame gapId="widget-x-queue-panel">
      <div className="queue">
        <div className="queue__scroll">
          <table className="queue__table">
            <caption className="queue__caption">
              Four applications waiting. All of these rows are invented for this spike.
            </caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">People in home</th>
                <th scope="col">Monthly rent</th>
                <th scope="col">Months behind</th>
                <th scope="col">Waiting</th>
                <th scope="col">
                  <span className="visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {INVENTED_QUEUE.map((row) => (
                <tr key={row.ref}>
                  <th scope="row">
                    <code>{row.ref}</code>
                  </th>
                  <td>{row.household}</td>
                  <td>${row.rent}</td>
                  <td>{row.behind}</td>
                  <td>{row.waiting}</td>
                  <td>
                    <button type="button" className="queue__open" disabled>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="queue__note">
          A queue table is the obvious first thing an operator screen needs, and it is the thing the
          platform is furthest from having: no widget implementation, no way for a module to ship
          one, and no channel for a slot to hand it data.
        </p>
      </div>
    </StubFrame>
  );
}

/**
 * The runtime widget registry — gap ledger `module-widget-runtime`.
 *
 * A `{moduleId, widgetName}` binding needs to become a component. Nothing in
 * the stack does this lookup. `formspec-webcomponent` has a `ComponentRegistry`,
 * but it keys Definition component types (`TextInput`, `Section`) — a different
 * vocabulary that cannot be borrowed for this one.
 */
const WIDGETS: Readonly<Record<string, WidgetComponent>> = {
  'x-formspec-tenant-chrome/x-intake-banner': IntakeBanner,
  'x-formspec-tenant-chrome/x-ceremony-frame': CeremonyFrame,
  'x-formspec-tenant-chrome/x-receipt-panel': ReceiptPanel,
  'x-formspec-tenant-chrome/x-queue-panel': QueuePanel,
};

export function resolveWidget(moduleId: string, widgetName: string): WidgetComponent | undefined {
  return WIDGETS[`${moduleId}/${widgetName}`];
}
