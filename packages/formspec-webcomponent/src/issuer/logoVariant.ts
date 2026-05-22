/** @filedesc Logo variant selection per Issuer render context. */
import type { Issuer, LogoVariant } from '@formspec-org/engine/render';

export interface LogoRenderContext {
    mode: 'light' | 'dark' | 'high-contrast';
    headerWidth: 'wide' | 'narrow';
}

export function selectLogoVariant(
    issuer: Issuer,
    ctx: LogoRenderContext,
): LogoVariant | undefined {
    const { primary, wordmark, monochrome } = issuer.logo ?? {};
    const dark = ctx.mode !== 'light';
    const narrow = ctx.headerWidth === 'narrow';
    const preferred = dark ? monochrome : narrow ? wordmark : primary;
    return preferred ?? primary ?? wordmark ?? monochrome;
}
