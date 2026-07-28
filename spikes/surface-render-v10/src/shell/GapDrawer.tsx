/**
 * @filedesc The gap drawer — the measurement, on screen.
 *
 * The spike exists to produce the gap ledger, so the ledger is part of the
 * running app rather than only part of the write-up. It also keeps the
 * screenshots honest: anyone looking at a page can count what the platform
 * actually supplied.
 */
import { GAP_LEDGER } from '../gaps.ts';

const HOME_LABEL: Readonly<Record<string, string>> = {
  'formspec-web': 'formspec-web',
  'new: surface-shell package': 'a surface-shell package (does not exist)',
  'registry widget family': 'the registry widget family',
  'existing package, unexported': 'a shipped package that does not expose it',
  'spike scaffolding': 'nowhere — spike only',
};

export function GapDrawer() {
  return (
    <details className="gaps" data-probe="gap-drawer">
      <summary>
        <strong>{GAP_LEDGER.length}</strong> pieces of this app were built by hand because the
        platform ships nothing for them
      </summary>
      <ul className="gaps__list">
        {GAP_LEDGER.map((entry) => (
          <li key={entry.id} className="gaps__item" data-gap={entry.id}>
            <p className="gaps__what">{entry.what}</p>
            <p className="gaps__why">{entry.whyNeeded}</p>
            <p className="gaps__home">
              Belongs in: <strong>{HOME_LABEL[entry.naturalHome] ?? entry.naturalHome}</strong>
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
