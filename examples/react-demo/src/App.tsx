/** @filedesc Demo app showcasing formspec-react with zero component overrides. */
import React, { useState, useEffect, useRef } from 'react';
import { FormspecForm } from '@formspec-org/react';
import type { SubmitResult } from '@formspec-org/react';
import { createDemoSubmitResponseActions } from '@formspec-org/engine';
import definition from './definition.json';
import theme from './theme.json';
import registry from '../../../registries/formspec-common.registry.json';

const responseActionsDocument = createDemoSubmitResponseActions({
    definitionUrl: definition.url,
    actionId: 'submit-application',
});

const SOURCE_FILES = [
    { label: 'definition.json', data: definition },
    { label: 'theme.json', data: theme },
    { label: 'registry.json', data: registry },
];

function SourceModal({ onClose }: { onClose: () => void }) {
    const [active, setActive] = useState(0);
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <dialog ref={dialogRef} className="source-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="source-modal-inner">
                <div className="source-modal-header">
                    <h2 className="source-modal-title">Source JSON</h2>
                    <button className="source-modal-close" onClick={onClose} aria-label="Close">&times;</button>
                </div>
                <div className="source-tabs" role="tablist">
                    {SOURCE_FILES.map((f, i) => (
                        <button
                            key={f.label}
                            role="tab"
                            aria-selected={i === active}
                            className={`source-tab ${i === active ? 'source-tab--active' : ''}`}
                            onClick={() => setActive(i)}
                        >{f.label}</button>
                    ))}
                </div>
                <pre className="source-pre">{JSON.stringify(SOURCE_FILES[active].data, null, 2)}</pre>
            </div>
        </dialog>
    );
}

// ── App ──

export function App() {
    const [result, setResult] = useState<SubmitResult | null>(null);
    const [showSource, setShowSource] = useState(false);

    const results = result?.validationReport?.results || [];
    const errorCount = results.filter((r: any) => r.severity === 'error').length;
    const warningCount = results.filter((r: any) => r.severity === 'warning').length;

    return (
        <>
            <a href="#main-content" className="skip-link">
                Skip to main content
            </a>
            <header className="demo-header">
                <a href="/" className="demo-badge">Formspec</a>
                <h1 className="demo-header-title">React Demo</h1>
                <span className="demo-header-note">Live demo — formspec-react, zero component overrides</span>
                <button className="demo-header-source" onClick={() => setShowSource(true)}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    View Source JSON
                </button>
            </header>
            {showSource && <SourceModal onClose={() => setShowSource(false)} />}
            <div className="demo-banner" role="status">
                <span className="demo-banner-label">Demo</span>
                <span className="demo-banner-text">
                    This is a live demo of <strong>formspec-react</strong> using zero component overrides — all rendering comes from the built-in defaults.
                </span>
            </div>
            <div className="app-container">
            <header className="app-header">
                <h2 id="app-form-title" className="app-title">Generic Form</h2>
                <p className="app-subtitle">
                    A sample form demonstrating Formspec's declarative rendering, validation, FEL expressions, and theme tokens.
                    All fields marked <span className="formspec-required" aria-hidden="true">*</span> are required.
                </p>
            </header>

            <main id="main-content">
                <FormspecForm
                    className="formspec-appearance-light"
                    definition={definition}
                    themeDocument={theme}
                    registryEntries={registry.entries}
                    responseActionsDocument={responseActionsDocument}
                    onSubmit={setResult}
                />

                {result && (
                    <div className="submit-panel">
                        <div className="submit-row">
                            <span className={`status-text ${result.validationReport?.valid ? 'status-text--valid' : 'status-text--invalid'}`}>
                                {result.validationReport?.valid ? 'Valid' : `${errorCount} error(s)`}
                                {warningCount > 0 && `, ${warningCount} warning(s)`}
                            </span>
                        </div>

                        {errorCount > 0 && (
                            <div className="validation-errors">
                                <h3>Validation Errors</h3>
                                <ul>
                                    {results
                                        .filter((r: any) => r.severity === 'error')
                                        .map((r: any, i: number) => (
                                            <li key={i}>{r.path}: {r.message}</li>
                                        ))}
                                </ul>
                            </div>
                        )}

                        {warningCount > 0 && (
                            <div className="validation-warnings">
                                <h3>Warnings</h3>
                                <ul>
                                    {results
                                        .filter((r: any) => r.severity === 'warning')
                                        .map((r: any, i: number) => (
                                            <li key={i}>{r.path}: {r.message}</li>
                                        ))}
                                </ul>
                            </div>
                        )}

                        <details className="response-details">
                            <summary>Response JSON</summary>
                            <pre>{JSON.stringify(result.response, null, 2)}</pre>
                        </details>
                    </div>
                )}
            </main>

            <footer className="app-footer">
                <p>
                    Formspec React Demo — <code>examples/react-demo/</code>
                </p>
            </footer>
        </div>
        </>
    );
}
