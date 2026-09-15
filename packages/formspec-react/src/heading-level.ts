'use client';

/** @filedesc Heading depth for nested titled groups, so a sub-section's title is a level below its section. */
import { createContext, useContext } from 'react';

/**
 * The heading depth a titled group renders at. Groups start at `h3` — the form's own title is the page's
 * heading — and each titled group puts its children one level deeper, as `<formspec-render>` does while it
 * walks (`rendering/emit-node.ts`). Stylesheets read the depth: a section (h1–h3) opens with the
 * `spacing.section` gap, a sub-section reads as a question's lead line.
 */
export const HeadingLevelContext = createContext(3);

/** The current group heading depth, capped at `h6`. */
export function useHeadingLevel(): number {
    return Math.min(useContext(HeadingLevelContext), 6);
}
