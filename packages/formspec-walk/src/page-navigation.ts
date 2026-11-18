/** @filedesc Move to the adjacent rendered page and verify that its panel becomes active. */
import type { Locator } from '@playwright/test';
import type { UI_STRINGS } from '@formspec-org/layout';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const outer = ':not([role="tabpanel"] *, .formspec-wizard-panel *, .formspec-workspace *)';
const visible = { state: 'visible', timeout: 1500 } as const;

/** React mounts one wizard panel, while the web renderer and tabs retain their other panels. */
export function pagePosition(panels: Locator) {
    return panels.evaluateAll(nodes => {
        const current = nodes.findIndex(panel => panel.checkVisibility());
        const step = (nodes[current] as HTMLElement | undefined)?.dataset;
        return {
            index: Number(step?.stepIndex ?? current), count: Number(step?.stepCount ?? nodes.length),
            indexedPanel: step?.stepIndex !== undefined,
        };
    });
}

async function stepTab(root: Locator, list: Locator, delta: number): Promise<boolean> {
    const tabs = list.getByRole('tab');
    const positions = await tabs.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-selected') === 'true'));
    const current = positions.indexOf(true);
    if (current < 0 || current !== positions.lastIndexOf(true)) throw new Error('The tab list must have one selected tab');
    const next = current + delta;
    if (next < 0 || next >= positions.length) return false;
    const tab = tabs.nth(next);
    const id = await tab.getAttribute('aria-controls');
    if (!id || await tab.isDisabled()) throw new Error(`The tab at position ${next + 1} has no available panel`);
    await tab.click();
    try {
        await tab.and(list.locator('[aria-selected="true"]')).waitFor(visible);
        await root.locator(`[role="tabpanel"][id=${JSON.stringify(id)}]`).waitFor(visible);
    } catch {
        throw new Error(`The tab at position ${next + 1} did not activate its panel`);
    }
    return true;
}

export async function stepPage(
    root: Locator,
    direction: 'next' | 'previous',
    chrome: (key: keyof typeof UI_STRINGS) => string,
): Promise<boolean> {
    const delta = direction === 'next' ? 1 : -1;
    const list = root.locator(`[role="tablist"]${outer}`).filter({ visible: true });
    if (await list.count()) return stepTab(root, list, delta);

    const keys = direction === 'next' ? ['wizard.next', 'wizard.nextStep'] : ['wizard.previous', 'wizard.previousStep'];
    const names = keys.map(k => escapeRe(chrome(k as keyof typeof UI_STRINGS))).join('|');
    const nav = root.locator('.formspec-workspace__previous-next, .formspec-wizard-nav');
    const button = nav.getByRole('button', { name: new RegExp(`^(${names})$`, 'i') });
    if (!await button.count() || await button.isDisabled()) return false;

    const workspace = root.locator('.formspec-workspace__content');
    let destination: Locator;
    if (await workspace.count()) {
        const current = await workspace.getAttribute('data-formspec-section');
        const ids = await root.locator('.formspec-workspace__navigation nav [data-formspec-section]')
            .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-formspec-section')));
        const index = ids.indexOf(current);
        const next = ids[index + delta];
        if (index < 0 || !next) throw new Error(`No workspace section ${direction} of ${current}`);
        destination = workspace.and(root.locator(`[data-formspec-section=${JSON.stringify(next)}]`));
    } else {
        const panels = root.locator(`.formspec-wizard-panel${outer}`);
        const { index, count, indexedPanel } = await pagePosition(panels);
        const next = index + delta;
        if (index < 0 || next < 0 || next >= count) throw new Error(`No wizard page ${direction} of page ${index + 1}`);
        destination = indexedPanel ? panels.and(root.locator(`[data-step-index="${next}"]`)) : panels.nth(next);
    }
    await button.click();
    await destination.waitFor(visible);
    return true;
}
