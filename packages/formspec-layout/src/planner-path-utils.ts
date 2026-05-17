/** @filedesc Definition/component path lookup helpers for the layout planner. */

import { Path } from '@formspec-org/types';
import type { ComponentTreeNode, FormItem } from './types.js';

export function componentTreeOwnsPages(tree: ComponentTreeNode | null | undefined): boolean {
    if (!tree || !Array.isArray(tree.children)) {
        return false;
    }
    return (tree.children as ComponentTreeNode[]).some((child) => child?.component === 'Page');
}

export function findItemPathByKey(items: FormItem[], key: string, prefix = ''): string | null {
    if (key.includes('.')) {
        return findItemAtPath(items, key) ? key : null;
    }
    for (const item of items) {
        const itemKey = item?.key || (item as { name?: string }).name;
        if (!itemKey) continue;
        const fullPath = prefix ? `${prefix}.${itemKey}` : itemKey;
        if (itemKey === key) {
            return fullPath;
        }
        if (Array.isArray(item.children)) {
            const nested = findItemPathByKey(item.children as FormItem[], key, fullPath);
            if (nested) return nested;
        }
    }
    return null;
}

export function findItemAtPath(items: FormItem[], path: string): FormItem | null {
    const segments = Path.parse(path).splitNormalized();
    let current: FormItem[] = items;

    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const found = current.find((item) => item?.key === segment || (item as { name?: string }).name === segment);
        if (!found) return null;
        if (index === segments.length - 1) {
            return found;
        }
        current = Array.isArray(found.children) ? (found.children as FormItem[]) : [];
    }

    return null;
}

export function getParentPath(path: string): string {
    return Path.parse(path).parentString();
}

export function findComponentNodeByPath(
    _items: FormItem[],
    rootNode: ComponentTreeNode,
    path: string,
): ComponentTreeNode | null {
    return findNodeByBindPath(rootNode, path, '');
}

export function findNodeByBindPath(
    node: ComponentTreeNode,
    targetPath: string,
    currentPrefix: string,
): ComponentTreeNode | null {
    const bindKey = node.bind as string | undefined;
    const fullPath = bindKey
        ? (currentPrefix ? `${currentPrefix}.${bindKey}` : bindKey)
        : currentPrefix;

    if (fullPath === targetPath && bindKey) {
        return node;
    }

    const children = node.children as ComponentTreeNode[] | undefined;
    if (Array.isArray(children)) {
        for (const child of children) {
            const found = findNodeByBindPath(child, targetPath, fullPath);
            if (found) return found;
        }
    }

    return null;
}
