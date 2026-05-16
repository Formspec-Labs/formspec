'use client';

/** @filedesc Tabs layout component — WAI-ARIA tabbed panel navigation with keyboard support. */
import React, { useState, useRef, useCallback } from 'react';
import type { LayoutComponentProps } from '../../component-map';

/**
 * Tabs layout component.
 *
 * Renders a tab bar and tab panels following the WAI-ARIA Tabs pattern.
 * Supports top/bottom tab position, keyboard navigation (Arrow/Home/End),
 * and automatic activation on arrow key press.
 *
 * Tab labels are read from child LayoutNode metadata (fieldItem.label, props.title,
 * or "Tab N" fallback). All panels remain mounted; inactive panels are hidden via
 * the HTML `hidden` attribute to preserve component state across tab switches.
 */
export function Tabs({ node, children }: LayoutComponentProps) {
    const defaultTab = (node.props?.defaultTab as number) ?? 0;
    const [activeTab, setActiveTabRaw] = useState(defaultTab);
    const tabCount = node.children.length;
    const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const id = node.id || 'tabs';
    const position: 'top' | 'bottom' | 'left' | 'right' = (node.props?.position as 'top' | 'bottom' | 'left' | 'right') || 'top';
    const ariaLabel = (node.props?.['aria-label'] as string)
        || node.fieldItem?.label
        || 'Tabs';

    const setActiveTab = useCallback((nextIndex: number) => {
        const bounded = Math.max(0, Math.min(tabCount - 1, nextIndex));
        setActiveTabRaw(bounded);
        // Focus the target tab button (WAI-ARIA automatic activation)
        setTimeout(() => buttonRefs.current[bounded]?.focus(), 0);
    }, [tabCount]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        let nextIndex: number | undefined;
        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                nextIndex = (activeTab + 1) % tabCount;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                nextIndex = (activeTab - 1 + tabCount) % tabCount;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = tabCount - 1;
                break;
        }
        if (nextIndex !== undefined) {
            event.preventDefault();
            setActiveTab(nextIndex);
        }
    }, [activeTab, tabCount, setActiveTab]);

    // Spec: tabLabels prop takes precedence, then derive from child metadata
    const explicitLabels = node.props?.tabLabels as string[] | undefined;
    const tabLabels: string[] = node.children.map((child, idx) =>
        explicitLabels?.[idx]
        || (child.fieldItem?.label as string)
        || (child.props?.title as string)
        || (child.props?.label as string)
        || `Tab ${idx + 1}`,
    );

    const renderedChildren = React.Children.toArray(children);

    const tabBar = (
        <div
            role="tablist"
            aria-label={ariaLabel}
            aria-orientation={position === 'left' || position === 'right' ? 'vertical' : undefined}
            className="formspec-tab-bar"
            onKeyDown={handleKeyDown}
        >
            {tabLabels.map((label, idx) => {
                const isActive = idx === activeTab;
                return (
                    <button
                        key={idx}
                        type="button"
                        className={isActive ? 'formspec-tab formspec-tab--active' : 'formspec-tab'}
                        ref={(el: HTMLButtonElement | null) => { buttonRefs.current[idx] = el; }}
                        role="tab"
                        id={`tab-${id}-${idx}`}
                        aria-selected={isActive}
                        aria-controls={`panel-${id}-${idx}`}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => setActiveTab(idx)}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );

    const panels = (
        <div className="formspec-tab-panels">
            {tabLabels.map((_, idx) => {
                const isActive = idx === activeTab;
                return (
                    <div
                        key={idx}
                        role="tabpanel"
                        id={`panel-${id}-${idx}`}
                        aria-labelledby={`tab-${id}-${idx}`}
                        tabIndex={0}
                        hidden={!isActive}
                        className="formspec-tab-panel"
                    >
                        {renderedChildren[idx]}
                    </div>
                );
            })}
        </div>
    );

    const cssClass = node.cssClasses?.join(' ') || 'formspec-tabs';
    const style = node.style as React.CSSProperties | undefined;

    return (
        <div
            className={cssClass}
            style={{
                ...style,
                ...(position === 'left' || position === 'right' ? { display: 'flex', flexDirection: 'row' } : {}),
            }}
            data-position={position !== 'top' ? position : undefined}
        >
            {position === 'bottom' || position === 'right' ? (
                <>
                    {panels}
                    {tabBar}
                </>
            ) : (
                <>
                    {tabBar}
                    {panels}
                </>
            )}
        </div>
    );
}
