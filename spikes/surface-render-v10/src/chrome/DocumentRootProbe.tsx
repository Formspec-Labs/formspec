/**
 * @filedesc The document-root reading, on screen. Spike scaffolding — gap ledger `shell-visual-design`.
 *
 * `<html>` used to accumulate the tenant's theme tokens the first time the
 * intake route rendered, and keep them across navigation to a route whose class
 * refuses tenant theming. The shell's own boundary could not prevent it; a
 * scrub in `enforceDocumentRootThemeBoundary` cleaned up after it.
 *
 * That scrub is gone — from this spike AND from `@formspec-org/surface-react`,
 * which deliberately ships none — and this reads what is actually there. It is
 * on screen rather than only in `evidence/` because a number nobody can see is
 * a claim, and because a shell that MANUFACTURES the property it reports is not
 * measuring anything. This component only reads.
 */
import { useEffect, useState } from 'react';
import { TENANT_TOKEN_VALUES, documentRootThemeProperties } from '../tenant-theme-probe.ts';

export function DocumentRootProbe({ routeId }: { routeId: string }) {
  const [reading, setReading] = useState<{ count: number; tenantValues: number }>({
    count: 0,
    tenantValues: 0,
  });

  useEffect(() => {
    const properties = documentRootThemeProperties();
    const style = document.documentElement.style;
    const tenantValues = properties.filter((property) =>
      TENANT_TOKEN_VALUES.includes(style.getPropertyValue(property).trim()),
    ).length;
    setReading({ count: properties.length, tenantValues });
  }, [routeId]);

  return (
    <p
      className={`rootprobe rootprobe--${reading.tenantValues === 0 ? 'clean' : 'leaking'}`}
      data-probe="document-root"
      data-root-formspec-count={reading.count}
      data-root-tenant-values={reading.tenantValues}
    >
      <strong>{reading.count}</strong> <code>--formspec-*</code> properties on{' '}
      <code>&lt;html&gt;</code>, <strong>{reading.tenantValues}</strong> of them the tenant’s. The
      shell reads this; nothing in the shell writes or clears it.
    </p>
  );
}
