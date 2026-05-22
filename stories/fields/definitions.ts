/** Field definition fixtures for Storybook stories. */

/** Minimal text input field. */
export const textInputDef = {
    "$formspec": "1.0",
    title: "Text Input",
    items: [
        { key: "name", type: "field", dataType: "string", label: "Full Name", required: true },
    ],
};

/** Text input with hint, placeholder, and constraint. */
export const textInputDetailedDef = {
    "$formspec": "1.0",
    title: "Text Input Detailed",
    items: [
        {
            key: "email",
            type: "field",
            dataType: "string",
            label: "Email Address",
            hint: "We'll never share your email.",
            presentation: { widgetHint: "TextInput", placeholder: "you@example.com" },
            required: true,
            constraint: "matches($email, '^[^@]+@[^@]+[.][^@]+$')",
            constraintMessage: "Must be a valid email",
        },
    ],
};

/** Textarea / multi-line text. */
export const textareaDef = {
    "$formspec": "1.0",
    title: "Textarea",
    items: [
        {
            key: "bio",
            type: "field",
            dataType: "text",
            label: "Biography",
            hint: "Tell us about yourself",
            presentation: { widgetHint: "TextInput", maxLines: 5 },
        },
    ],
};

/** Select dropdown. */
export const selectDef = {
    "$formspec": "1.0",
    title: "Select",
    items: [
        {
            key: "color",
            type: "field",
            dataType: "choice",
            label: "Favorite Color",
            options: [
                { value: "red", label: "Red" },
                { value: "green", label: "Green" },
                { value: "blue", label: "Blue" },
                { value: "yellow", label: "Yellow" },
            ],
            presentation: { widgetHint: "Select" },
            required: true,
        },
    ],
};

/** Checkbox. */
export const checkboxDef = {
    "$formspec": "1.0",
    title: "Checkbox",
    items: [
        {
            key: "agree",
            type: "field",
            dataType: "boolean",
            label: "I agree to the terms and conditions",
            presentation: { widgetHint: "Toggle" },
            required: true,
        },
    ],
};

/** Radio group. */
export const radioGroupDef = {
    "$formspec": "1.0",
    title: "Radio Group",
    items: [
        {
            key: "priority",
            type: "field",
            dataType: "choice",
            label: "Priority Level",
            options: [
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
                { value: "critical", label: "Critical" },
            ],
            presentation: { widgetHint: "RadioGroup" },
        },
    ],
};

/** Checkbox group with multi-select. */
export const checkboxGroupDef = {
    "$formspec": "1.0",
    title: "Checkbox Group",
    items: [
        {
            key: "interests",
            type: "field",
            dataType: "multiChoice",
            label: "Areas of Interest",
            options: [
                { value: "tech", label: "Technology" },
                { value: "science", label: "Science" },
                { value: "arts", label: "Arts" },
                { value: "sports", label: "Sports" },
            ],
            presentation: { widgetHint: "CheckboxGroup" },
        },
    ],
};

/** Number input. */
export const numberInputDef = {
    "$formspec": "1.0",
    title: "Number Input",
    items: [
        {
            key: "age",
            type: "field",
            dataType: "integer",
            label: "Age",
            presentation: { widgetHint: "NumberInput", min: 0, max: 150 },
        },
    ],
};

/** Number input with stepper. */
export const numberStepperDef = {
    "$formspec": "1.0",
    title: "Number Stepper",
    items: [
        {
            key: "quantity",
            type: "field",
            dataType: "integer",
            label: "Quantity",
            presentation: { widgetHint: "NumberInput", min: 1, max: 99, step: 1, showStepper: true },
        },
    ],
};

/** Date picker. */
export const datePickerDef = {
    "$formspec": "1.0",
    title: "Date Picker",
    items: [
        {
            key: "dob",
            type: "field",
            dataType: "date",
            label: "Date of Birth",
            presentation: { widgetHint: "DatePicker" },
        },
    ],
};

/** DateTime picker. */
export const dateTimePickerDef = {
    "$formspec": "1.0",
    title: "DateTime Picker",
    items: [
        {
            key: "appointment",
            type: "field",
            dataType: "dateTime",
            label: "Appointment Date & Time",
            presentation: { widgetHint: "DatePicker" },
        },
    ],
};

/** Time picker. */
export const timePickerDef = {
    "$formspec": "1.0",
    title: "Time Picker",
    items: [
        {
            key: "startTime",
            type: "field",
            dataType: "time",
            label: "Start Time",
            presentation: { widgetHint: "DatePicker" },
        },
    ],
};

/** Money input. */
export const moneyInputDef = {
    "$formspec": "1.0",
    title: "Money Input",
    items: [
        {
            key: "amount",
            type: "field",
            dataType: "decimal",
            label: "Grant Amount",
            presentation: { widgetHint: "MoneyInput", currency: "USD" },
            required: true,
        },
    ],
};

/** Slider. */
export const sliderDef = {
    "$formspec": "1.0",
    title: "Slider",
    items: [
        {
            key: "satisfaction",
            type: "field",
            dataType: "integer",
            label: "Satisfaction",
            presentation: { widgetHint: "Slider", min: 0, max: 10, step: 1, showValue: false },
        },
    ],
};

/** Rating. */
export const ratingDef = {
    "$formspec": "1.0",
    title: "Rating",
    items: [
        {
            key: "stars",
            type: "field",
            dataType: "integer",
            label: "Rate your experience",
            presentation: { widgetHint: "Rating", max: 5 },
        },
    ],
};

/** File upload. */
export const fileUploadDef = {
    "$formspec": "1.0",
    title: "File Upload",
    items: [
        {
            key: "resume",
            type: "field",
            dataType: "attachment",
            label: "Upload Resume",
            presentation: { widgetHint: "FileUpload", accept: ".pdf,.doc,.docx", maxSize: 5242880 },
        },
    ],
};

/** Toggle / switch. */
export const toggleDef = {
    "$formspec": "1.0",
    title: "Toggle",
    items: [
        {
            key: "notifications",
            type: "field",
            dataType: "boolean",
            label: "Enable notifications",
            presentation: { widgetHint: "Toggle", onLabel: "On", offLabel: "Off" },
        },
    ],
};

/** Signature pad. */
export const signatureDef = {
    "$formspec": "1.0",
    title: "Signature",
    items: [
        {
            key: "sig",
            type: "field",
            dataType: "attachment",
            label: "Signature",
            presentation: { widgetHint: "Signature" },
        },
    ],
};

/** Same country field as Select, but layout uses `Select` + `searchable` (combobox). */
export const searchableSelectDef = {
    "$formspec": "1.0",
    title: "Searchable Select",
    items: [
        {
            key: "country",
            type: "field",
            dataType: "choice",
            label: "Country",
            hint: "Filter by country name or shorthand — e.g. US, UK, DE, or “states”.",
            options: [
                { value: "us", label: "United States", keywords: ["US", "USA", "America", "U.S."] },
                { value: "ca", label: "Canada", keywords: ["CA", "CAN"] },
                { value: "mx", label: "Mexico", keywords: ["MX", "MEX"] },
                { value: "gb", label: "United Kingdom", keywords: ["UK", "GB", "Britain", "Great Britain", "England"] },
                { value: "de", label: "Germany", keywords: ["DE", "DEU", "Deutschland"] },
                { value: "fr", label: "France", keywords: ["FR", "FRA"] },
                { value: "jp", label: "Japan", keywords: ["JP", "JPN"] },
                { value: "au", label: "Australia", keywords: ["AU", "AUS"] },
                { value: "br", label: "Brazil", keywords: ["BR", "BRA"] },
                { value: "in", label: "India", keywords: ["IN", "IND"] },
            ],
            presentation: { widgetHint: "Select" },
        },
    ],
};

/** Renders combobox (`searchable: true`), not native `<select>`. */
export const searchableSelectComponentDoc = {
    "$formspecComponent": "1.0",
    name: "searchable-select-story",
    title: "Searchable Select",
    tree: {
        component: "Stack",
        children: [{ component: "Select", bind: "country", searchable: true }],
    },
};
