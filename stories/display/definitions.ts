/** Display component definition fixtures for Storybook stories. */

/** All display component types in one form. */
export const allDisplayDef = {
    "$formspec": "1.0",
    title: "All Display Components",
    items: [
        { key: "h1", type: "display", label: "Primary Heading", presentation: { widgetHint: "Heading" } },
        { key: "text1", type: "display", label: "This is a paragraph of informational text with plain formatting. Markdown requires the Text component with format: markdown.", presentation: { widgetHint: "Text" } },
        { key: "divider1", type: "display", label: "", presentation: { widgetHint: "Divider" } },
        { key: "infoAlert", type: "display", label: "This is an informational message.", presentation: { widgetHint: "Alert" } },
        { key: "name", type: "field", dataType: "string", label: "Your Name" },
    ],
};

/** Alert severity variants — placed via component document. */
export const alertVariantsComponentDoc = {
    "$formspecComponent": "1.0",
    name: "alert-variants",
    title: "Alert Variants",
    tree: {
        component: "Stack",
        gap: "12px",
        children: [
            { component: "Alert", text: "This is an informational message.", severity: "info" },
            { component: "Alert", text: "Operation completed successfully.", severity: "success" },
            { component: "Alert", text: "Please review before submitting.", severity: "warning" },
            { component: "Alert", text: "An error occurred. Please try again.", severity: "error" },
            { component: "Alert", text: "This alert can be dismissed.", severity: "info", dismissible: true },
        ],
    },
};

/** Heading hierarchy h1–h6 — placed via component document. */
export const headingHierarchyComponentDoc = {
    "$formspecComponent": "1.0",
    name: "heading-hierarchy",
    title: "Heading Hierarchy",
    tree: {
        component: "Stack",
        gap: "8px",
        children: [
            { component: "Heading", text: "Heading Level 1", level: 1 },
            { component: "Heading", text: "Heading Level 2", level: 2 },
            { component: "Heading", text: "Heading Level 3", level: 3 },
            { component: "Heading", text: "Heading Level 4", level: 4 },
            { component: "Heading", text: "Heading Level 5", level: 5 },
            { component: "Heading", text: "Heading Level 6", level: 6 },
        ],
    },
};

/** Badge and spacing showcase with fields. */
export const badgeSpacingComponentDoc = {
    "$formspecComponent": "1.0",
    name: "badge-spacing-demo",
    title: "Badge & Spacing Demo",
    tree: {
        component: "Stack",
        gap: "1.5rem",
        children: [
            { component: "Heading", text: "Application Status" },
            {
                component: "Stack",
                direction: "horizontal",
                gap: "8px",
                children: [
                    { component: "Badge", text: "In Progress", variant: "primary" },
                    { component: "Badge", text: "Required", variant: "error" },
                ],
            },
            { component: "TextInput", bind: "firstName" },
            { component: "TextInput", bind: "lastName" },
            { component: "TextInput", bind: "email" },
        ],
    },
};

/** ProgressBar showcase — static value (no bind). */
export const progressBarComponentDoc = {
    "$formspecComponent": "1.0",
    name: "progress-bar-demo",
    title: "ProgressBar Demo",
    tree: {
        component: "Stack",
        gap: "16px",
        children: [
            { component: "Heading", text: "Form Completion" },
            { component: "ProgressBar", value: 65, max: 100, showPercent: true, label: "Completion" },
            { component: "TextInput", bind: "firstName" },
            { component: "TextInput", bind: "lastName" },
        ],
    },
};

/** Summary display — shows field values reactively. */
export const summaryComponentDoc = {
    "$formspecComponent": "1.0",
    name: "summary-demo",
    title: "Summary Demo",
    tree: {
        component: "Stack",
        gap: "16px",
        children: [
            { component: "TextInput", bind: "firstName" },
            { component: "TextInput", bind: "lastName" },
            { component: "TextInput", bind: "email" },
            { component: "Divider" },
            {
                component: "Summary",
                items: [
                    { label: "First Name", bind: "firstName" },
                    { label: "Last Name", bind: "lastName" },
                    { label: "Email", bind: "email" },
                ],
            },
        ],
    },
};

/** ValidationSummary definition (needs required + constraints). */
export const validationSummaryDef = {
    "$formspec": "1.0",
    title: "Validation Summary Demo",
    items: [
        { key: "username", type: "field", dataType: "string", label: "Username", required: true },
        {
            key: "password",
            type: "field",
            dataType: "string",
            label: "Password",
            required: true,
            constraint: "length($password) >= 8",
            constraintMessage: "Password must be at least 8 characters",
        },
    ],
};

/** ValidationSummary — live validation error list. */
export const validationSummaryComponentDoc = {
    "$formspecComponent": "1.0",
    name: "validation-summary-demo",
    title: "ValidationSummary Demo",
    tree: {
        component: "Stack",
        gap: "16px",
        children: [
            { component: "ValidationSummary" },
            { component: "TextInput", bind: "username" },
            { component: "TextInput", bind: "password" },
        ],
    },
};

/** DataTable definition — needs a repeatable group. */
export const dataTableDef = {
    "$formspec": "1.0",
    title: "DataTable Demo",
    items: [
        {
            key: "expenses",
            type: "group",
            label: "Expenses",
            repeatable: true,
            minRepeat: 1,
            maxRepeat: 20,
            children: [
                { key: "description", type: "field", dataType: "string", label: "Description" },
                { key: "amount", type: "field", dataType: "decimal", label: "Amount" },
                {
                    key: "category",
                    type: "field",
                    dataType: "choice",
                    label: "Category",
                    options: [
                        { value: "travel", label: "Travel" },
                        { value: "supplies", label: "Supplies" },
                        { value: "equipment", label: "Equipment" },
                        { value: "other", label: "Other" },
                    ],
                },
            ],
        },
    ],
};

/** DataTable component document — tabular editing of the repeatable group. */
export const dataTableComponentDoc = {
    "$formspecComponent": "1.0",
    name: "datatable-demo",
    title: "DataTable Demo",
    tree: {
        component: "Stack",
        gap: "16px",
        children: [
            { component: "Heading", text: "Expense Report" },
            {
                component: "DataTable",
                bind: "expenses",
                title: "Line Items",
                allowAdd: true,
                allowRemove: true,
                columns: [
                    { header: "Description", bind: "description", type: "text" },
                    { header: "Amount ($)", bind: "amount", type: "number" },
                    {
                        header: "Category",
                        bind: "category",
                        type: "select",
                        choices: [
                            { value: "travel", label: "Travel" },
                            { value: "supplies", label: "Supplies" },
                            { value: "equipment", label: "Equipment" },
                            { value: "other", label: "Other" },
                        ],
                    },
                ],
            },
        ],
    },
};
