/** @filedesc Auto-screenshot + DOM snapshot setup for every story test. */
import { afterEach, expect } from 'vitest';
import { page } from 'vitest/browser';
import { serializeDOM } from './dom-serializer';
import { storyScreenshotBaseId } from './story-screenshot-id';

// Disable CSS animations/transitions for deterministic screenshots
const DISABLE_ANIMATIONS_CSS = `
*, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
}
`;

let styleInjected = false;

afterEach(async (context) => {
    // Only process story tests (addon-vitest sets storyId in task meta)
    const meta = (context.task as any).meta;
    const storyId = meta?.storyId;
    if (!storyId) return;

    // Inject animation-disabling CSS once
    if (!styleInjected) {
        const style = document.createElement('style');
        style.textContent = DISABLE_ANIMATIONS_CSS;
        document.head.appendChild(style);
        styleInjected = true;
    }

    const name = storyScreenshotBaseId(storyId);
    const rootEl = document.getElementById('storybook-root') ?? document.body;

    await document.fonts?.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    // Capture DOM snapshot before screenshot (screenshot may clear/modify state)
    meta.domSnapshot = serializeDOM(rootEl);

    // Visual regression screenshot
    const root = page.elementLocator(rootEl);
    await expect.element(root).toMatchScreenshot(name, {
        timeout: 15_000,
    });
});
