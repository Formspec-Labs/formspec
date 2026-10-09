'use client';

/** @filedesc FormspecScreener — standalone eligibility gate component. */
import React, { useId } from 'react';
import { screenerOptionLocaleKey } from '@formspec-org/engine/render';
import type { FormItem } from '@formspec-org/types';
import { useScreener, itemDataType, itemOptions, isItemRequired } from './use-screener';
import type {
  UseScreenerOptions,
  ScreenerRoute,
  ScreenerDocumentInput,
  ScreenerAnswers,
  ScreenerFieldValue,
} from './types';

export interface FormspecScreenerProps extends UseScreenerOptions {
  /** Render prop for the external route result. */
  renderExternalRoute?: (route: ScreenerRoute) => React.ReactNode;
  /** Render prop for the "no match" result. */
  renderNoMatch?: () => React.ReactNode;
  /** CSS className on the root container. */
  className?: string;
}

export function FormspecScreener({
  screenerDocument,
  renderExternalRoute,
  renderNoMatch,
  className,
  ...options
}: FormspecScreenerProps) {
  const screener = useScreener({ ...options, screenerDocument });
  const { chrome, text, direction, localeFinding, translationWarnings } = screener.presentation;
  const items = screener.items;
  const fieldIdPrefix = useId();

  if (!screenerDocument) return null;
  if (localeFinding) return <p role="alert" data-locale-finding={localeFinding}>{chrome('screener.localeFailed')}</p>;

  if (screener.routeResult?.routeType === 'external') {
    if (renderExternalRoute) {
      return <>{renderExternalRoute(screener.routeResult.route)}</>;
    }
    return (
      <div className={cls('formspec-screener-routed', className)}>
        <h2 className="formspec-screener-heading">{screener.routeResult.route.label || chrome('screener.externalDefault')}</h2>
        {screener.routeResult.route.target && (
          <p className="formspec-screener-routed-target">{screener.routeResult.route.target}</p>
        )}
        <button
          type="button"
          className="formspec-screener-continue"
          onClick={screener.restart}
        >
          {chrome('screener.restart')}
        </button>
      </div>
    );
  }

  if (screener.routeResult?.routeType === 'none') {
    if (renderNoMatch) return <>{renderNoMatch()}</>;
    return (
      <div className={cls('formspec-screener-routed', className)}>
        <h2 className="formspec-screener-heading">{chrome('screener.noMatchTitle')}</h2>
        <p className="formspec-screener-routed-target">{chrome('screener.noMatchBody')}</p>
        <button
          type="button"
          className="formspec-screener-continue"
          onClick={screener.restart}
        >
          {chrome('screener.restart')}
        </button>
      </div>
    );
  }

  if ((options.onDetermination && screener.state === 'routed') || screener.routeResult?.routeType === 'internal' || screener.skipped) {
    return null;
  }

  return (
    <div className={cls('formspec-screener', className)} dir={options.onDetermination || options.activeLocale !== undefined || options.localeDocuments !== undefined ? direction : undefined}>
      <h2 className="formspec-screener-heading">{text('$form.title', screenerDocument.title || chrome('screener.titleDefault'), screener.answers)}</h2>
      {screenerDocument.description && (
        <p className="formspec-screener-intro">{text('$form.description', screenerDocument.description, screener.answers)}</p>
      )}
      {translationWarnings.length > 0 && <p role="status" data-locale-warnings={JSON.stringify(translationWarnings)}>{chrome('screener.translationWarning')}</p>}
      <div className="formspec-screener-fields">
        {items.map((item) => (
          <ScreenerField
            key={item.key}
            fieldIdPrefix={fieldIdPrefix}
            presentation={screener.presentation}
            explicitBoolean={!!options.onDetermination}
            item={item}
            screener={screenerDocument}
            answers={screener.answers}
            value={screener.answers[item.key]}
            error={screener.errors[item.key]}
            onChange={(val) => screener.setAnswer(item.key, val)}
          />
        ))}
      </div>
      {screener.errors.$completion && <p role="alert" data-finding={screener.errors.$completion}>{chrome('screener.completionFailed')}</p>}
      <button
        type="button"
        className="formspec-screener-continue"
        onClick={screener.submit}
      >
        {chrome('screener.submit', undefined, screenerDocument.submitLabel)}
      </button>
    </div>
  );
}

function ScreenerField({
  fieldIdPrefix,
  presentation,
  explicitBoolean,
  item,
  screener,
  answers,
  value,
  error,
  onChange,
}: {
  fieldIdPrefix: string;
  presentation: import('./use-screener-text').ScreenerPresentationText;
  explicitBoolean: boolean;
  item: FormItem;
  screener: ScreenerDocumentInput;
  answers: ScreenerAnswers;
  value: ScreenerFieldValue | undefined;
  error?: string;
  onChange: (val: ScreenerFieldValue | undefined) => void;
}) {
  const { chrome, text } = presentation;
  const label = text(`${item.key}.label`, item.label ?? item.key, answers, item.key);
  const id = `${fieldIdPrefix}-${item.key}`;
  const showError = !!error;
  const dt = itemDataType(item);
  const required = isItemRequired(item, screener, answers);

  const renderInput = () => {
    switch (dt) {
      case 'boolean':
        if (explicitBoolean) return <>
          <label htmlFor={id}>{label}{required && <span className="formspec-required" aria-hidden="true">*</span>}</label>
          <select id={id} value={value === true ? 'yes' : value === false ? 'no' : ''} aria-invalid={showError}
            onChange={e => onChange(e.target.value === '' ? undefined : e.target.value === 'yes')}>
            <option value="">{chrome('select.placeholder')}</option><option value="yes">{chrome('screener.yes')}</option><option value="no">{chrome('screener.no')}</option>
          </select>
        </>;
        return (
          <div className="formspec-field--inline">
            <input
              id={id}
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              aria-invalid={showError}
            />
            <label htmlFor={id}>{label}</label>
          </div>
        );

      case 'choice':
        return (
          <>
            <label htmlFor={id}>
              {label}
              {required && <span className="formspec-required" aria-hidden="true">*</span>}
            </label>
            <select
              id={id}
              value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={showError}
            >
              <option value="" disabled hidden>{chrome('select.placeholder')}</option>
              {itemOptions(item).map((c) => (
                <option key={String(c.value ?? c)} value={String(c.value ?? c)}>
                  {text(screenerOptionLocaleKey(item.key, String(c.value ?? c)), c.label ?? String(c.value ?? c), answers, item.key)}
                </option>
              ))}
            </select>
          </>
        );

      case 'integer':
      case 'decimal':
        return (
          <>
            <label htmlFor={id}>
              {label}
              {required && <span className="formspec-required" aria-hidden="true">*</span>}
            </label>
            <input
              id={id}
              type="number"
              step={dt === 'decimal' ? 'any' : '1'}
              value={value === null || value === undefined ? '' : Number(value)}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
              aria-invalid={showError}
            />
          </>
        );

      case 'money': {
        const moneyItem = item as FormItem & { currency?: string };
        return (
          <>
            <label htmlFor={id}>
              {label}
              {required && <span className="formspec-required" aria-hidden="true">*</span>}
            </label>
            <div className="formspec-money-field">
              <span className="formspec-money-currency">{moneyItem.currency || 'USD'}</span>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                value={
                  typeof value === 'object' && value !== null && !Array.isArray(value)
                    ? String((value as { amount?: number }).amount ?? '')
                    : typeof value === 'string' || typeof value === 'number'
                      ? String(value)
                      : ''
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  onChange(
                    raw === ''
                      ? null
                      : { amount: Number(raw), currency: moneyItem.currency || 'USD' },
                  );
                }}
                aria-invalid={showError}
              />
            </div>
          </>
        );
      }

      case 'text':
      case 'string':
      default:
        return (
          <>
            <label htmlFor={id}>
              {label}
              {required && <span className="formspec-required" aria-hidden="true">*</span>}
            </label>
            <input
              id={id}
              type="text"
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={showError}
            />
          </>
        );
    }
  };

  return (
    <div className="formspec-field formspec-screener-field" data-name={item.key}>
      {renderInput()}
      {showError && (
        <p className="formspec-error" aria-live="polite">{error}</p>
      )}
    </div>
  );
}

function cls(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}
