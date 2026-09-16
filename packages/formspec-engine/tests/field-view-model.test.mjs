/**
 * FieldViewModel tests.
 *
 * Verifies that FieldViewModel provides reactive, locale-resolved
 * field state computed from engine signals + LocaleStore.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { preactReactiveRuntime as rt } from '../dist/reactivity/preact-runtime.js';
import { LocaleStore } from '../dist/locale.js';
import { createFieldViewModel } from '../dist/field-view-model.js';
import { interpolateMessage } from '../dist/interpolate-message.js';

function makeMinimalDeps(overrides = {}) {
    const localeStore = new LocaleStore(rt);
    return {
        rx: rt,
        localeStore,
        templatePath: 'email',
        instancePath: 'email',
        id: 'field-email',
        itemKey: 'email',
        dataType: 'string',
        getItemLabel: () => 'Email Address',
        getItemHint: () => 'Enter your email',
        getItemDescription: () => 'Work or personal email',
        getItemLabels: () => undefined,
        getLabelContext: () => null,
        getFieldValue: () => rt.signal(''),
        getRequired: () => rt.signal(false),
        getVisible: () => rt.signal(true),
        getReadonly: () => rt.signal(false),
        getDisabledDisplay: () => 'hidden',
        getErrors: () => rt.signal([]),
        getConstraintMessage: () => null,
        getOptions: () => rt.signal([]),
        getOptionsState: () => rt.signal({ loading: false, error: null }),
        getOptionSetName: () => undefined,
        setFieldValue: (_v) => {},
        getWriteSource: () => rt.signal(null),
        interpolate: (template) => interpolateMessage(template, (expr) => `[${expr}]`).text,
        interpolateMessage: (template) => interpolateMessage(template, (expr) => `[${expr}]`).text,
        ...overrides,
    };
}

test('FieldViewModel label resolves from inline definition', () => {
    const deps = makeMinimalDeps();
    const vm = createFieldViewModel(deps);
    assert.equal(vm.label.value, 'Email Address');
});

test('FieldViewModel label resolves from locale store', () => {
    const deps = makeMinimalDeps();
    const vm = createFieldViewModel(deps);

    // Load locale with translated label
    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: { 'email.label': 'Adresse courriel' },
    });
    deps.localeStore.setLocale('fr');

    assert.equal(vm.label.value, 'Adresse courriel');
});

test('FieldViewModel label with FEL interpolation', () => {
    const deps = makeMinimalDeps({
        interpolate: (template) => interpolateMessage(template, (expr) => expr === '$count' ? 42 : expr).text,
    });
    const vm = createFieldViewModel(deps);

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: { 'email.label': 'Total: {{$count}} éléments' },
    });
    deps.localeStore.setLocale('fr');

    assert.equal(vm.label.value, 'Total: 42 éléments');
});

test('FieldViewModel label context cascade (6-step)', () => {
    const labelContextSignal = rt.signal('short');
    const deps = makeMinimalDeps({
        getItemLabels: () => ({ short: 'Email (short)' }),
        getLabelContext: () => labelContextSignal.value,
    });
    const vm = createFieldViewModel(deps);

    // Step 5: Definition labels['short'] (no locale loaded)
    assert.equal(vm.label.value, 'Email (short)');

    // Load locale with context label
    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: { 'email.label@short': 'Courriel (court)' },
    });
    deps.localeStore.setLocale('fr');

    // Step 1: Locale key with context
    assert.equal(vm.label.value, 'Courriel (court)');

    // Change context to null — falls through to plain label
    labelContextSignal.value = null;
    // No locale key for plain label → inline definition label
    assert.equal(vm.label.value, 'Email Address');
});

test('FieldViewModel hint resolves from locale', () => {
    const deps = makeMinimalDeps();
    const vm = createFieldViewModel(deps);

    assert.equal(vm.hint.value, 'Enter your email');

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: { 'email.hint': 'Entrez votre courriel' },
    });
    deps.localeStore.setLocale('fr');

    assert.equal(vm.hint.value, 'Entrez votre courriel');
});

test('FieldViewModel description resolves from locale', () => {
    const deps = makeMinimalDeps();
    const vm = createFieldViewModel(deps);

    assert.equal(vm.description.value, 'Work or personal email');

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: { 'email.description': 'Courriel professionnel ou personnel' },
    });
    deps.localeStore.setLocale('fr');

    assert.equal(vm.description.value, 'Courriel professionnel ou personnel');
});

test('FieldViewModel hint and description resolve @context keys (Locale §3.1.2)', () => {
    const contextSignal = rt.signal('accessibility');
    const deps = makeMinimalDeps({ getLabelContext: () => contextSignal.value });
    const vm = createFieldViewModel(deps);

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: {
            'email.hint': 'Courriel professionnel',
            'email.hint@accessibility': 'Saisissez votre adresse courriel professionnelle.',
            'email.description@accessibility': 'Adresse utilisée pour vous joindre.',
        },
        stringGeneration: {
            'email.hint@accessibility': { anchors: ['need:accessible-email-hint@1'] },
        },
    });
    deps.localeStore.setLocale('fr');

    // Step 1: Locale key with context
    assert.equal(vm.hint.value, 'Saisissez votre adresse courriel professionnelle.');
    assert.deepEqual(vm.hintNeedAnchors.value, ['need:accessible-email-hint@1']);
    assert.equal(vm.description.value, 'Adresse utilisée pour vous joindre.');

    // Unknown context: Step 2 Locale key, then Step 4 inline (no Definition context step)
    contextSignal.value = 'pdf';
    assert.equal(vm.hint.value, 'Courriel professionnel');
    assert.equal(vm.description.value, 'Work or personal email');

    contextSignal.value = null;
    assert.equal(vm.hint.value, 'Courriel professionnel');
    assert.deepEqual(vm.hintNeedAnchors.value, []);
});

test('FieldViewModel exposes Need anchors for the exact localized presentation strings', () => {
    const deps = makeMinimalDeps();
    const vm = createFieldViewModel(deps);

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: {
            'email.label': 'Courriel',
            'email.hint': 'Entrez votre courriel',
            'email.description': 'Courriel professionnel ou personnel',
        },
        stringGeneration: {
            'email.label': { anchors: ['need:localized-email-label@1'] },
            'email.hint': { anchors: ['need:localized-email-hint@2'] },
            'email.description': { anchors: ['need:localized-email-description@3'] },
        },
    });
    deps.localeStore.setLocale('fr');

    assert.deepEqual(vm.labelNeedAnchors.value, ['need:localized-email-label@1']);
    assert.deepEqual(vm.hintNeedAnchors.value, ['need:localized-email-hint@2']);
    assert.deepEqual(vm.descriptionNeedAnchors.value, ['need:localized-email-description@3']);

    deps.localeStore.setLocale('en');
    assert.deepEqual(vm.labelNeedAnchors.value, []);
    assert.deepEqual(vm.hintNeedAnchors.value, []);
    assert.deepEqual(vm.descriptionNeedAnchors.value, []);
});

test('FieldViewModel value signal wraps engine signal', () => {
    const valueSignal = rt.signal('hello@test.com');
    const deps = makeMinimalDeps({ getFieldValue: () => valueSignal });
    const vm = createFieldViewModel(deps);

    assert.equal(vm.value.value, 'hello@test.com');
    valueSignal.value = 'new@test.com';
    assert.equal(vm.value.value, 'new@test.com');
});

test('FieldViewModel required/visible/readonly wrap engine signals', () => {
    const reqSig = rt.signal(false);
    const visSig = rt.signal(true);
    const roSig = rt.signal(false);
    const deps = makeMinimalDeps({
        getRequired: () => reqSig,
        getVisible: () => visSig,
        getReadonly: () => roSig,
    });
    const vm = createFieldViewModel(deps);

    assert.equal(vm.required.value, false);
    assert.equal(vm.visible.value, true);
    assert.equal(vm.readonly.value, false);

    reqSig.value = true;
    visSig.value = false;
    roSig.value = true;

    assert.equal(vm.required.value, true);
    assert.equal(vm.visible.value, false);
    assert.equal(vm.readonly.value, true);
});

test('FieldViewModel errors with locale-resolved messages', () => {
    const errorsSig = rt.signal([
        { path: 'email', severity: 'error', constraintKind: 'required', code: 'REQUIRED', message: 'This field is required' },
    ]);
    const deps = makeMinimalDeps({ getErrors: () => errorsSig });
    const vm = createFieldViewModel(deps);

    // Without locale, uses inline message
    assert.equal(vm.firstError.value, 'This field is required');

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: { 'email.errors.REQUIRED': 'Ce champ est obligatoire' },
    });
    deps.localeStore.setLocale('fr');

    assert.equal(vm.firstError.value, 'Ce champ est obligatoire');
});

test('FieldViewModel per-Bind constraintMessage labels only CONSTRAINT_FAILED', () => {
    // Core Phase 3 step 1a: a definition error keeps its processor-generated message.
    const errorsSig = rt.signal([
        {
            path: 'email', severity: 'error', constraintKind: 'constraint', code: 'CONSTRAINT_PARSE_ERROR',
            message: 'Constraint expression error: undefined function: bogus', constraintMessage: 'Bad email',
        },
        {
            path: 'email', severity: 'error', constraintKind: 'constraint', code: 'CONSTRAINT_FAILED',
            message: 'Bad email', constraintMessage: 'Bad email',
        },
    ]);
    const deps = makeMinimalDeps({ getErrors: () => errorsSig });
    const vm = createFieldViewModel(deps);
    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: { 'email.constraintMessage': 'Courriel invalide' },
    });
    deps.localeStore.setLocale('fr');

    assert.deepEqual(vm.errors.value.map((e) => e.message), [
        'Constraint expression error: undefined function: bogus',
        'Courriel invalide',
    ]);
});

test('FieldViewModel option labels resolve from locale', () => {
    const optSig = rt.signal([
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
    ]);
    const deps = makeMinimalDeps({ getOptions: () => optSig });
    const vm = createFieldViewModel(deps);

    assert.deepEqual(vm.options.value.map(o => o.label), ['Yes', 'No']);

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: {
            'email.options.yes.label': 'Oui',
            'email.options.no.label': 'Non',
        },
    });
    deps.localeStore.setLocale('fr');

    assert.deepEqual(vm.options.value.map(o => o.label), ['Oui', 'Non']);
});

test('FieldViewModel option labels use $optionSet fallback', () => {
    const optSig = rt.signal([
        { value: 'yes', label: 'Yes' },
    ]);
    const deps = makeMinimalDeps({
        getOptions: () => optSig,
        getOptionSetName: () => 'yesNo',
    });
    const vm = createFieldViewModel(deps);

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: {
            '$optionSet.yesNo.yes.label': 'Oui (partagé)',
        },
    });
    deps.localeStore.setLocale('fr');

    // Falls through to $optionSet level
    assert.equal(vm.options.value[0].label, 'Oui (partagé)');
});

test('FieldViewModel validation code synthesis from constraintKind', () => {
    const errorsSig = rt.signal([
        { path: 'email', severity: 'error', constraintKind: 'required', message: 'Required' },
        // Note: no `code` property — should synthesize 'REQUIRED'
    ]);
    const deps = makeMinimalDeps({ getErrors: () => errorsSig });
    const vm = createFieldViewModel(deps);

    deps.localeStore.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: '' },
        strings: { 'email.errors.REQUIRED': 'Obligatoire' },
    });
    deps.localeStore.setLocale('fr');

    assert.equal(vm.firstError.value, 'Obligatoire');
});

test('FieldViewModel setValue delegates to engine, options included', () => {
    const captured = [];
    const deps = makeMinimalDeps({
        setFieldValue: (v, options) => captured.push([v, options]),
    });
    const vm = createFieldViewModel(deps);
    vm.setValue('test@example.com');
    vm.setValue('agent@example.com', { source: 'assist' });
    assert.deepEqual(captured, [['test@example.com', undefined], ['agent@example.com', { source: 'assist' }]]);
});

test('FieldViewModel identity properties', () => {
    const deps = makeMinimalDeps();
    const vm = createFieldViewModel(deps);
    assert.equal(vm.templatePath, 'email');
    assert.equal(vm.instancePath, 'email');
    assert.equal(vm.id, 'field-email');
    assert.equal(vm.itemKey, 'email');
    assert.equal(vm.dataType, 'string');
    assert.equal(vm.disabledDisplay, 'hidden');
});

test('FieldViewModel no locale loaded falls back to inline', () => {
    const deps = makeMinimalDeps();
    const vm = createFieldViewModel(deps);
    // No locale loaded, no setLocale — should use inline values
    assert.equal(vm.label.value, 'Email Address');
    assert.equal(vm.hint.value, 'Enter your email');
    assert.equal(vm.description.value, 'Work or personal email');
});
