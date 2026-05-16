'use client';

/** @filedesc FormspecForm — auto-renderer that walks LayoutNode tree into React elements. */
import React, { useState, useCallback, useLayoutEffect, useRef } from 'react';
import { buildPlatformTheme, emitMergedThemeCssVars } from '@formspec-org/layout';
const defaultThemeJson = buildPlatformTheme();
import { FormspecProvider } from './context';
import type { FormspecProviderProps } from './context';
import { useFormspecContext } from './context';
import { FormspecNode } from './node-renderer';
import { FormspecScreener } from './screener/FormspecScreener';
import type { ScreenerRoute, ScreenerRouteType } from './screener/types';

/** Match `<formspec-render>`: emit theme + component tokens on `.formspec-container` so CSS variables resolve the same as the web component (e.g. radio group border). */
function syncSystemAppearanceClass(el: HTMLDivElement | null, systemPrefersDark: boolean): void {
    if (!el) return;
    const hasExplicitLight = el.classList.contains('formspec-appearance-light');
    const hasExplicitDark = el.classList.contains('formspec-appearance-dark');
    if (hasExplicitLight || hasExplicitDark) return;
    el.classList.toggle('formspec-appearance-dark', systemPrefersDark);
}

function useEmitThemeTokensOnFormspecContainerRef(): React.RefObject<HTMLDivElement | null> {
    const ref = useRef<HTMLDivElement>(null);
    const { themeDocument, componentDocument } = useFormspecContext();

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const effectiveTheme = themeDocument ?? defaultThemeJson;
        const themeTokens = (effectiveTheme as { tokens?: Record<string, string | number> }).tokens;
        emitMergedThemeCssVars(el, {
            themeTokens: themeTokens || {},
            componentTokens: componentDocument?.tokens,
        });
        return () => {
            for (let i = el.style.length - 1; i >= 0; i--) {
                const prop = el.style[i];
                if (prop.startsWith('--formspec-')) {
                    el.style.removeProperty(prop);
                }
            }
        };
    }, [themeDocument, componentDocument]);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

        const colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        const syncAppearance = () => {
            syncSystemAppearanceClass(el, colorSchemeMedia.matches);
        };

        syncAppearance();

        if (typeof colorSchemeMedia.addEventListener === 'function') {
            colorSchemeMedia.addEventListener('change', syncAppearance);
            return () => colorSchemeMedia.removeEventListener('change', syncAppearance);
        }

        colorSchemeMedia.addListener(syncAppearance);
        return () => colorSchemeMedia.removeListener(syncAppearance);
    });

    return ref;
}

export interface FormspecFormProps extends Omit<FormspecProviderProps, 'children'> {
    /** Optional className on the root container. */
    className?: string;
    /** Standalone Screener Document. */
    screenerDocument?: any;
    /** When true, bypass the screener gate entirely. */
    skipScreener?: boolean;
    /** Pre-fill answers for the screener fields. */
    screenerSeedAnswers?: Record<string, any>;
    /** Render prop for the external route result in the screener. */
    renderExternalRoute?: (route: ScreenerRoute) => React.ReactNode;
    /** Render prop for the "no match" result in the screener. */
    renderNoMatch?: () => React.ReactNode;
    /** Callback when the screener determines a route. */
    onScreenerRoute?: (route: ScreenerRoute, routeType: ScreenerRouteType, answers: Record<string, any>) => void;
}

/**
 * Drop-in auto-renderer: takes a definition and renders the full form.
 *
 * Wraps itself in a FormspecProvider, plans the layout, and renders
 * each LayoutNode through the component map.
 *
 * When the definition contains a screener, the screener gate is rendered first.
 * Once the screener routes internally (or is skipped), the form is shown.
 */
export function FormspecForm({
    definition,
    className,
    screenerDocument,
    skipScreener,
    screenerSeedAnswers,
    renderExternalRoute,
    renderNoMatch,
    onScreenerRoute,
    ...providerProps
}: FormspecFormProps) {
    const hasScreener = !skipScreener && hasActiveScreenerDoc(screenerDocument);

    const [screenerDone, setScreenerDone] = useState(!hasScreener);

    const handleRoute = useCallback(
        (route: ScreenerRoute, routeType: ScreenerRouteType, answers: Record<string, any>) => {
            if (routeType === 'internal') {
                setScreenerDone(true);
            }
            onScreenerRoute?.(route, routeType, answers);
        },
        [onScreenerRoute],
    );

    // If the screener is active and not yet resolved, render it standalone
    if (hasScreener && !screenerDone) {
        return (
            <FormspecProvider definition={definition} {...providerProps}>
                <ScreenerGate
                    screenerDocument={screenerDocument}
                    className={className}
                    seedAnswers={screenerSeedAnswers}
                    renderExternalRoute={renderExternalRoute}
                    renderNoMatch={renderNoMatch}
                    onRoute={handleRoute}
                    onSkip={() => setScreenerDone(true)}
                />
            </FormspecProvider>
        );
    }

    return (
        <FormspecProvider definition={definition} {...providerProps}>
            <FormspecFormInner className={className} />
        </FormspecProvider>
    );
}

/**
 * Screener gate rendered inside a FormspecProvider so it has access to the engine.
 * When the screener component returns null (internal route or skip), we notify the
 * parent to flip to form rendering.
 */
function ScreenerGate({
    screenerDocument,
    className,
    seedAnswers,
    renderExternalRoute,
    renderNoMatch,
    onRoute,
    onSkip,
}: {
    screenerDocument?: any;
    className?: string;
    seedAnswers?: Record<string, any>;
    renderExternalRoute?: (route: ScreenerRoute) => React.ReactNode;
    renderNoMatch?: () => React.ReactNode;
    onRoute?: (route: ScreenerRoute, routeType: ScreenerRouteType, answers: Record<string, any>) => void;
    onSkip: () => void;
}) {
    const containerRef = useEmitThemeTokensOnFormspecContainerRef();

    return (
        <div
            ref={containerRef}
            className={className ? `formspec-container ${className}` : 'formspec-container'}
        >
            <FormspecScreener
                screenerDocument={screenerDocument}
                seedAnswers={seedAnswers}
                renderExternalRoute={renderExternalRoute}
                renderNoMatch={renderNoMatch}
                onRoute={(route, routeType, answers) => {
                    onRoute?.(route, routeType, answers);
                    // If the screener resolved to internal or was skipped,
                    // FormspecScreener returns null — but we also need to
                    // notify the parent so it can switch to form rendering.
                    // The parent's handleRoute already does setScreenerDone
                    // for internal routes.
                }}
            />
        </div>
    );
}

function FormspecFormInner({ className }: { className?: string }) {
    const { layoutPlan } = useFormspecContext();
    const containerRef = useEmitThemeTokensOnFormspecContainerRef();

    if (!layoutPlan) {
        const containerClass = className
            ? `formspec-container ${className}`
            : 'formspec-container';
        return (
            <div ref={containerRef} className={containerClass}>
                No layout plan available.
            </div>
        );
    }

    const containerClass = className
        ? `formspec-container ${className}`
        : 'formspec-container';

    return (
        <div ref={containerRef} className={containerClass}>
            <FormspecNode node={layoutPlan} />
        </div>
    );
}

/** Check whether a standalone screener document is active. */
function hasActiveScreenerDoc(screenerDocument: any | null | undefined): boolean {
    return (
        Boolean(screenerDocument) &&
        Array.isArray(screenerDocument?.items) &&
        screenerDocument.items.length > 0
    );
}
