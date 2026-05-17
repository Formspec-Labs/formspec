/** @filedesc Shared types for the FormspecNode renderer tree. */
import type { ReactNode } from 'react';
import type { LayoutNode } from '@formspec-org/layout';

export type NodeRenderer = (node: LayoutNode) => ReactNode;
