/** @filedesc USWDS-styled divider — horizontal rule or flex row with label (tokens via formspec-uswds-divider SCSS). */
import { renderDividerDOM, type AdapterContext, type DividerLayoutBehavior } from '@formspec-org/webcomponent';

export function renderUSWDSDivider(behavior: DividerLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    renderDividerDOM(behavior, parent, actx, {
        rule: 'formspec-uswds-divider',
        labeled: 'formspec-uswds-divider formspec-uswds-divider--labeled',
        line: 'formspec-uswds-divider__line',
        label: 'usa-hint',
    });
}
