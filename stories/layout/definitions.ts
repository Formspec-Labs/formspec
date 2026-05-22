/** Layout component definition fixtures for Storybook stories. */

/** Grouped form with nested fields. */
export const groupedFormDef = {
    "$formspec": "1.0",
    title: "Grouped Form",
    items: [
        {
            key: "personal",
            type: "group",
            label: "Personal Information",
            children: [
                { key: "name", type: "field", dataType: "string", label: "Name", required: true },
                { key: "email", type: "field", dataType: "string", label: "Email" },
            ],
        },
        {
            key: "preferences",
            type: "group",
            label: "Preferences",
            children: [
                { key: "newsletter", type: "field", dataType: "boolean", label: "Subscribe to newsletter", presentation: { widgetHint: "Toggle" } },
                { key: "debug", type: "field", dataType: "boolean", label: "Enable debug mode", presentation: { widgetHint: "Toggle" } },
                { key: "timeout", type: "field", dataType: "integer", label: "Timeout (seconds)", presentation: { widgetHint: "NumberInput", min: 1, max: 300 } },
            ],
        },
    ],
};

/** Grid layout for the contact form — 2-column responsive grid. */
export const contactFormComponentDoc = {
    "$formspecComponent": "1.0",
    name: "contact-grid",
    title: "Contact Form Grid",
    tree: {
        component: "Card",
        title: "Contact Information",
        children: [
            {
                component: "Grid",
                columns: 2,
                gap: "16px",
                rowGap: "16px",
                children: [
                    { component: "TextInput", bind: "firstName" },
                    { component: "TextInput", bind: "lastName" },
                    { component: "TextInput", bind: "email" },
                    { component: "TextInput", bind: "phone" },
                ],
            },
        ],
    },
};

/** Card layout for grouped form — wraps each group in a Card with a Grid inside. */
export const groupedFormComponentDoc = {
    "$formspecComponent": "1.0",
    name: "grouped-cards",
    title: "Grouped Form Cards",
    tree: {
        component: "Stack",
        gap: "24px",
        children: [
            {
                component: "Card",
                title: "Personal Information",
                children: [
                    {
                        component: "Grid",
                        columns: 2,
                        gap: "16px",
                        children: [
                            { component: "TextInput", bind: "personal.name" },
                            { component: "TextInput", bind: "personal.email" },
                        ],
                    },
                ],
            },
            {
                component: "Card",
                title: "Preferences",
                children: [
                    { component: "Toggle", bind: "preferences.newsletter" },
                    { component: "Toggle", bind: "preferences.debug" },
                    { component: "NumberInput", bind: "preferences.timeout", min: 1, max: 300, step: 1 },
                ],
            },
        ],
    },
};

/** Collapsible component document. */
export const collapsibleComponentDoc = {
    "$formspecComponent": "1.0",
    name: "collapsible-demo",
    title: "Collapsible Demo",
    tree: {
        component: "Stack",
        gap: "16px",
        children: [
            {
                component: "Collapsible",
                title: "Personal Details",
                defaultOpen: true,
                children: [
                    { component: "TextInput", bind: "firstName" },
                    { component: "TextInput", bind: "lastName" },
                ],
            },
            {
                component: "Collapsible",
                title: "Contact Information",
                children: [
                    { component: "TextInput", bind: "email" },
                    { component: "TextInput", bind: "phone" },
                ],
            },
        ],
    },
};

/** Accordion component document. */
export const accordionComponentDoc = {
    "$formspecComponent": "1.0",
    name: "accordion-demo",
    title: "Accordion Demo",
    tree: {
        component: "Accordion",
        labels: ["Personal Details", "Contact Information"],
        defaultOpen: 0,
        children: [
            {
                component: "Stack",
                gap: "12px",
                children: [
                    { component: "TextInput", bind: "firstName" },
                    { component: "TextInput", bind: "lastName" },
                ],
            },
            {
                component: "Stack",
                gap: "12px",
                children: [
                    { component: "TextInput", bind: "email" },
                    { component: "TextInput", bind: "phone" },
                ],
            },
        ],
    },
};

/** Accordion with allowMultiple — multiple sections open at once. */
export const accordionMultiComponentDoc = {
    "$formspecComponent": "1.0",
    name: "accordion-multi-demo",
    title: "Accordion Multi Demo",
    tree: {
        component: "Accordion",
        labels: ["Personal Details", "Contact Information", "Preferences"],
        defaultOpen: 0,
        allowMultiple: true,
        children: [
            {
                component: "Stack",
                gap: "12px",
                children: [
                    { component: "TextInput", bind: "firstName" },
                    { component: "TextInput", bind: "lastName" },
                ],
            },
            {
                component: "Stack",
                gap: "12px",
                children: [
                    { component: "TextInput", bind: "email" },
                    { component: "TextInput", bind: "phone" },
                ],
            },
            {
                component: "Stack",
                gap: "12px",
                children: [
                    { component: "Toggle", bind: "newsletter" },
                ],
            },
        ],
    },
};

/** Panel component document — sidebar + main content. */
export const panelComponentDoc = {
    "$formspecComponent": "1.0",
    name: "panel-demo",
    title: "Panel Demo",
    tree: {
        component: "Stack",
        direction: "horizontal",
        gap: "24px",
        children: [
            {
                component: "Panel",
                title: "Help",
                placement: "left",
                width: "200px",
                children: [
                    { component: "Text", text: "Fill in your contact details. All fields are optional unless marked required." },
                ],
            },
            {
                component: "Stack",
                gap: "12px",
                children: [
                    { component: "TextInput", bind: "firstName" },
                    { component: "TextInput", bind: "lastName" },
                    { component: "TextInput", bind: "email" },
                    { component: "TextInput", bind: "phone" },
                ],
            },
        ],
    },
};

/** Modal component document. */
export const modalComponentDoc = {
    "$formspecComponent": "1.0",
    name: "modal-demo",
    title: "Modal Demo",
    tree: {
        component: "Stack",
        gap: "16px",
        children: [
            { component: "TextInput", bind: "firstName" },
            { component: "TextInput", bind: "lastName" },
            {
                component: "Modal",
                title: "Additional Details",
                triggerLabel: "Add More Details",
                children: [
                    { component: "TextInput", bind: "email" },
                    { component: "TextInput", bind: "phone" },
                ],
            },
        ],
    },
};

/** Popover component document. */
export const popoverComponentDoc = {
    "$formspecComponent": "1.0",
    name: "popover-demo",
    title: "Popover Demo",
    tree: {
        component: "Stack",
        gap: "16px",
        children: [
            { component: "TextInput", bind: "firstName" },
            { component: "TextInput", bind: "lastName" },
            {
                component: "Popover",
                triggerLabel: "Need help?",
                title: "Field guidance",
                children: [
                    { component: "Text", text: "Enter your legal first and last name as they appear on official documents." },
                ],
            },
        ],
    },
};

/** Wizard component document — multi-step form via pageMode on Stack > Section. */
export const wizardComponentDoc = {
    "$formspecComponent": "1.0",
    name: "wizard-demo",
    title: "Wizard Demo",
    formPresentation: { pageMode: "wizard", showProgress: true },
    tree: {
        component: "Stack",
        children: [
            {
                component: "Section",
                title: "Personal Info",
                children: [
                    { component: "TextInput", bind: "firstName" },
                    { component: "TextInput", bind: "lastName" },
                ],
            },
            {
                component: "Section",
                title: "Contact",
                children: [
                    { component: "TextInput", bind: "email" },
                    { component: "TextInput", bind: "phone" },
                ],
            },
        ],
    },
};

/** Same wizard with a collapsible step rail (`formPresentation.sidenav`). */
export const wizardWithSidenavComponentDoc = {
    ...wizardComponentDoc,
    name: 'wizard-sidenav-demo',
    title: 'Wizard (side navigation)',
    formPresentation: { ...wizardComponentDoc.formPresentation, sidenav: true },
};

/** Tabs component document. */
export const tabsComponentDoc = {
    "$formspecComponent": "1.0",
    name: "tabs-demo",
    title: "Tabs Demo",
    tree: {
        component: "Tabs",
        tabLabels: ["Personal", "Contact"],
        children: [
            {
                component: "Stack",
                gap: "12px",
                children: [
                    { component: "TextInput", bind: "firstName" },
                    { component: "TextInput", bind: "lastName" },
                ],
            },
            {
                component: "Stack",
                gap: "12px",
                children: [
                    { component: "TextInput", bind: "email" },
                    { component: "TextInput", bind: "phone" },
                ],
            },
        ],
    },
};
