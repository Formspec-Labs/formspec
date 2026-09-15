/** Shadow-root wrapper for web component stories when CSS isolation matters. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FormspecRender, emitThemeTokens, globalRegistry } from '@formspec-org/webcomponent';
import type { RenderAdapter } from '@formspec-org/webcomponent';
import type { StoryAppearance } from './storyAppearance';

if (!customElements.get('formspec-render')) {
    customElements.define('formspec-render', FormspecRender);
}

export interface IsolatedWebComponentStoryProps {
    definition: any;
    theme?: any;
    componentDocument?: any;
    adapter?: RenderAdapter;
    showSubmit?: boolean;
    maxWidth?: number;
    /** Optional initial field values to hydrate the engine before rendering. Must be set before definition. */
    initialData?: Record<string, any>;
    /** When true, all fields are touched on mount so validation errors display immediately. */
    touchAll?: boolean;
    /** Storybook-controlled appearance override. */
    appearance?: StoryAppearance;
}

/** The element links its own layout + adapter + theme CSS into this shadow root; only story chrome is inlined here. */
function useShadowRoot(inlineStyles: string[]) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        shadow.replaceChildren();

        inlineStyles.forEach((cssText) => {
            const style = document.createElement('style');
            style.textContent = cssText;
            shadow.appendChild(style);
        });

        const mount = document.createElement('div');
        shadow.appendChild(mount);
        setMountNode(mount);

        return () => {
            setMountNode(null);
            shadow.replaceChildren();
        };
    }, [inlineStyles]);

    return { hostRef, mountNode };
}

export function IsolatedWebComponentStory({
    definition,
    theme,
    componentDocument,
    adapter,
    showSubmit = true,
    maxWidth = 640,
    initialData,
    touchAll = false,
    appearance = 'system',
}: IsolatedWebComponentStoryProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const elementRef = useRef<FormspecRender | null>(null);

    const inlineStyles = useMemo(() => {
        const styles = [
            `
                :host {
                    display: block;
                }
                .isolated-story-root,
                .isolated-story-root *,
                .isolated-story-root *::before,
                .isolated-story-root *::after {
                    box-sizing: border-box;
                }
                .isolated-story-root {
                    display: block;
                }
            `,
        ];
        return styles;
    }, []);

    const { hostRef, mountNode } = useShadowRoot(inlineStyles);

    useEffect(() => {
        const el = elementRef.current;
        if (!el) return;
        if (appearance === 'light' || appearance === 'dark') {
            el.setAttribute('data-formspec-appearance', appearance);
        } else {
            el.removeAttribute('data-formspec-appearance');
        }
    }, [appearance, mountNode]);

    useEffect(() => {
        if (!containerRef.current) return;

        const shadowHost = hostRef.current;

        if (adapter) globalRegistry.registerAdapter(adapter);

        if (!elementRef.current) {
            const el = document.createElement('formspec-render') as FormspecRender;
            containerRef.current.appendChild(el);
            elementRef.current = el;
        }

        const el = elementRef.current;
        // Per-element override, so stories on one page do not fight over a global active adapter.
        el.adapter = adapter?.name ?? null;
        if (appearance === 'light' || appearance === 'dark') {
            el.setAttribute('data-formspec-appearance', appearance);
        } else {
            el.removeAttribute('data-formspec-appearance');
        }
        if (shadowHost) {
            shadowHost.style.cssText = '';
            if (theme?.tokens && typeof theme.tokens === 'object') {
                emitThemeTokens(theme.tokens as Record<string, string | number>, shadowHost);
            }
        }
        if (theme) el.themeDocument = theme;
        if (componentDocument) el.componentDocument = componentDocument;
        if (initialData) el.initialData = initialData;
        el.showSubmit = showSubmit;
        el.definition = definition;
        if (touchAll) {
            // Defer by one tick so the engine finishes rendering before we touch all fields
            queueMicrotask(() => el.touchAllFields?.());
        }

        return () => {
            if (elementRef.current) {
                elementRef.current.remove();
                elementRef.current = null;
            }
        };
    }, [definition, theme, componentDocument, adapter, showSubmit, mountNode, initialData, touchAll]);

    const items = Array.isArray(definition?.items) ? definition.items : [];
    const allDisplayOnly =
        items.length > 0 && items.every((it: { type?: string }) => it.type === 'display');

    const inner =
        adapter?.name === 'uswds' ? (
            <div className="isolated-story-root">
                {/* No `.usa-form` shell: the render root is the form, so wrapping it in a second one
                    would cap the story at USWDS's 20rem default instead of the adapter's own column. */}
                {definition?.title ? (
                    <h2 className={allDisplayOnly ? undefined : 'usa-sr-only'}>{definition.title}</h2>
                ) : null}
                <div ref={containerRef} />
            </div>
        ) : (
            <div className="isolated-story-root" ref={containerRef} />
        );

    return (
        <div style={{ maxWidth, margin: '0 auto' }}>
            <div ref={hostRef} />
            {mountNode ? createPortal(inner, mountNode) : null}
        </div>
    );
}
