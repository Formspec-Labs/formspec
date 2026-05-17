/** @filedesc FormViewModel — form-level locale-resolved reactive state. */

import type { EngineReactiveRuntime, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleStore } from './locale.js';
import { interpolateMessage } from './interpolate-message.js';

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
  /** Evaluates a FEL expression in the form-level (global) context */
  evalFEL: (expr: string) => import('./wasm-bridge-runtime.js').FelEvalResult | unknown;
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
    evalFEL,
    getValidationCounts,
    getIsValid,
  } = deps;

  const pageTitleCache = new Map<string, ReadonlyEngineSignal<string>>();
  const pageDescCache = new Map<string, ReadonlyEngineSignal<string>>();

  function resolveString(
    key: string,
    fallback: string | undefined,
    evaluate: (expr: string) => unknown,
  ): string {
    // Read version to subscribe to locale changes
    localeStore.version.value;
    const localized = localeStore.lookupKey(key);
    const raw = localized ?? fallback ?? '';
    const { text } = interpolateMessage(raw, evaluate);
    return text;
  }

  const title = rx.computed(() =>
    resolveString('$form.title', getDefinitionTitle(), evalFEL),
  );

  const description = rx.computed(() =>
    resolveString('$form.description', getDefinitionDescription(), evalFEL),
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
          resolveString(`$page.${pageId}.title`, getPageTitle(pageId), evalFEL),
        );
        pageTitleCache.set(pageId, sig);
      }
      return sig;
    },

    pageDescription(pageId: string): ReadonlyEngineSignal<string> {
      let sig = pageDescCache.get(pageId);
      if (!sig) {
        sig = rx.computed(() =>
          resolveString(
            `$page.${pageId}.description`,
            getPageDescription(pageId),
            evalFEL,
          ),
        );
        pageDescCache.set(pageId, sig);
      }
      return sig;
    },

    isValid,
    validationSummary,
  };
}
