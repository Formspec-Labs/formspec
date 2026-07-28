/** @filedesc Tests for platform defaults and theme generation from token registry. */
import { describe, it, expect } from 'vitest';
import {
    platformDefaults,
    platformSelectors,
    buildPlatformTheme,
} from '../src/platform-defaults';

describe('platformDefaults', () => {
    it('sets labelPosition to top', () => {
        expect(platformDefaults.labelPosition).toBe('top');
    });

    it('sets accessibility.liveRegion to off', () => {
        expect(platformDefaults.accessibility?.liveRegion).toBe('off');
    });
});

describe('platformSelectors', () => {
    it('has exactly 4 entries', () => {
        expect(platformSelectors).toHaveLength(4);
    });

    it('matches groups with cssClass and accessibility role', () => {
        const groupSelector = platformSelectors[0];
        expect(groupSelector.match).toEqual({ type: 'group' });
        expect(groupSelector.apply.cssClass).toBe('formspec-themed-group');
        expect(groupSelector.apply.accessibility?.role).toBe('group');
    });

    it('matches display items with cssClass', () => {
        const displaySelector = platformSelectors[1];
        expect(displaySelector.match).toEqual({ type: 'display' });
        expect(displaySelector.apply.cssClass).toBe('formspec-themed-display');
    });

    it('matches field items with cssClass', () => {
        const fieldSelector = platformSelectors[2];
        expect(fieldSelector.match).toEqual({ type: 'field' });
        expect(fieldSelector.apply.cssClass).toBe('formspec-themed-field');
    });

    it('matches boolean dataType with start label position', () => {
        const booleanSelector = platformSelectors[3];
        expect(booleanSelector.match).toEqual({ dataType: 'boolean' });
        expect(booleanSelector.apply.labelPosition).toBe('start');
    });
});

describe('buildPlatformTheme', () => {
    const theme = buildPlatformTheme();

    it('returns valid ThemeDocument shape', () => {
        expect(theme.$formspecTheme).toBe('1.0');
        expect(theme.version).toBe('1.0.0');
        expect(theme.name).toBe('formspec-default');
        expect(theme.targetDefinition).toEqual({
            url: 'urn:formspec:any',
            compatibleVersions: '>=1.0.0',
        });
    });

    it('includes platform defaults and selectors', () => {
        expect(theme.defaults).toBe(platformDefaults);
        expect(theme.selectors).toBe(platformSelectors);
    });

    it('includes light-mode color tokens from the registry', () => {
        expect(theme.tokens?.['color.primary']).toBe('#27594f');
        expect(theme.tokens?.['color.foreground']).toBe('#20241f');
        expect(theme.tokens?.['color.background']).toBe('#f6f0e6');
    });

    it('includes dark-mode color tokens derived from darkPrefix', () => {
        expect(theme.tokens?.['color.dark.primary']).toBe('#8bb8ac');
        expect(theme.tokens?.['color.dark.foreground']).toBe('#f3ecdf');
        expect(theme.tokens?.['color.dark.background']).toBe('#161311');
    });

    it('includes non-color tokens', () => {
        expect(theme.tokens?.['spacing.md']).toBe('1rem');
        expect(theme.tokens?.['spacing.xs']).toBe('0.25rem');
        expect(theme.tokens?.['font.family']).toContain('Instrument Sans');
    });

    it('includes radius tokens', () => {
        expect(theme.tokens?.['radius.sm']).toBe('0.9rem');
        expect(theme.tokens?.['radius.md']).toBe('1.35rem');
    });

    it('includes all expected token count', () => {
        const tokenKeys = Object.keys(theme.tokens ?? {});
        // 45 declared, minus the 2 derived (color.ring / color.dark.ring) that
        // §2.5 forbids emitting — see the next test.
        expect(tokenKeys.length).toBe(43);
    });

    // token-registry-spec §2.5. A derived token in the platform theme's token
    // map would give EVERY theme an explicit value for it, so the CSS chain
    // `var(--formspec-color-ring, var(--formspec-color-primary, …))` could never
    // reach its second arm — and a tenant who sets only the brand token would
    // keep the platform focus ring. surface-render-v10 measured exactly that.
    it('omits derived tokens so their fan-out can resolve', () => {
        expect(theme.tokens?.['color.ring']).toBeUndefined();
        expect(theme.tokens?.['color.dark.ring']).toBeUndefined();
        expect(theme.tokens?.['color.primary']).toBe('#27594f');
    });
});
