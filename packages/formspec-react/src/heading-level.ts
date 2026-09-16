'use client';

/** @filedesc Heading depth for nested titled groups, so a sub-section's title is a level below its section. */
import { createContext, useContext } from 'react';

/**
 * The heading depth a titled group renders at. Groups start at the root depth — `3` unless the form is
 * given another, one below the heading the page places above it — and each titled group puts its children
 * one level deeper, as `<formspec-render>` does while it walks (`rendering/emit-node.ts`). A titled group at
 * the root depth is a section (`formspec-group--section`), which the skins space apart from the groups
 * inside it; that is structural, so the same group is a section whatever depth the form started at.
 */
export const HeadingLevelContext = createContext(3);

/** The depth the form's sections render at — what the root `HeadingLevelContext` value was. */
export const RootHeadingLevelContext = createContext(3);

/** The current group heading depth, capped at `h6`. */
export function useHeadingLevel(): number {
    return Math.min(useContext(HeadingLevelContext), 6);
}

/** Whether a titled group at the current depth is one of the form's sections. */
export function useIsSection(): boolean {
    return useContext(HeadingLevelContext) === useContext(RootHeadingLevelContext);
}
