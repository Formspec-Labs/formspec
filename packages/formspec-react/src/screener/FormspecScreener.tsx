'use client';

/** @filedesc FormspecScreener — standalone eligibility gate component. */
import React from 'react';
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
  const items = screener.items;

  if (!screenerDocument) return null;

  if (screener.routeResult?.routeType === 'external') {
    if (renderExternalRoute) {
      return <>{renderExternalRoute(screener.routeResult.route)}</>;
    }
    return (
      <div className={cls('formspec-screener-routed', className)}>
        <h2 className="formspec-screener-heading">{screener.routeResult.route.label || 'Not Eligible'}</h2>
        {screener.routeResult.route.target && (
          <p className="formspec-screener-routed-target">{screener.routeResult.route.target}</p>
        )}
        <button
          type="button"
          className="formspec-screener-continue"
          onClick={screener.restart}
        >
          Start Over
        </button>
      </div>
    );
  }

  if (screener.routeResult?.routeType === 'none') {
    if (renderNoMatch) return <>{renderNoMatch()}</>;
    return (
      <div className={cls('formspec-screener-routed', className)}>
        <h2 className="formspec-screener-heading">No matching route</h2>
        <p className="formspec-screener-routed-target">No matching eligibility route was found.</p>
        <button
          type="button"
          className="formspec-screener-continue"
          onClick={screener.restart}
        >
          Start Over
        </button>
      </div>
    );
  }

  if (screener.routeResult?.routeType === 'internal' || screener.skipped) {
    return null;
  }

  return (
    <div className={cls('formspec-screener', className)}>
      <h2 className="formspec-screener-heading">{screenerDocument.title || 'Eligibility Check'}</h2>
      {screenerDocument.description && (
        <p className="formspec-screener-intro">{screenerDocument.description}</p>
      )}
      <div className="formspec-screener-fields">
        {items.map((item) => (
          <ScreenerField
            key={item.key}
            item={item}
            screener={screenerDocument}
            answers={screener.answers}
            value={screener.answers[item.key]}
            error={screener.errors[item.key]}
            onChange={(val) => screener.setAnswer(item.key, val)}
          />
        ))}
      </div>
      <button
        type="button"
        className="formspec-screener-continue"
        onClick={screener.submit}
      >
        {screenerDocument.submitLabel || 'Check Eligibility'}
      </button>
    </div>
  );
}

function ScreenerField({
  item,
  screener,
  answers,
  value,
  error,
  onChange,
}: {
  item: FormItem;
  screener: ScreenerDocumentInput;
  answers: ScreenerAnswers;
  value: ScreenerFieldValue | undefined;
  error?: string;
  onChange: (val: ScreenerFieldValue | undefined) => void;
}) {
  const id = `screener-${item.key}`;
  const showError = !!error;
  const dt = itemDataType(item);
  const required = isItemRequired(item, screener, answers);

  const renderInput = () => {
    switch (dt) {
      case 'boolean':
        return (
          <div className="formspec-field--inline">
            <input
              id={id}
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              aria-invalid={showError}
            />
            <label htmlFor={id}>{item.label}</label>
          </div>
        );

      case 'choice':
        return (
          <>
            <label htmlFor={id}>
              {item.label}
              {required && <span className="formspec-required" aria-hidden="true">*</span>}
            </label>
            <select
              id={id}
              value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={showError}
            >
              <option value="" disabled hidden>Select…</option>
              {itemOptions(item).map((c) => (
                <option key={String(c.value ?? c)} value={String(c.value ?? c)}>
                  {c.label ?? String(c.value ?? c)}
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
              {item.label}
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
              {item.label}
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
              {item.label}
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
