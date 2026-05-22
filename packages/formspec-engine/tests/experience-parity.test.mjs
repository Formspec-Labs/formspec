/** @filedesc Package parity for Experience processor predicates. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeExperience } from '../dist/tools-exports.js';

const definition = {
  $formspec: '1.0',
  url: 'https://example.gov/forms/experience-parity',
  version: '1.0.0',
  status: 'active',
  title: 'Experience parity',
  items: [
    { key: 'applicantName', type: 'field', label: 'Applicant name', dataType: 'string' },
    {
      key: 'household',
      type: 'group',
      children: [
        {
          key: 'members',
          type: 'group',
          repeatable: true,
          minRepeat: 1,
          children: [
            { key: 'firstName', type: 'field', label: 'First name', dataType: 'string' },
          ],
        },
      ],
    },
    {
      key: 'optionalUploads',
      type: 'group',
      repeatable: true,
      minRepeat: 0,
      children: [
        { key: 'file', type: 'field', label: 'File', dataType: 'attachment' },
      ],
    },
    { key: 'hiddenCode', type: 'field', label: 'Hidden code', dataType: 'string' },
  ],
  binds: [
    { path: 'applicantName', required: 'true' },
    { path: 'household.members[*].firstName', required: 'true' },
    { path: 'optionalUploads[*].file', required: 'true' },
    { path: 'hiddenCode', required: 'true', relevant: 'false' },
  ],
};

const validExperience = {
  $formspecExperience: '1.0',
  version: '1.0.0',
  targetDefinition: { url: definition.url, compatibleVersions: '^1.0.0' },
  actors: [{ id: 'applicant' }],
  tasks: [{ id: 'identify', actorRefs: ['applicant'] }],
  applicability: { actorRefs: ['applicant'] },
  units: [
    {
      id: 'identity',
      kind: 'data-entry',
      actorRef: 'applicant',
      taskRefs: ['identify'],
      itemRefs: [
        { path: 'applicantName' },
        { path: 'household.members[*].firstName' },
      ],
    },
  ],
};

test('analyzeExperience accepts clean references and required coverage', () => {
  const analysis = analyzeExperience(definition, validExperience);
  assert.deepEqual(analysis.findings, []);
});

test('analyzeExperience reports unresolved refs, dangling item refs, and uncovered required fields', () => {
  const experience = {
    ...validExperience,
    targetDefinition: { url: 'https://example.gov/forms/other', compatibleVersions: '^2.0.0' },
    applicability: { actorRefs: ['missingTopActor'] },
    tasks: [{ id: 'identify', actorRefs: ['missingTaskActor'] }],
    units: [
      {
        ...validExperience.units[0],
        actorRef: 'missingUnitActor',
        taskRefs: ['missingTask'],
        applicability: { actorRefs: ['missingUnitApplicabilityActor'] },
        itemRefs: [{ path: 'nonexistentField' }],
      },
    ],
  };

  const analysis = analyzeExperience(definition, experience);
  const codes = analysis.findings.map(finding => finding.code);

  assert.equal(codes.filter(code => code === 'EXP-TARGET-DEFINITION-MISMATCH').length, 1);
  assert.equal(codes.filter(code => code === 'EXP-TARGET-DEFINITION-VERSION-MISMATCH').length, 1);
  assert.equal(codes.filter(code => code === 'EXP-REFERENTIAL-INTEGRITY').length, 5);
  assert.equal(codes.filter(code => code === 'EXP-ITEM-REF-UNRESOLVED').length, 1);
  assert.deepEqual(
    analysis.coverage.map(finding => finding.path),
    ['applicantName', 'household.members[*].firstName'],
  );
});
