'use client';

/** @filedesc Default layout component — semantic HTML containers with CSS class structure. */
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
    positionPopupNearTrigger,
    clearPopupFixedPosition,
    MODAL_FIRST_FOCUSABLE_SELECTOR,
    type PopupPlacement,
} from '@formspec-org/layout';
import type { LayoutComponentProps } from '../../component-map';
import { useWhen } from '../../use-when';

/**
 * Default layout renderer — dispatches to the correct container component
 * based on node.component, applying formspec CSS classes and theme styles.
 */
export function DefaultLayout({ node, children }: LayoutComponentProps) {
    const themeClass = node.cssClasses?.join(' ') || '';
    const style = node.style as React.CSSProperties | undefined;

    switch (node.component) {
        case 'Stack':
            return <StackLayout node={node} children={children} themeClass={themeClass} style={style} />;

        case 'Grid':
        case 'Columns':
            return <GridLayout node={node} children={children} themeClass={themeClass} style={style} />;

        case 'Card':
        case 'Section':
            return <CardLayout node={node} children={children} themeClass={themeClass} style={style} />;

        case 'Divider':
            return <DividerLayout node={node} themeClass={themeClass} style={style} />;

        case 'Page':
            return <PageLayout node={node} children={children} themeClass={themeClass} style={style} />;

        case 'Collapsible':
            return <CollapsibleLayout node={node} children={children} themeClass={themeClass} style={style} />;

        case 'Accordion':
            return <AccordionLayout node={node} children={children} themeClass={themeClass} style={style} />;

        case 'Panel':
            return <PanelLayout node={node} children={children} themeClass={themeClass} style={style} />;

        case 'Modal':
            return <ModalLayout node={node} children={children} themeClass={themeClass} style={style} />;

        case 'Popover':
            return <PopoverLayout node={node} children={children} themeClass={themeClass} style={style} />;

        default:
            return <DefaultContainer node={node} children={children} themeClass={themeClass} style={style} />;
    }
}

// ── Shared prop type ──────────────────────────────────────────────

interface LayoutProps {
    node: LayoutComponentProps['node'];
    children?: React.ReactNode;
    themeClass: string;
    style?: React.CSSProperties;
}

function mergeClasses(baseClass: string, extraClasses?: string): string {
    if (!extraClasses) return baseClass;
    const parts = `${baseClass} ${extraClasses}`.trim().split(/\s+/);
    return Array.from(new Set(parts)).join(' ');
}

// ── Stack ─────────────────────────────────────────────────────────

function StackLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const direction = props.direction as string | undefined;
    const alignment = props.alignment as string | undefined;
    const wrap = props.wrap as boolean | undefined;
    const gap = (props.gap as string | undefined) ?? (style?.gap as string | undefined);

    const stackStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: direction === 'horizontal' ? 'row' : 'column',
        ...(alignment ? { alignItems: alignment } : {}),
        ...(wrap ? { flexWrap: 'wrap' } : {}),
        ...style,
        // Props gap wins over theme style gap
        ...(gap ? { gap } : {}),
    };

    // When title + bindPath: treat as a titled group section (not a card —
    // the planner emits Stack for definition groups, Card for explicit cards)
    const title = props.title as string | undefined;
    if (title && node.bindPath) {
        return (
            <section className={mergeClasses('formspec-group', themeClass)} style={node.style as React.CSSProperties}>
                <h3 className="formspec-group-title">{title}</h3>
                {children}
            </section>
        );
    }

    return (
        <div className={mergeClasses('formspec-stack', themeClass)} style={stackStyle}>
            {children}
        </div>
    );
}

// ── Grid ─────────────────────────────────────────────────────────

function GridLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const columns = props.columns;
    const gap = props.gap as string | undefined;
    const rowGap = props.rowGap as string | undefined;

    let gridTemplateColumns: string | undefined;
    if (typeof columns === 'number') {
        gridTemplateColumns = `repeat(${columns}, 1fr)`;
    } else if (typeof columns === 'string') {
        gridTemplateColumns = columns;
    } else {
        gridTemplateColumns = 'repeat(1, 1fr)';
    }

    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns,
        gap: '1rem',
        ...(rowGap ? { rowGap } : {}),
        ...style,
        // Props gap/rowGap win over theme style
        ...(gap ? { gap } : {}),
        ...(rowGap ? { rowGap } : {}),
    };

    return (
        <div className={mergeClasses('formspec-grid', themeClass)} style={gridStyle}>
            {children}
        </div>
    );
}

// ── Card / Section ────────────────────────────────────────────────

function CardLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const label = node.fieldItem?.label || (props.title as string | undefined);
    const subtitle = props.subtitle as string | undefined;
    const elevation = props.elevation as number | string | undefined;
    const headingLevel = Math.min(6, Math.max(1, (props.headingLevel as number | undefined) ?? 3));
    const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

    return (
        <section
            className={mergeClasses('formspec-card', themeClass)}
            style={style}
            {...(elevation != null ? { 'data-elevation': String(elevation) } : {})}
        >
            {label && <Heading className="formspec-card-title">{label}</Heading>}
            {subtitle && <p className="formspec-card-subtitle">{subtitle}</p>}
            {children}
        </section>
    );
}

// ── Divider ───────────────────────────────────────────────────────

function DividerLayout({ node, themeClass, style }: Omit<LayoutProps, 'children'>) {
    const label = node.props?.label as string | undefined;

    if (label) {
        return (
            <div className={mergeClasses('formspec-divider formspec-divider--labeled', themeClass)} style={style}>
                <hr />
                <span>{label}</span>
                <hr />
            </div>
        );
    }

    return <hr className={mergeClasses('formspec-divider', themeClass)} style={style} />;
}

// ── Page ─────────────────────────────────────────────────────────

function PageLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const title = props.title as string | undefined;
    const description = props.description as string | undefined;
    const headingLevel = Math.min(6, Math.max(1, (props.headingLevel as number | undefined) ?? 2));
    const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

    return (
        <section className={mergeClasses('formspec-page', themeClass)} style={style}>
            {title && <Heading>{title}</Heading>}
            {description && <p className="formspec-page-description">{description}</p>}
            {children}
        </section>
    );
}

// ── Collapsible ───────────────────────────────────────────────────

function CollapsibleLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const title = (props.title as string | undefined) ?? 'Details';
    const defaultOpen = props.defaultOpen as boolean | undefined;

    return (
        <details className={mergeClasses('formspec-collapsible', themeClass)} style={style} open={defaultOpen || false}>
            <summary>{title}</summary>
            <div className="formspec-collapsible-content">
                {children}
            </div>
        </details>
    );
}

// ── Accordion ────────────────────────────────────────────────────

function AccordionLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const labels = (props.labels as string[] | undefined) ?? [];
    const defaultOpen = props.defaultOpen as number | undefined;
    const allowMultiple = props.allowMultiple as boolean | undefined;

    const containerRef = useRef<HTMLDivElement>(null);
    const childArray = React.Children.toArray(children);

    // Single-open mode: track one open index
    const [openIndex, setOpenIndex] = useState<number | null>(
        defaultOpen != null ? defaultOpen : null
    );

    // Multi-open mode: track a set of open indices
    const [openIndices, setOpenIndices] = useState<Set<number>>(() => {
        const initial = new Set<number>();
        if (defaultOpen != null) initial.add(defaultOpen);
        return initial;
    });

    const handleToggle = useCallback((idx: number, open: boolean) => {
        if (allowMultiple) {
            setOpenIndices(prev => {
                const next = new Set(prev);
                if (open) next.add(idx);
                else next.delete(idx);
                return next;
            });
        } else {
            setOpenIndex(prev => {
                if (open) return idx;
                // Programmatically closing another <details> (when switching panels)
                // fires toggle with open=false on that element. Ignore those so they
                // do not clear the index we just set from the opening panel.
                if (prev === idx) return null;
                return prev;
            });
        }
    }, [allowMultiple]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const summaries = Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>('summary') ?? []
        );
        if (summaries.length === 0) return;
        const focused = summaries.indexOf(document.activeElement as HTMLElement);
        if (focused === -1) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            summaries[Math.min(focused + 1, summaries.length - 1)]?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            summaries[Math.max(focused - 1, 0)]?.focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            summaries[0]?.focus();
        } else if (e.key === 'End') {
            e.preventDefault();
            summaries[summaries.length - 1]?.focus();
        }
    }, []);

    return (
        <div
            ref={containerRef}
            className={mergeClasses('formspec-accordion', themeClass)}
            style={style}
            onKeyDown={handleKeyDown}
        >
            {childArray.map((child, idx) => {
                const label = labels[idx] ?? `Section ${idx + 1}`;
                const isOpen = allowMultiple ? openIndices.has(idx) : (openIndex === idx);
                return (
                    <details
                        key={idx}
                        className="formspec-accordion-item"
                        open={isOpen}
                        onToggle={(e) => handleToggle(idx, (e.currentTarget as HTMLDetailsElement).open)}
                    >
                        <summary>{label}</summary>
                        <div className="formspec-accordion-content">
                            {child}
                        </div>
                    </details>
                );
            })}
        </div>
    );
}

// ── Panel ─────────────────────────────────────────────────────────

function PanelLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const title = props.title as string | undefined;
    const position = props.position as string | undefined;
    const width = props.width as string | undefined;

    const panelStyle: React.CSSProperties = {
        ...(position === 'left' ? { order: -1 } : position === 'right' ? { order: 1 } : {}),
        ...(width ? { width } : {}),
        ...style,
    };

    return (
        <div className={mergeClasses('formspec-panel', themeClass)} style={panelStyle}>
            {title && <div className="formspec-panel-header">{title}</div>}
            <div className="formspec-panel-body">
                {children}
            </div>
        </div>
    );
}

// ── Modal ─────────────────────────────────────────────────────────

function parseModalPlacement(raw: unknown): PopupPlacement | undefined {
    if (raw === 'top' || raw === 'right' || raw === 'bottom' || raw === 'left') return raw;
    return undefined;
}

function ModalLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const title = props.title as string | undefined;
    const triggerLabel = (props.triggerLabel as string | undefined) ?? 'Open';
    const closable = props.closable !== false;
    const size = props.size as string | undefined;
    const headingLevel = Math.min(6, Math.max(1, (props.headingLevel as number | undefined) ?? 2));
    const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    const triggerMode = (props.trigger as string | undefined) || 'button';
    const placement = parseModalPlacement(props.placement);

    const dialogRef = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const titleId = node.id ? `${node.id}-title` : 'modal-title';

    const felForAuto = triggerMode === 'auto' ? (node.when || 'true') : 'false';
    const autoOpenDesired = useWhen(felForAuto, node.whenPrefix);

    const focusDialogContent = useCallback(() => {
        requestAnimationFrame(() => {
            const d = dialogRef.current;
            const first = d?.querySelector<HTMLElement>(MODAL_FIRST_FOCUSABLE_SELECTOR);
            first?.focus();
        });
    }, []);

    const openModal = useCallback(() => {
        const d = dialogRef.current;
        const t = triggerRef.current;
        if (!d) return;
        clearPopupFixedPosition(d);
        d.showModal();
        requestAnimationFrame(() => {
            if (placement && t) {
                positionPopupNearTrigger(t, d, placement);
            }
            const first = d.querySelector<HTMLElement>(MODAL_FIRST_FOCUSABLE_SELECTOR);
            first?.focus();
        });
    }, [placement]);

    const closeModal = useCallback(() => {
        dialogRef.current?.close();
    }, []);

    useLayoutEffect(() => {
        if (triggerMode !== 'auto') return;
        const d = dialogRef.current;
        if (!d) return;
        if (autoOpenDesired && !d.open) {
            clearPopupFixedPosition(d);
            d.showModal();
            focusDialogContent();
        } else if (!autoOpenDesired && d.open) {
            d.close();
        }
    }, [triggerMode, autoOpenDesired, focusDialogContent]);

    const handleDialogClick = useCallback(
        (e: React.MouseEvent<HTMLDialogElement>) => {
            if (closable && e.target === dialogRef.current) {
                closeModal();
            }
        },
        [closable, closeModal],
    );

    useEffect(() => {
        if (!placement) return;
        const reposition = () => {
            const d = dialogRef.current;
            const t = triggerRef.current;
            if (d?.open && t) positionPopupNearTrigger(t, d, placement);
        };
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [placement]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const onClose = () => {
            clearPopupFixedPosition(dialog);
            triggerRef.current?.focus();
        };
        dialog.addEventListener('close', onClose);
        return () => dialog.removeEventListener('close', onClose);
    }, []);

    return (
        <>
            {triggerMode === 'button' && (
                <button
                    type="button"
                    className="formspec-modal-trigger formspec-focus-ring"
                    ref={triggerRef}
                    onClick={openModal}
                >
                    {triggerLabel}
                </button>
            )}
            <dialog
                ref={dialogRef}
                className={mergeClasses('formspec-modal', themeClass)}
                style={style}
                aria-labelledby={title ? titleId : undefined}
                aria-label={title ? undefined : triggerLabel}
                {...(size ? { 'data-size': size } : {})}
                onClick={handleDialogClick}
            >
                {closable && (
                    <button
                        type="button"
                        className="formspec-modal-close formspec-focus-ring"
                        aria-label="Close"
                        onClick={closeModal}
                    >
                        <span aria-hidden="true">×</span>
                    </button>
                )}
                {title && (
                    <Heading className="formspec-modal-title" id={titleId}>{title}</Heading>
                )}
                <div className="formspec-modal-content">
                    {children}
                </div>
            </dialog>
        </>
    );
}

// ── Popover ───────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusables(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function PopoverLayout({ node, children, themeClass, style }: LayoutProps) {
    const props = node.props ?? {};
    const triggerLabel = (props.triggerLabel as string | undefined) ?? 'Open';
    const title = props.title as string | undefined;

    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const close = useCallback(() => {
        setOpen(false);
        triggerRef.current?.focus();
    }, []);

    const toggle = useCallback(() => setOpen(v => {
        const next = !v;
        return next;
    }), []);

    // When opening: move focus into content container
    useEffect(() => {
        if (!open || !contentRef.current) return;
        const focusables = getFocusables(contentRef.current);
        if (focusables.length > 0) {
            focusables[0].focus();
        } else {
            contentRef.current.focus();
        }
    }, [open]);

    // Dismiss on outside click
    useEffect(() => {
        if (!open) return;
        const onClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                close();
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open, close]);

    // Focus trap + Escape dismiss
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
            return;
        }
        if (e.key !== 'Tab' || !contentRef.current) return;

        const focusables = getFocusables(contentRef.current);
        if (focusables.length === 0) {
            e.preventDefault();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first || document.activeElement === contentRef.current) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }, [close]);

    return (
        <div
            ref={wrapperRef}
            className={mergeClasses('formspec-popover', themeClass)}
            style={style}
        >
            <button
                type="button"
                className="formspec-popover-trigger"
                ref={triggerRef}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={toggle}
            >
                {triggerLabel}
            </button>
            <div
                ref={contentRef}
                className="formspec-popover-content"
                role="dialog"
                aria-label={title ?? triggerLabel}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                hidden={!open}
            >
                {children}
            </div>
        </div>
    );
}

// ── Generic fallback ──────────────────────────────────────────────

function DefaultContainer({ node, children, themeClass, style }: LayoutProps) {
    return (
        <div
            className={mergeClasses(`formspec-${node.component.toLowerCase()}`, themeClass)}
            style={style}
        >
            {children}
        </div>
    );
}
