/** Behavior definition fixtures for Storybook stories. */

/** Repeatable group. */
export const repeatGroupDef = {
    "$formspec": "1.0",
    title: "Repeat Group",
    items: [
        {
            key: "members",
            type: "group",
            label: "Team Members",
            repeatable: true,
            minRepeat: 1,
            maxRepeat: 5,
            children: [
                { key: "memberName", type: "field", dataType: "string", label: "Name", required: true },
                { key: "memberRole", type: "field", dataType: "string", label: "Role" },
            ],
        },
    ],
};

/** Conditional visibility with when expression. */
export const conditionalDef = {
    "$formspec": "1.0",
    title: "Conditional Fields",
    items: [
        {
            key: "hasOther",
            type: "field",
            dataType: "boolean",
            label: "Other (specify)",
            presentation: { widgetHint: "Toggle" },
        },
        {
            key: "otherDetail",
            type: "field",
            dataType: "string",
            label: "Please specify",
            relevant: "$hasOther = true",
        },
    ],
};

/** Validation showcase. */
export const validationDef = {
    "$formspec": "1.0",
    title: "Validation Demo",
    items: [
        {
            key: "username",
            type: "field",
            dataType: "string",
            label: "Username",
            hint: "3-20 characters, letters and numbers only",
            required: true,
            constraint: "length($username) >= 3 and length($username) <= 20",
            constraintMessage: "Username must be 3-20 characters",
        },
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

/** Layout doc for Validation Demo — mirrors RealUSWDSStory’s alert + fields (see uswds-comparison-presets). */
export const validationDemoComponentDoc = {
    $formspecComponent: '1.0',
    name: 'validation-demo-layout',
    title: 'Validation Demo',
    tree: {
        component: 'Stack',
        gap: '16px',
        children: [
            { component: 'ValidationSummary', mode: 'continuous', showFieldErrors: true },
            { component: 'TextInput', bind: 'username' },
            { component: 'TextInput', bind: 'password' },
        ],
    },
};
