/**
 * @filedesc The gap drawer — the measurement, on screen. Spike scaffolding.
 *
 * The spike exists to produce the gap ledger, so the ledger is part of the
 * running app rather than only part of the write-up. It keeps the screenshots
 * honest: anyone looking at a page can count what the platform actually
 * supplied.
 *
 * It now shows two numbers, because the ledger has two halves. **Closed rows
 * stay on screen.** A drawer that only listed what is still missing would be a
 * drawer you cannot audit — you could not tell a list that was always short
 * from one that was worked down, or check that a fix went where the entry said
 * it belonged. Every closed row still says what it was, and says where it went.
 *
 * The runtime diagnostics are here for the same reason. `SurfaceApp` reports
 * everything the composition had to decide that the platform does not state —
 * an unpinned route-parameter grammar, a registry-name collision, a tenant
 * token the vocabulary does not carry. A diagnostic nobody can see is the
 * failure mode this whole spike was built around.
 */
import type { SurfaceDiagnostic } from '@formspec-org/surface';
import { GAP_LEDGER, OPEN_GAPS, RESOLVED_GAPS } from '../gaps.ts';

const HOME_LABEL: Readonly<Record<string, string>> = {
  'formspec-web': 'formspec-web',
  'new: surface-shell package': 'a surface-shell package',
  'registry widget family': 'the registry widget family',
  'existing package, unexported': 'a shipped package that does not expose it',
  'spec or schema, upstream of any renderer': 'the spec or the schema',
  'spike scaffolding': 'nowhere — spike only',
};

export function GapDrawer({ diagnostics = [] }: { diagnostics?: readonly SurfaceDiagnostic[] }) {
  return (
    <div className="gaps-foot">
      <details className="gaps" data-probe="gap-drawer" data-gap-total={GAP_LEDGER.length}>
        <summary>
          <strong>{GAP_LEDGER.length}</strong> gaps found by building this app —{' '}
          <strong data-probe="gap-resolved-count">{RESOLVED_GAPS.length}</strong> now shipped,{' '}
          <strong data-probe="gap-open-count">{OPEN_GAPS.length}</strong> still open
        </summary>
        <ul className="gaps__list">
          {GAP_LEDGER.map((entry) => (
            <li
              key={entry.id}
              className={`gaps__item gaps__item--${entry.resolved ? 'closed' : 'open'}`}
              data-gap={entry.id}
              data-gap-state={entry.resolved ? 'closed' : 'open'}
            >
              <p className="gaps__state">{entry.resolved ? 'Shipped' : 'Still open'}</p>
              <p className="gaps__what">{entry.what}</p>
              {entry.resolved ? (
                <>
                  <p className="gaps__home">
                    Landed in: <strong>{entry.resolved.landedIn[0]}</strong>
                    {entry.resolved.landedIn.length > 1
                      ? ` (+${entry.resolved.landedIn.length - 1} more)`
                      : ''}
                  </p>
                  <p className="gaps__why">
                    Before: {entry.resolved.before}
                    <br />
                    After: {entry.resolved.after}
                  </p>
                  {!entry.resolved.naturalHomeHeld && (
                    <p className="gaps__home">
                      Did <em>not</em> land where this entry predicted —{' '}
                      {entry.resolved.naturalHomeNote}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="gaps__why">{entry.whyNeeded}</p>
                  <p className="gaps__home">
                    Belongs in: <strong>{HOME_LABEL[entry.naturalHome] ?? entry.naturalHome}</strong>
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>

      {/*
        Every diagnostic the shell produces reaches this list, whatever stage
        produced it — bundle dereference, composition, registry flattening,
        theme resolution, route matching, slot planning, transition planning.
        The route-scoped ones used to be computed and dropped, so this drawer
        showed the app-construction minority; they now arrive through
        `onDiagnostics` like everything else, which is why the count is higher
        than the earlier screenshots show.

        `severity` is on every diagnostic and is displayed, because a host that
        wants to escalate some codes and ignore others needs the rank as well as
        the list.
      */}
      <details className="gaps" data-probe="diagnostics-drawer" data-diagnostic-count={diagnostics.length}>
        <summary>
          <strong>{diagnostics.length}</strong> runtime diagnostics on this page —{' '}
          <strong data-probe="diagnostic-error-count">
            {diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length}
          </strong>{' '}
          error,{' '}
          <strong data-probe="diagnostic-warning-count">
            {diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length}
          </strong>{' '}
          warning,{' '}
          <strong data-probe="diagnostic-info-count">
            {diagnostics.filter((diagnostic) => diagnostic.severity === 'info').length}
          </strong>{' '}
          info
        </summary>
        {diagnostics.length === 0 ? (
          <p className="gaps__why">
            Nothing. Every route matched, every document the manifest names is present, every slot
            resolved, and no vocabulary needed bridging.
          </p>
        ) : (
          <ul className="gaps__list">
            {diagnostics.map((diagnostic, index) => (
              <li
                className="gaps__item gaps__item--open"
                key={`${diagnostic.code}-${index}`}
                data-diagnostic={diagnostic.code}
                data-diagnostic-severity={diagnostic.severity}
              >
                <p className="gaps__state">
                  {diagnostic.severity} · {diagnostic.code}
                </p>
                <p className="gaps__what">{diagnostic.message}</p>
                {(diagnostic.site.routeId || diagnostic.site.slotId || diagnostic.site.source) && (
                  <p className="gaps__home">
                    {[
                      diagnostic.site.surfaceId && `surface ${diagnostic.site.surfaceId}`,
                      diagnostic.site.routeId && `route ${diagnostic.site.routeId}`,
                      diagnostic.site.slotId && `slot ${diagnostic.site.slotId}`,
                      diagnostic.site.source && diagnostic.site.source,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
