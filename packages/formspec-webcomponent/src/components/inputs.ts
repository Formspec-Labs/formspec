/** @filedesc Input component plugins: orchestrate behavior hooks with adapter render functions. */
import type { ComponentPlugin } from '../types';
import { useTextInput } from '../behaviors/text-input';
import { useNumberInput } from '../behaviors/number-input';
import { useRadioGroup } from '../behaviors/radio-group';
import { useCheckboxGroup } from '../behaviors/checkbox-group';
import { useSelect } from '../behaviors/select';
import { useToggle } from '../behaviors/toggle';
import { useCheckbox } from '../behaviors/checkbox';
import { useDatePicker } from '../behaviors/date-picker';
import { useMoneyInput } from '../behaviors/money-input';
import { useSlider } from '../behaviors/slider';
import { useRating } from '../behaviors/rating';
import { useFileUpload } from '../behaviors/file-upload';
import { useSignature } from '../behaviors/signature';
import { makeInputPlugin, type InputBehaviorHook } from './input-plugin-factory';

const INPUT_PLUGIN_ENTRIES: [string, InputBehaviorHook][] = [
    ['TextInput', useTextInput],
    ['NumberInput', useNumberInput],
    ['Select', useSelect],
    ['Toggle', useToggle],
    ['Checkbox', useCheckbox],
    ['DatePicker', useDatePicker],
    ['RadioGroup', useRadioGroup],
    ['CheckboxGroup', useCheckboxGroup],
    ['Slider', useSlider],
    ['Rating', useRating],
    ['FileUpload', useFileUpload],
    ['Signature', useSignature],
    ['MoneyInput', useMoneyInput],
];

/** All 13 built-in input component plugins, exported as a single array for bulk registration. */
export const InputPlugins: ComponentPlugin[] = INPUT_PLUGIN_ENTRIES.map(([type, hook]) =>
    makeInputPlugin(type, hook),
);
