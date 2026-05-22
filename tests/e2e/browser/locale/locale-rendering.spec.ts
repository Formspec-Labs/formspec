/** @filedesc E2E tests for locale-resolved rendering: labels, hints, validation, component text, lang/dir. */
import { test, expect } from '@playwright/test';
import { gotoHarness } from '../helpers/harness';

// ── Minimal inline fixtures ──

const DEFINITION = {
  $formspec: '1.0',
  version: '1.0.0',
  url: 'urn:test:locale-e2e',
  title: 'Locale Test Form',
  description: 'A form for testing locale rendering',
  items: [
    { key: 'name', type: 'field', dataType: 'string', label: 'Full Name', hint: 'Enter your name', description: 'Your legal name' },
    { key: 'email', type: 'field', dataType: 'string', label: 'Email Address' },
    { key: 'color', type: 'field', dataType: 'choice', label: 'Favorite Color', options: [
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'Blue' },
      { value: 'green', label: 'Green' },
    ]},
    { key: 'count', type: 'field', dataType: 'integer', label: 'Count' },
  ],
  binds: [
    { path: 'name', required: true },
  ],
  formPresentation: {
    direction: 'auto',
  },
};

const COMPONENT = {
  $formspecComponent: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:locale-e2e' },
  tree: {
    component: 'Stack',
    children: [
      { component: 'Heading', id: 'main-heading', text: 'Welcome', level: 1 },
      { component: 'TextInput', bind: 'name' },
      { component: 'TextInput', bind: 'email' },
      { component: 'Select', bind: 'color' },
      { component: 'NumberInput', bind: 'count' },
      { component: 'ActionButton', id: 'submit-btn', actionRef: 'submit', label: { literal: 'Submit Form' } },
    ],
  },
};

const LOCALE_FR = {
  $formspecLocale: '1.0',
  version: '1.0.0',
  locale: 'fr',
  targetDefinition: { url: 'urn:test:locale-e2e' },
  strings: {
    'name.label': 'Nom complet',
    'name.hint': 'Entrez votre nom',
    'name.description': 'Votre nom légal',
    'email.label': 'Adresse courriel',
    'color.label': 'Couleur préférée',
    'color.options.red.label': 'Rouge',
    'color.options.blue.label': 'Bleu',
    'color.options.green.label': 'Vert',
    'count.label': 'Nombre',
    'name.errors.REQUIRED': 'Ce champ est obligatoire',
    '$form.title': 'Formulaire de test de localisation',
    '$component.main-heading.text': 'Bienvenue',
    '$component.submit-btn.label': 'Soumettre le formulaire',
  },
};

const LOCALE_AR = {
  $formspecLocale: '1.0',
  version: '1.0.0',
  locale: 'ar',
  targetDefinition: { url: 'urn:test:locale-e2e' },
  strings: {
    'name.label': 'الاسم الكامل',
    '$form.title': 'نموذج اختبار',
  },
};

async function mountWithLocale(page: any, locale?: any, activeLocale?: string) {
  await page.evaluate(({ def, comp, loc, activeLoc }: any) => {
    const el: any = document.querySelector('formspec-render');
    // Load locale documents BEFORE definition so they're available at render time
    if (loc) el.localeDocuments = loc;
    if (activeLoc) el.locale = activeLoc;
    el.definition = def;
    el.componentDocument = comp;
  }, { def: DEFINITION, comp: COMPONENT, loc: locale, activeLoc: activeLocale });
  // Let signals settle
  await page.waitForTimeout(200);
}

// ── Tests ──

test.describe('Locale Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test('renders inline labels when no locale is loaded', async ({ page }) => {
    await mountWithLocale(page);
    const label = page.locator('[data-name="name"] label');
    await expect(label).toContainText('Full Name');
  });

  test('renders locale-resolved field labels', async ({ page }) => {
    await mountWithLocale(page, LOCALE_FR, 'fr');

    await expect(page.locator('[data-name="name"] label')).toContainText('Nom complet');
    await expect(page.locator('[data-name="email"] label')).toContainText('Adresse courriel');
    await expect(page.locator('[data-name="color"] label')).toContainText('Couleur préférée');
    await expect(page.locator('[data-name="count"] label')).toContainText('Nombre');
  });

  test('renders locale-resolved hint text', async ({ page }) => {
    await mountWithLocale(page, LOCALE_FR, 'fr');

    await expect(page.locator('[data-name="name"] .formspec-hint')).toContainText('Entrez votre nom');
  });

  test('renders locale-resolved description text', async ({ page }) => {
    await mountWithLocale(page, LOCALE_FR, 'fr');

    await expect(page.locator('[data-name="name"] .formspec-description')).toContainText('Votre nom légal');
  });

  test('renders component-tier locale text via $component. keys', async ({ page }) => {
    // Locale must be set BEFORE definition for component-tier text
    await mountWithLocale(page, LOCALE_FR, 'fr');

    await expect(page.locator('#main-heading')).toContainText('Bienvenue');
    await expect(page.locator('.formspec-submit')).toContainText('Soumettre le formulaire');
  });

  test('sets lang attribute on formspec-render when locale is set', async ({ page }) => {
    await mountWithLocale(page, LOCALE_FR, 'fr');

    const lang = await page.locator('formspec-render').getAttribute('lang');
    expect(lang).toBe('fr');
  });

  test('sets dir=rtl when locale is RTL language with direction auto', async ({ page }) => {
    await mountWithLocale(page, LOCALE_AR, 'ar');

    const dir = await page.locator('formspec-render').getAttribute('dir');
    expect(dir).toBe('rtl');
    const lang = await page.locator('formspec-render').getAttribute('lang');
    expect(lang).toBe('ar');
  });

  test('switches labels dynamically when locale changes', async ({ page }) => {
    // Start with French
    await mountWithLocale(page, [LOCALE_FR, LOCALE_AR], 'fr');
    await expect(page.locator('[data-name="name"] label')).toContainText('Nom complet');

    // Switch to Arabic — labels update reactively
    await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      el.locale = 'ar';
    });
    await page.waitForTimeout(200);
    await expect(page.locator('[data-name="name"] label')).toContainText('الاسم الكامل');
  });

  test('falls back to inline label for untranslated fields', async ({ page }) => {
    // Arabic locale only translates 'name', not 'email'
    await mountWithLocale(page, LOCALE_AR, 'ar');

    // name is translated
    await expect(page.locator('[data-name="name"] label')).toContainText('الاسم الكامل');
    // email falls back to inline
    await expect(page.locator('[data-name="email"] label')).toContainText('Email Address');
  });
});
