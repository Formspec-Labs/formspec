/**
 * @filedesc Tailwind CSS render adapter — utility-first styling on semantic HTML elements.
 *
 * Core layout plugins (`Card`, `ActionButton`, `ValidationSummary`) are not adapter-rendered; they use
 * `formspec-*` classes, which `tailwind-formspec-core.css` styles — declared below, linked by the renderer.
 */
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

/**
 * Tailwind CSS adapter for formspec-webcomponent.
 *
 * Emits semantic HTML with Tailwind utility classes.
 * Requires Tailwind CSS to be loaded (CDN or built).
 * Does NOT require any JavaScript framework — bind() replaces it.
 *
 * `stylesheets` carries only the `formspec-*` plugin defaults: controls are styled by the utility classes the
 * adapter emits, which the host's own Tailwind build compiles.
 */
export const tailwindAdapter: RenderAdapter = {
    name: 'tailwind',
    stylesheets: [{
        href: new URL('../../tailwind-formspec-core.css', import.meta.url).href,
        presentWhen: { className: 'formspec-container', property: '--formspec-tailwind-rules', value: '1' },
    }],
    components: {
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
    },
};
