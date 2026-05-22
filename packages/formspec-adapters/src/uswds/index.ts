/** @filedesc USWDS v3 render adapter — CSS-only, no USWDS JavaScript required. */
import type { RenderAdapter } from '@formspec-org/webcomponent';
import { renderTextInput } from './text-input';
import { renderNumberInput } from './number-input';
import { renderRadioGroup } from './radio-group';
import { renderCheckboxGroup } from './checkbox-group';
import { renderSelect } from './select';
import { renderDatePicker } from './date-picker';
import { renderToggle } from './toggle';
import { renderMoneyInput } from './money-input';
import { renderSlider } from './slider';
import { renderRating } from './rating';
import { renderFileUpload } from './file-upload';
import { renderSignature } from './signature';
import { renderWizard } from './wizard';
import { renderTabs } from './tabs';
import { renderActionButton } from './action-button';
import { renderUSWDSGrid } from './layout/grid';
import { renderUSWDSStack } from './layout/stack';
import { renderUSWDSSection } from './layout/page';
import { renderUSWDSDivider } from './layout/divider';
import { renderUSWDSCollapsible } from './layout/collapsible';
import { renderUSWDSPanel } from './layout/panel';
import { renderUSWDSAccordion } from './layout/accordion';
import { renderUSWDSModal } from './layout/modal';
import { renderUSWDSPopover } from './layout/popover';
import {
    renderUSWDSHeading,
    renderUSWDSText,
    renderUSWDSCard,
    renderUSWDSAlert,
    renderUSWDSBadge,
    renderUSWDSProgressBar,
    renderUSWDSSummary,
    renderUSWDSValidationSummary,
    renderUSWDSConditionalGroup,
    renderUSWDSDataTable,
} from './display-components';
/**
 * USWDS v3 adapter for formspec-webcomponent.
 *
 * Emits USWDS markup patterns using `usa-*` CSS classes.
 * Requires `@uswds/uswds` v3 CSS (or equivalent) to be loaded.
 * Does NOT require USWDS component JavaScript — layout and inputs use native behavior or `bind()`.
 */
export const uswdsAdapter: RenderAdapter = {
    name: 'uswds',
    components: {
        Section: renderUSWDSSection,
        Stack: renderUSWDSStack,
        Grid: renderUSWDSGrid,
        Divider: renderUSWDSDivider,
        Collapsible: renderUSWDSCollapsible,
        Panel: renderUSWDSPanel,
        Accordion: renderUSWDSAccordion,
        Modal: renderUSWDSModal,
        Popover: renderUSWDSPopover,
        Heading: renderUSWDSHeading,
        Text: renderUSWDSText,
        Card: renderUSWDSCard,
        Alert: renderUSWDSAlert,
        Badge: renderUSWDSBadge,
        ProgressBar: renderUSWDSProgressBar,
        Summary: renderUSWDSSummary,
        ValidationSummary: renderUSWDSValidationSummary,
        ConditionalGroup: renderUSWDSConditionalGroup,
        DataTable: renderUSWDSDataTable,
        TextInput: renderTextInput,
        NumberInput: renderNumberInput,
        RadioGroup: renderRadioGroup,
        CheckboxGroup: renderCheckboxGroup,
        Select: renderSelect,
        DatePicker: renderDatePicker,
        Toggle: renderToggle,
        MoneyInput: renderMoneyInput,
        Slider: renderSlider,
        Rating: renderRating,
        FileUpload: renderFileUpload,
        Signature: renderSignature,
        Wizard: renderWizard,
        Tabs: renderTabs,
        ActionButton: renderActionButton,
    },
};
