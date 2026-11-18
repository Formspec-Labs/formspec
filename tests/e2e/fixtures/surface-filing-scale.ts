/** @filedesc Synthetic form definitions and saved progress for the large tracker fixture. */
import type { FilingDraftObservation } from '@formspec-org/surface';

const forms = [
  ['roster', 'Eligible entity list', 'Identify eligible entities and the areas they serve.'],
  ['plan', 'State plan', 'Describe the planned use of annual grant funds.'],
  ['administration', 'State administration', 'Report grant administration and monitoring activities.'],
  ['expenditures', 'Entity expenditures', 'Report expenditures by funding source and category.'],
  ['capacity', 'Entity capacity', 'Describe staffing, technical assistance and partnerships.'],
  ['community', 'Community initiatives', 'Report services and community-level outcomes.'],
  ['households', 'Household outcomes', 'Report services to individuals and families.'],
  ['distribution', 'Funding distribution', 'Provide the allocations and transfers for this filing period.'],
  ['monitoring', 'Monitoring report', 'Record monitoring activity and corrective actions.'],
  ['assurances', 'Annual assurances', 'Review the requirements for this year’s filing.'],
  ['records', 'Supporting records', 'Summarize records that support the annual report.'],
  ['certification', 'Final certification', 'Confirm the information provided for this filing.'],
] as const;

const sectionLabels = [
  'Overview', 'Contacts', 'Service areas', 'Eligibility', 'Funding', 'Staffing', 'Activities', 'Partners',
  'People served', 'Outcomes', 'Reporting', 'Review', 'Records', 'Certification', 'Notes',
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
  const observation: FilingDraftObservation = index % 4 === 0 ? { status: 'absent' }
    : { status: 'current', form: { ...counts, ready: index % 4 === 3 }, sections };
  return { routeRef, url, title, observation,
    definition: { $formspec: '1.0', url, version: '1.0.0', title, description, items } };
});
