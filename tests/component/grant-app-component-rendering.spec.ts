import { test, expect } from '@playwright/test';
import {
  mountGrantApplication,
  goToPage,
  engineSetValue,
  engineValue,
} from '../e2e/browser/helpers/grant-app';

test.describe('Components: Grant App Component Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('should render RadioGroup with horizontal orientation using flex-direction row', async ({ page }) => {
    // Page 1 has orgType RadioGroup with orientation: "horizontal"
    const radioGroup = page.locator('.formspec-radio-group[data-orientation="horizontal"]');
    await expect(radioGroup).toHaveCount(1);
    // Verify CSS flex-direction is row (horizontal layout)
    const direction = await radioGroup.evaluate(el => getComputedStyle(el).flexDirection);
    expect(direction).toBe('row');
  });

  test('should render Rating using configured icon and integer value selection', async ({ page }) => {
    const stars = page.locator('.formspec-rating-star');
    await expect(stars).toHaveCount(5);

    // Grant fixture configures icon: "heart" — unselected stars render as outline ♡.
    const firstStarText = await stars.first().textContent();
    expect(firstStarText).toBe('♡');

    // selfAssessment is dataType: "integer", so setting 3 should select first 3 stars.
    await engineSetValue(page, 'projectNarrative.selfAssessment', 3);
    await page.waitForTimeout(50);

    const value = await engineValue(page, 'projectNarrative.selfAssessment');
    expect(value).toBe(3);

    await expect(stars.nth(0)).toHaveClass(/formspec-rating-star--selected/);
    await expect(stars.nth(1)).toHaveClass(/formspec-rating-star--selected/);
    await expect(stars.nth(2)).toHaveClass(/formspec-rating-star--selected/);
    await expect(stars.nth(3)).not.toHaveClass(/formspec-rating-star--selected/);
  });

  test('should render Accordion with meaningful label from component labels prop', async ({ page }) => {
    await goToPage(page, 'Project Phases');
    // Accordion should NOT show generic "Section 1"
    const accordion = page.locator('.formspec-accordion-item summary');
    await expect(accordion.first()).toBeVisible();
    const text = await accordion.first().textContent();
    expect(text).not.toContain('Section 1');
  });

  test('should render Tab buttons with tab-like styling (border-bottom or background)', async ({ page }) => {
    await goToPage(page, 'Project Narrative');
    const activeTab = page.locator('.formspec-tab--active');
    await expect(activeTab).toHaveCount(1);
    // Default layout tabs (default.navigation.css) use pill background + box-shadow; grant-bridge
    // uses a bottom border. Accept any of these so the active state is visually distinct.
    const styles = await activeTab.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        borderBottomWidth: cs.borderBottomWidth,
        borderBottomStyle: cs.borderBottomStyle,
        backgroundColor: cs.backgroundColor,
        boxShadow: cs.boxShadow,
      };
    });
    const hasVisibleBottomBorder =
      parseFloat(styles.borderBottomWidth) > 0 && styles.borderBottomStyle !== 'none';
    const hasBackground =
      styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent';
    const hasElevation = styles.boxShadow !== 'none';
    expect(hasVisibleBottomBorder || hasBackground || hasElevation).toBe(true);
  });

  test('should render Badge with background color styling', async ({ page }) => {
    await goToPage(page, 'Project Narrative');
    const badge = page.locator('.formspec-badge').first();
    await expect(badge).toBeVisible();
    // Badge should have a visible background (not transparent/white)
    const bg = await badge.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('should render Applicant Help panel with right placement metadata', async ({ page }) => {
    const helpPanel = page.locator('.formspec-panel').filter({
      has: page.locator('.formspec-panel-header', { hasText: 'Applicant Help' }),
    });
    await expect(helpPanel).toHaveCount(1);
    await expect(helpPanel).toHaveAttribute('data-placement', 'right');
  });

  test('should support modal trigger and size variants on Subcontractors page', async ({ page }) => {
    await goToPage(page, 'Subcontractors');
    await engineSetValue(page, 'budget.usesSubcontractors', true);
    await page.waitForTimeout(150);

    // Compliance notice is now an inline Alert (not a blocking auto-modal)
    const panel = page.locator('.formspec-wizard-panel:not(.formspec-hidden)');
    await expect(panel.locator('.formspec-alert--info', { hasText: 'Compliance reminder' })).toBeVisible();

    const certModal = page.locator('.formspec-modal').filter({
      has: page.locator('.formspec-modal-title', { hasText: 'Subcontractor Certification Requirements' }),
    });
    await expect(certModal).toHaveCount(1);
    await expect(certModal).toHaveAttribute('data-size', 'md');

    const riskModal = page.locator('.formspec-modal').filter({
      has: page.locator('.formspec-modal-title', { hasText: 'Subcontractor Risk Checklist' }),
    });
    await expect(riskModal).toHaveCount(1);
    await expect(riskModal).toHaveAttribute('data-size', 'full');

    const riskTrigger = page.locator('.formspec-modal-trigger', { hasText: 'View Risk Checklist' });
    await expect(riskTrigger).toHaveCount(1);
    await riskTrigger.click();
    await expect(riskModal).toHaveAttribute('open', '');
  });

  test('should support popover triggerBind and placement variants on Budget page', async ({ page }) => {
    await goToPage(page, 'Budget');

    await expect(page.locator('.formspec-popover-content[data-placement="top"]')).toHaveCount(1);
    await expect(page.locator('.formspec-popover-content[data-placement="right"]')).toHaveCount(1);
    await expect(page.locator('.formspec-popover-content[data-placement="bottom"]')).toHaveCount(1);
    await expect(page.locator('.formspec-popover-content[data-placement="left"]')).toHaveCount(1);

    const lineItemPopover = page.locator('.formspec-popover').filter({
      has: page.locator('.formspec-popover-content[data-placement="left"]'),
    });
    const dynamicTrigger = lineItemPopover.locator('.formspec-popover-trigger');
    await expect(dynamicTrigger).toHaveText('Line Item Details');

    await engineSetValue(page, 'budget.lineItems[0].description', 'Travel and lodging');
    await page.waitForTimeout(100);
    await expect(dynamicTrigger).toHaveText('Travel and lodging');
  });
});
