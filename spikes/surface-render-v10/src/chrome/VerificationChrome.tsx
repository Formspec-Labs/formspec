/**
 * @filedesc The verified-state strip. Hand-built — gap ledger `verified-state-chrome`.
 *
 * The spike's claim is *the bundle a person signed is the app people see*. The
 * app checks that before it renders anything; this is where a person can see
 * that it did. A verdict nobody can see is not a trust affordance.
 *
 * Two facts, not one. The cryptographic verdict says the signature is genuine.
 * The digest match says the bytes being rendered are the bytes that were
 * signed. Either one alone is a half-truth, so both are shown and the headline
 * is green only when both hold.
 */
import type { VerificationOutcome } from '../verify.ts';
import { isTrustworthy } from '../verify.ts';

export function VerificationChrome({
  outcome,
  bundleTitle,
}: {
  outcome: VerificationOutcome;
  bundleTitle: string;
}) {
  const ok = isTrustworthy(outcome);
  return (
    <header className={`verify ${ok ? 'verify--ok' : 'verify--bad'}`} data-verified={String(ok)}>
      <div className="verify__row">
        <p className="verify__headline">
          <span className="verify__mark" aria-hidden="true">
            {ok ? '✓' : '!'}
          </span>
          {ok ? (
            <>
              This app is exactly what <strong>{outcome.signerName}</strong> signed off.
            </>
          ) : (
            <>This app does not match what was signed off.</>
          )}
        </p>
        <details className="verify__details">
          <summary>How this was checked</summary>
          <dl>
            <div>
              <dt>Signature</dt>
              <dd data-probe="verify-result">
                {outcome.result}
                {outcome.reason ? ` — ${outcome.reason}` : ''}
              </dd>
            </div>
            <div>
              <dt>Contents match the signature</dt>
              <dd data-probe="verify-digest-match">{outcome.digestMatches ? 'yes' : 'no'}</dd>
            </div>
            <div>
              <dt>Signed</dt>
              <dd>{new Date(outcome.signedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>They affirmed</dt>
              <dd className="verify__affirmation">“{outcome.affirmationText}”</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>
                <code>{outcome.methodUriFromEnvelope}</code> (read from the signature envelope, not
                from the record beside it)
              </dd>
            </div>
            <div>
              <dt>Checked by</dt>
              <dd>
                <code>{outcome.adapter.id}</code> against method registry v
                {outcome.methodRegistryVersion}
              </dd>
            </div>
            <div>
              <dt>Fingerprint</dt>
              <dd>
                <code className="verify__digest">{outcome.recomputedDigest}</code>
              </dd>
            </div>
            <div>
              <dt>Read from</dt>
              <dd>
                <ul className="verify__inputs">
                  {outcome.inputsRead.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </details>
      </div>
      <p className="verify__bundle">{bundleTitle}</p>
    </header>
  );
}
