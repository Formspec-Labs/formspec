/**
 * @filedesc Translates `surfaces/admin-billing.html` (route `/admin/billing`) —
 * the admin settings pattern: section nav, plan panel, four quota meters,
 * payment method owned by an external processor, and an invoice table whose
 * row action downloads a PDF the product does not render.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/admin-billing';
const SURFACE_URL = `${BUNDLE}/surfaces/billing`;

export const adminBilling: SurfaceScript = {
  id: 'admin-billing',
  mockup: 'surfaces/admin-billing.html',
  family: 'settings-admin',
  route: '/admin/billing',
  surfaceId: 'billing',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Billing',
  brief:
    'Admin billing. Admin section nav across members, billing, audit, retention, AI policy, residency, SSO, org. Current-plan panel describing the Regulated tier with renewal terms, cancel and change-plan actions. Four usage meters with quota ceilings and a projection ("projected end 21 800 · within plan", "approaching plan limit"). Payment-method panel owned by the payment processor. Invoice table with period, amount, status, and a per-row PDF download. Tax id and billing address.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 24 — settings panels are read-mostly display with no primitive
    gap({
      id: 24,
      verb: 'bindSlot',
      family: 'read-only-display',
      wanted:
        'A read-only panel: labelled facts bound to a data source (plan name, renewal date, price, quota ceiling, billing email, tax id), rendered inert, with a small number of actions attached at the panel level.',
      got:
        '`definition-form` demands a Definition the panel does not have; `experience-unit` demands an Experience document and an actor performing a task; `static-content` cannot bind data. The persona used `experience-unit` and dropped actorRef/taskRefs, which is exactly the misuse v7 recorded.',
      severity: 'missing-feature',
      why:
        'Read-mostly panels are the dominant region type across the admin, trust, detail, and receipt surfaces. Every one of them currently claims to be an Experience unit, which corrupts the meaning of Experience for the respondent flows that actually use it.',
      v7Ref: 'F4',
      suggestion:
        'A `data-view` slot type: data source + layout intent (`detail` | `panel` | `metadata` | `prose`) + optional panel-level actions. No Experience, no Definition.',
    });

    // ── FINDING 25 — no action target outside the form-completion model
    gap({
      id: 25,
      verb: 'Response Actions',
      family: 'action-vocabulary',
      wanted:
        '"Update payment method" hands off to the payment processor and returns; "Download PDF" fetches an artifact the product never renders; "Change plan" mutates tenancy and re-prices. Three action targets, none of them a form submission.',
      got:
        'Response Actions are shaped for completing an intake response. External handoff, artifact download, and tenancy mutation have no declarable target, so all three are anchor tags inside a module.',
      severity: 'reshape-needed',
      why:
        'Actions that leave the product or mutate tenancy are the ones that need an audit record most. Modeling them as unmodeled means the audit log surface and the action surface disagree by construction.',
      v7Ref: 'F12',
      suggestion:
        'An action-target taxonomy alongside form submission: `runtime-command`, `artifact-download`, `external-handoff` (with return contract), each carrying an authority requirement.',
    });

    for (const m of ['x-cloud-admin-nav', 'x-cloud-quota-meters', 'x-cloud-payment-method', 'x-cloud-invoice-table']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const planPanel = await mcp.addExperienceUnit({
      unitId: 'currentPlanPanel',
      kind: 'x-spike-v8:read-only-panel',
      title: 'Current plan',
    });
    if (!planPanel.ok) throw new Error(`addExperienceUnit refused: ${planPanel.error.code}`);

    const routes = [
      {
        routeId: 'billing',
        path: '/admin/billing',
        title: 'Billing',
        slots: [
          {
            id: 'adminNav',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-admin-nav',
              widgetName: 'AdminSectionNav',
              config: {
                sections: ['members', 'billing', 'audit', 'retention', 'ai-policy', 'residency', 'sso', 'org'],
                counts: { members: 12 },
              },
            },
            title: 'Admin',
            position: 'top',
            mockupRegion: 'admin section nav with member count badge',
          },
          {
            id: 'planPanel',
            slotType: 'experience-unit' as const,
            binding: { unitRef: 'currentPlanPanel' },
            title: 'Current plan',
            position: 'main',
            mockupRegion: 'current plan panel — Regulated, $1 200/mo, renewal terms, cancel / change plan',
          },
          {
            id: 'usageMeters',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-quota-meters',
              widgetName: 'QuotaMeters',
              config: {
                dataSource: 'x-spike-v8:workspace:usage',
                meters: ['responses', 'signature-envelopes', 'api-requests', 'object-storage'],
                projection: true,
              },
            },
            title: 'Usage',
            position: 'main',
            mockupRegion: 'four quota meters with ceilings, projections, and an approaching-limit warning',
          },
          {
            id: 'paymentMethod',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-payment-method',
              widgetName: 'PaymentMethod',
              config: { externalHandoff: 'x-spike-v8:external:payment-processor' },
            },
            title: 'Payment method',
            position: 'right',
            mockupRegion: 'payment method panel owned by the processor + billing email / tax id / address',
          },
          {
            id: 'invoices',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-invoice-table',
              widgetName: 'InvoiceTable',
              config: {
                dataSource: 'x-spike-v8:workspace:invoices',
                columns: ['invoice', 'period', 'amount', 'date', 'status'],
                rowActions: ['download-pdf'],
              },
            },
            title: 'Invoices',
            position: 'main',
            mockupRegion: 'invoice table with per-row PDF download and a download-all action',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Admin billing policy',
      routePolicies: [{ routeId: 'billing', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
