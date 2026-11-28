/** @filedesc Synthetic form definitions and saved progress for the large tracker fixture. */
import type { FormStatusDraftObservation } from '@formspec-org/surface';

const forms = [
  ['roster', 'Organization roster', 'Identify participating organizations and the regions they cover.'],
  ['plan', 'Annual plan', 'Describe the planned activities and targets for the reporting period.'],
  ['operations', 'Program operations', 'Report operational oversight and review activities.'],
  ['expenditures', 'Budget summary', 'Report expenditures by category and reporting period.'],
  ['capacity', 'Resource capacity', 'Describe staffing, technical capacity and partnerships.'],
  ['regional', 'Regional activities', 'Report initiatives and regional-level outcomes.'],
  ['participants', 'Participant outcomes', 'Report services delivered to individuals and households.'],
  ['distribution', 'Allocation schedule', 'Provide the allocations and transfers for this reporting period.'],
  ['monitoring', 'Compliance review', 'Record compliance reviews and follow-up actions.'],
  ['declarations', 'Annual declarations', 'Review the declarations for this period.'],
  ['records', 'Supporting records', 'Summarize records that support the annual report.'],
  ['confirmation', 'Final confirmation', 'Confirm the information provided for this submission.'],
] as const;

const sectionLabels = [
  'Overview', 'Contacts', 'Regions', 'Eligibility', 'Budget', 'Staffing', 'Activities', 'Partners',
  'Participants', 'Outcomes', 'Reporting', 'Review', 'Records', 'Confirmation', 'Notes',
];

export const scaleForms = forms.map(([routeRef, title, description], index) => {
  const url = `https://example.test/filing/scale/${routeRef}`;
  const items = Array.from({ length: 10 + index % 6 }, (_, section) => {
    const label = sectionLabels[(index + section) % sectionLabels.length]!;
    const size = 1 + (section * 3 + index) % (4 + index);
    const children = Array.from({ length: size }, (_, question) => ({
      key: `answer${question}`, type: 'field', dataType: 'string', label: `Question ${question + 1}`,
    }));
    return { key: `section${section}`, type: 'group', label, children };
  });
  const sections = Object.fromEntries(items.map(({ key, children }, section) => {
    const total = children.length;
    const filled = index % 4 === 3 ? total : Math.max(0, total - section % 5);
    return [key, { total, filled, toFix: index % 4 === 1 && section % 7 === 0 ? 1 : 0,
      toCheck: index % 4 !== 3 && section % 5 === 1 ? 1 : 0 }];
  }));
  const counts = Object.values(sections).reduce((sum, section) => ({
    total: sum.total + section.total, filled: sum.filled + section.filled,
    toFix: sum.toFix + section.toFix, toCheck: sum.toCheck + section.toCheck,
  }), { total: 0, filled: 0, toFix: 0, toCheck: 0 });
  const observation: FormStatusDraftObservation = index % 4 === 0 ? { status: 'absent' }
    : { status: 'current', form: { ...counts, ready: index % 4 === 3 }, sections };
  return { routeRef, url, title, observation,
    definition: { $formspec: '1.0', url, version: '1.0.0', title, description, items } };
});
