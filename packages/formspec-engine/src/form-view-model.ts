/** @filedesc FormViewModel — form-level locale-resolved reactive state. */

import type { EngineReactiveRuntime, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleStore } from './locale.js';

export interface FormViewModel {
  readonly title: ReadonlyEngineSignal<string>;
  readonly description: ReadonlyEngineSignal<string>;
  pageTitle(pageId: string): ReadonlyEngineSignal<string>;
  pageDescription(pageId: string): ReadonlyEngineSignal<string>;
  readonly isValid: ReadonlyEngineSignal<boolean>;
  readonly validationSummary: ReadonlyEngineSignal<{
    errors: number;
    warnings: number;
    infos: number;
  }>;
}

export interface FormViewModelDeps {
  rx: EngineReactiveRuntime;
  localeStore: LocaleStore;
  /** Returns definition.title */
  getDefinitionTitle: () => string;
  /** Returns definition.description */
  getDefinitionDescription: () => string | undefined;
  /** Returns page title from theme pages array */
  getPageTitle: (pageId: string) => string | undefined;
  /** Returns page description from theme pages */
  getPageDescription: (pageId: string) => string | undefined;
  /** Resolves `{{expression}}` in the form-level (global) context (Locale §3.3.1) */
  interpolate: (template: string) => string;
  /** Returns total validation error/warning/info counts */
  getValidationCounts: () => { errors: number; warnings: number; infos: number };
  /** Returns whether form is valid (no errors) */
  getIsValid: () => boolean;
}

export function createFormViewModel(deps: FormViewModelDeps): FormViewModel {
  const {
    rx,
    localeStore,
    getDefinitionTitle,
    getDefinitionDescription,
    getPageTitle,
    getPageDescription,
    interpolate,
    getValidationCounts,
    getIsValid,
  } = deps;

  const pageTitleCache = new Map<string, ReadonlyEngineSignal<string>>();
  const pageDescCache = new Map<string, ReadonlyEngineSignal<string>>();

  function resolveString(key: string, fallback: string | undefined): string {
    // Read version to subscribe to locale changes
    localeStore.version.value;
    const localized = localeStore.lookupKey(key);
    return interpolate(localized ?? fallback ?? '');
  }

  const title = rx.computed(() =>
    resolveString('$form.title', getDefinitionTitle()),
  );

  const description = rx.computed(() =>
    resolveString('$form.description', getDefinitionDescription()),
  );

  const isValid = rx.computed(() => getIsValid());
  const validationSummary = rx.computed(() => getValidationCounts());

  return {
    title,
    description,

    pageTitle(pageId: string): ReadonlyEngineSignal<string> {
      let sig = pageTitleCache.get(pageId);
      if (!sig) {
        sig = rx.computed(() =>
          resolveString(`$page.${pageId}.title`, getPageTitle(pageId)),
        );
        pageTitleCache.set(pageId, sig);
      }
      return sig;
    },

    pageDescription(pageId: string): ReadonlyEngineSignal<string> {
      let sig = pageDescCache.get(pageId);
      if (!sig) {
        sig = rx.computed(() =>
          resolveString(`$page.${pageId}.description`, getPageDescription(pageId)),
        );
        pageDescCache.set(pageId, sig);
      }
      return sig;
    },

    isValid,
    validationSummary,
  };
}
