/** @filedesc Compile-time checks for generated schema type contracts. */
import type {
  CustomComponentRef,
  CustomWidgetName,
  ComponentDocument,
  Extensions,
  FormDefinition,
  ThemeDocument,
  ThemeWidgetName,
  WidgetName,
} from './generated/index.js';

const customWidget: CustomWidgetName = 'x-camera';
const customWidgetAsDefinitionWidget: WidgetName = 'x-camera';
const customWidgetAsThemeWidget: ThemeWidgetName = 'x-camera';
const noThemeWidget: ThemeWidgetName = 'none';
const customComponent: CustomComponentRef = { component: 'AddressBlock' };
const generatedDefinition: FormDefinition = {
  $formspec: '1.0',
  url: 'urn:test:definition',
  version: '1.0.0',
  status: 'draft',
  title: 'Test',
  items: [],
  'x-acme': { owner: 'forms' },
};
const generatedComponent: ComponentDocument = {
  $formspecComponent: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:definition' },
  tree: { component: 'Text', text: 'Hello' },
  'x-acme': true,
};
const generatedComponentWithReferenceFields: ComponentDocument = {
  $formspecComponent: '1.1',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:definition' },
  tree: {
    component: 'TextInput',
    bind: 'name',
    unitRef: 'identity',
    taskRefs: ['identifyApplicant'],
    conceptRefs: [{ id: 'personName', source: 'registry' }],
    'x-generation': {
      source: 'unit:identity',
      strategy: 'unit-to-section',
      generatedBy: 'formspec-types-test',
      generatedAt: '2026-05-22T00:00:00Z',
      anchors: ['unit:identity', 'task:identifyApplicant'],
    },
  },
};
const generatedTheme: ThemeDocument = {
  $formspecTheme: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:definition' },
  'x-acme': true,
};
const generatedThemeWithWidget: ThemeDocument = {
  ...generatedTheme,
  items: { name: { widget: 'TextInput' } },
};
const generatedDefinitionExtensions: FormDefinition = {
  ...generatedDefinition,
  extensions: { 'x-acme': true },
};
const generatedThemeExtensions: ThemeDocument = {
  ...generatedTheme,
  extensions: { 'x-acme': true },
};
const extensions: Extensions = { 'x-acme': true };

// @ts-expect-error Custom widgets must use the x-* extension prefix.
const badCustomWidget: CustomWidgetName = 'camera';

// @ts-expect-error Lowercase widget aliases are not part of the greenfield contract.
const badDefinitionWidget: WidgetName = 'dropdown';

// @ts-expect-error Custom component references are PascalCase, not x-* extension names.
const badCustomComponent: CustomComponentRef = { component: 'x-address' };

// @ts-expect-error Theme widgets must use canonical PascalCase names or x-* custom widgets.
const badThemeItemWidget: ThemeDocument = { ...generatedTheme, items: { name: { widget: 'textInput' } } };

// @ts-expect-error Generated Definition roots are closed except for x-* extensions.
const badDefinitionRoot: FormDefinition = { ...generatedDefinition, acme: true };

// @ts-expect-error Generated Component roots are closed except for x-* extensions.
const badComponentRoot: ComponentDocument = { ...generatedComponent, acme: true };

// @ts-expect-error Generated Theme roots are closed except for x-* extensions.
const badThemeRoot: ThemeDocument = { ...generatedTheme, acme: true };

// @ts-expect-error Definition document extension objects only accept x-* keys.
const badDefinitionExtensions: FormDefinition = { ...generatedDefinition, extensions: { acme: true } };

// @ts-expect-error Theme document extension objects only accept x-* keys.
const badThemeExtensions: ThemeDocument = { ...generatedTheme, extensions: { acme: true } };

// @ts-expect-error Extension objects only accept x-* keys.
const badExtensions: Extensions = { acme: true };

void customWidget;
void customWidgetAsDefinitionWidget;
void customWidgetAsThemeWidget;
void noThemeWidget;
void customComponent;
void generatedDefinition;
void generatedComponent;
void generatedComponentWithReferenceFields;
void generatedTheme;
void generatedThemeWithWidget;
void generatedDefinitionExtensions;
void generatedThemeExtensions;
void extensions;
void badCustomWidget;
void badDefinitionWidget;
void badCustomComponent;
void badThemeItemWidget;
void badDefinitionRoot;
void badComponentRoot;
void badThemeRoot;
void badDefinitionExtensions;
void badThemeExtensions;
void badExtensions;
