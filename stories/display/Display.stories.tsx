import type { Meta, StoryObj } from '@storybook/react';
import { SideBySideStory } from '../_shared/SideBySideStory';
import { contactFormDef } from '../_shared/definitions';
import {
    allDisplayDef,
    alertVariantsComponentDoc,
    headingHierarchyComponentDoc,
    badgeSpacingComponentDoc,
    progressBarComponentDoc,
    summaryComponentDoc,
    validationSummaryDef,
    validationSummaryComponentDoc,
    dataTableDef,
    dataTableComponentDoc,
} from './definitions';

const meta: Meta<typeof SideBySideStory> = {
    title: 'Display/Components',
    component: SideBySideStory,
    args: { showSubmit: false },
};
export default meta;

type Story = StoryObj<typeof SideBySideStory>;

/** Heading, Text (paragraph), Divider, and Alert (banner) in one form. */
export const AllDisplayTypes: Story = {
    name: 'Heading / Text / Divider / Alert',
    args: { definition: allDisplayDef },
};

/** Alert severity variants: info, success, warning, error + dismissible. */
export const AlertVariants: Story = {
    name: 'Alert Variants',
    args: { definition: contactFormDef, componentDocument: alertVariantsComponentDoc },
};

/** Heading h1–h6 hierarchy. */
export const HeadingHierarchy: Story = {
    name: 'Heading Hierarchy (h1–h6)',
    args: { definition: contactFormDef, componentDocument: headingHierarchyComponentDoc },
};

/** Badge spacing — placed via component document. */
export const BadgeAndSpacing: Story = {
    name: 'Badge & Spacing',
    args: { definition: contactFormDef, componentDocument: badgeSpacingComponentDoc },
};

/** ProgressBar — static value with percentage display. */
export const ProgressBar: Story = {
    name: 'ProgressBar',
    args: { definition: contactFormDef, componentDocument: progressBarComponentDoc },
};

/** Summary — reactive field value display. */
export const Summary: Story = {
    name: 'Summary',
    args: { definition: contactFormDef, componentDocument: summaryComponentDoc },
};

/** ValidationSummary — live validation error list. */
export const ValidationSummary: Story = {
    name: 'ValidationSummary',
    args: { definition: validationSummaryDef, componentDocument: validationSummaryComponentDoc, showSubmit: true },
};

/** DataTable — tabular editing of a repeatable group. */
export const DataTable: Story = {
    name: 'DataTable',
    args: { definition: dataTableDef, componentDocument: dataTableComponentDoc },
};
