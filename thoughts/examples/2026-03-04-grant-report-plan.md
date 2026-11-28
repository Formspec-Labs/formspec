# Implementation Plan: Tribal Grant Annual Report (Short & Long)

> [!IMPORTANT]
> This is the anchor example — a direct port of a production government grant form from a competing Python/Django framework. It demonstrates modular composition, multiChoice-driven relevance, and form variant derivation.

## Directory Structure

```
examples/grant-report/
├── tribal-base.definition.json        # Shared module (Basic Info + Expenditures + Descriptions)
├── tribal-short.definition.json       # Short form: imports base only
├── tribal-long.definition.json        # Long form: imports base + adds Demographics
├── tribal-short.component.json        # Component doc for short form (3-step wizard)
├── tribal-long.component.json         # Component doc for long form (4-step wizard)
├── tribal.theme.json                  # Shared theme (both variants)
├── tribal-grant.mapping.json          # Mapping to government XML reporting format
├── tribal-migration-short-to-long.json # Migration path: short → long
├── tribal-changelog.json              # Changelog between short v3.0.0 and long v3.0.4
└── fixtures/
    ├── short-empty.response.json      # Empty short form response
    ├── short-partial.response.json    # Partially filled (some topics selected)
    ├── short-complete.response.json   # Fully completed short form
    ├── long-complete.response.json    # Fully completed long form
    └── short-to-long-migrated.response.json
```

---

## Phase 1: Shared Base Definition (`tribal-base.definition.json`)

This is the reusable module that both Short and Long forms import via `$ref`.

### 1.1 Identity & Metadata

```json
{
  "$formspec": "1.0",
  "url": "https://example.org/formspec/annual-report/tribal-base",
  "version": "3.0.0",
  "status": "active",
  "title": "Regional Annual Report — Base Module",
  "name": "tribal-base",
  "description": "Shared items for Regional Annual Report short and long variants.",
  "extensions": ["x-formspec-common"]
}
```

### 1.2 Items (Structure Layer)

#### Basic Information Group

```json
{
  "key": "basicInfo",
  "type": "group",
  "label": "Basic Information",
  "children": [
    {
      "key": "orgName",
      "type": "field",
      "dataType": "string",
      "label": "Name of Tribe or Tribal Organization",
      "labels": { "review": "Tribal Organization" }
    },
    {
      "key": "contactName",
      "type": "field",
      "dataType": "string",
      "label": "Full name",
      "labels": { "review": "Program Contact" }
    },
    {
      "key": "contactTitle",
      "type": "field",
      "dataType": "string",
      "label": "Role"
    },
    {
      "key": "phone",
      "type": "field",
      "dataType": "string",
      "label": "Primary phone number",
      "extensions": { "x-formspec-phone-nanp": true }
    },
    {
      "key": "email",
      "type": "field",
      "dataType": "string",
      "label": "Email address",
      "extensions": { "x-formspec-email": true }
    }
  ]
}
```

> [!NOTE]
> The competing framework uses `widget=forms.TelInput` and `widget=forms.EmailInput` (presentation hacks). Formspec uses `x-formspec-phone-nanp` and `x-formspec-email` extensions — validation, input mode, autocomplete, and formatting are all declared at the data level, not the widget level.

#### Topic Filter (multiChoice)

```json
{
  "key": "applicableTopics",
  "type": "field",
  "dataType": "multiChoice",
  "label": "Select the expenditure categories that apply to your program",
  "options": [
    { "value": "employment", "label": "Employment" },
    { "value": "childcare", "label": "Childcare, Early Childhood, Youth Development & Adult Education" },
    { "value": "assetBuilding", "label": "Income & Asset Building" },
    { "value": "housing", "label": "Housing" },
    { "value": "health", "label": "Health & Nutrition" },
    { "value": "civic", "label": "Civic Engagement & Community Involvement" },
    { "value": "transportation", "label": "Transportation" },
    { "value": "partnerships", "label": "Partnerships, Linkages, and Coordination" },
    { "value": "other", "label": "Other" }
  ]
}
```

> [!IMPORTANT]
> In the competing framework, `FieldFilterField` has `is_presentational_only=True` — the topic selection doesn't appear in the response. In Formspec, `applicableTopics` IS real data that drives `relevant` binds. This is **better** — the response now records which categories the grantee selected, which is useful for auditing and analysis.

#### Expenditure Amounts Group

9 currency fields + 1 calculated total. Each expenditure field:

```json
{
  "key": "employmentExpenditure",
  "type": "field",
  "dataType": "decimal",
  "label": "Employment",
  "labels": { "review": "Employment expenses" },
  "extensions": { "x-formspec-currency-usd": true }
}
```

> [!TIP]
> Using `x-formspec-currency-usd` (extends `decimal`) instead of `money` type because this is a single-currency US government form. Gets us `$` prefix, 2-digit precision, and thousands separators without the `money()` FEL function overhead.

Calculated total:

```json
{
  "key": "totalExpenditures",
  "type": "field",
  "dataType": "decimal",
  "label": "Total Expenditures",
  "labels": { "review": "Total Expenditures (auto-calculated)" },
  "extensions": { "x-formspec-currency-usd": true }
}
```

#### Administration Costs (Boolean Gate)

```json
{
  "key": "hasAdministrationCosts",
  "type": "field",
  "dataType": "boolean",
  "label": "Did you use any funds toward Administration costs?"
},
{
  "key": "administrationExpenditure",
  "type": "field",
  "dataType": "decimal",
  "label": "Administration",
  "labels": { "review": "Total administration costs" },
  "initialValue": "",
  "extensions": { "x-formspec-currency-usd": true }
}
```

#### Expenditure Descriptions Group

7 textarea fields, one per topic (except partnerships and other which have no description):

```json
{
  "key": "employmentDescription",
  "type": "field",
  "dataType": "text",
  "label": "Description",
  "labels": { "review": "Details about employment related services" }
}
```

### 1.3 Binds (Behavior Layer)

#### Relevance Binds (multiChoice → visibility)

Each expenditure field and its corresponding description are gated by `selected()`:

```json
[
  {
    "path": "employmentExpenditure",
    "relevant": "selected($applicableTopics, 'employment')",
    "default": 0
  },
  {
    "path": "employmentDescription",
    "relevant": "selected($applicableTopics, 'employment')",
    "default": "N/A"
  },
  {
    "path": "childcareExpenditure",
    "relevant": "selected($applicableTopics, 'childcare')",
    "default": 0
  },
  {
    "path": "educationDescription",
    "relevant": "selected($applicableTopics, 'childcare')",
    "default": "N/A"
  }
]
```

> [!IMPORTANT]
> The `default` bind is critical here. It maps to the competing framework's `default_if_excluded=0` and `default_if_excluded="N/A"`. The `default` bind fires on every non-relevant→relevant transition (distinct from `initialValue` which fires once at creation).

#### Boolean Gate Bind

```json
{
  "path": "administrationExpenditure",
  "relevant": "$hasAdministrationCosts = true",
  "required": false
}
```

#### Calculate Bind

```json
{
  "path": "totalExpenditures",
  "calculate": "coalesce($employmentExpenditure, 0) + coalesce($childcareExpenditure, 0) + coalesce($assetBuildingExpenditure, 0) + coalesce($housingExpenditure, 0) + coalesce($healthExpenditure, 0) + coalesce($civicExpenditure, 0) + coalesce($transportationExpenditure, 0) + coalesce($partnershipsExpenditure, 0) + coalesce($otherExpenditure, 0)"
}
```

> [!NOTE]
> Using `coalesce($field, 0)` instead of bare `$field` because non-relevant fields may be null. The `excludedValue` bind could also handle this, but explicit coalesce is clearer and more portable.

#### Required + Constraint Binds

```json
{
  "path": "basicInfo.orgName",
  "required": true
},
{
  "path": "basicInfo.contactName",
  "required": true
},
{
  "path": "basicInfo.email",
  "required": true
},
{
  "path": "employmentExpenditure",
  "constraint": "$ >= 0",
  "constraintMessage": "Expenditure amount cannot be negative"
}
```

The `constraint: "$ >= 0"` bind applies to all 9 expenditure fields (use one bind per field, or a wildcard path if fields are in a repeat — but here they're singletons).

### 1.4 Shapes (Validation Layer)

```json
[
  {
    "id": "atLeastOneTopic",
    "target": "applicableTopics",
    "constraint": "present($)",
    "message": "Please select at least one expenditure category",
    "severity": "error",
    "timing": "submit"
  },
  {
    "id": "totalExpendituresPositive",
    "target": "totalExpenditures",
    "constraint": "$ > 0",
    "message": "Total expenditures must be greater than zero",
    "severity": "warning",
    "timing": "submit"
  }
]
```

---

## Phase 2: Short Form Definition (`tribal-short.definition.json`)

### 2.1 Identity

```json
{
  "$formspec": "1.0",
  "url": "https://example.org/formspec/annual-report/tribal-short",
  "version": "3.0.0",
  "status": "active",
  "title": "Regional Annual Report — Short Form",
  "name": "tribal-annual-report-short-3.0",
  "derivedFrom": {
    "url": "https://example.org/formspec/annual-report/tribal-base",
    "version": "3.0.0"
  },
  "extensions": ["x-formspec-common"]
}
```

### 2.2 Items

The Short Form includes the base module via `$ref`:

```json
{
  "items": [
    {
      "key": "base",
      "type": "group",
      "label": "Annual Report",
      "$ref": {
        "url": "https://example.org/formspec/annual-report/tribal-base",
        "version": "3.0.0"
      }
    }
  ]
}
```

After assembly, this expands to the full item tree from the base module. No additional items for the Short Form.

### 2.3 Form Presentation

```json
{
  "formPresentation": {
    "pageMode": "wizard",
    "labelPosition": "top",
    "density": "comfortable"
  }
}
```

---

## Phase 3: Long Form Definition (`tribal-long.definition.json`)

### 3.1 Identity

```json
{
  "$formspec": "1.0",
  "url": "https://example.org/formspec/annual-report/tribal-long",
  "version": "3.0.4",
  "status": "active",
  "title": "Regional Annual Report — Long Form",
  "name": "tribal-annual-report-long-3.0",
  "derivedFrom": {
    "url": "https://example.org/formspec/annual-report/tribal-base",
    "version": "3.0.0"
  },
  "extensions": ["x-formspec-common"]
}
```

### 3.2 Items — Base + Demographics

```json
{
  "items": [
    {
      "key": "base",
      "type": "group",
      "label": "Annual Report",
      "$ref": {
        "url": "https://example.org/formspec/annual-report/tribal-base",
        "version": "3.0.0"
      }
    },
    {
      "key": "demographics",
      "type": "group",
      "label": "Demographic Information",
      "children": [
        {
          "key": "totalServed",
          "type": "field",
          "dataType": "integer",
          "label": "Total number of people",
          "labels": { "review": "Total number of people served" }
        },
        {
          "key": "totalServedOver18",
          "type": "field",
          "dataType": "integer",
          "label": "Total number of people",
          "labels": { "review": "Total served over 18" }
        },
        {
          "key": "sexBreakdown",
          "type": "group",
          "label": "Sex of individuals served (Age 18 and older)",
          "children": [
            { "key": "male", "type": "field", "dataType": "integer", "label": "Male" },
            { "key": "female", "type": "field", "dataType": "integer", "label": "Female" },
            {
              "key": "totalBySex",
              "type": "field",
              "dataType": "integer",
              "label": "Total",
              "labels": { "review": "Total (auto-calculated)" }
            }
          ]
        },
        {
          "key": "employmentStatus",
          "type": "group",
          "label": "Work status of adults served (age 18 and older)",
          "children": [
            { "key": "fullTime", "type": "field", "dataType": "integer", "label": "Employed Full Time" },
            { "key": "partTime", "type": "field", "dataType": "integer", "label": "Employed Part Time" },
            { "key": "migrantSeasonal", "type": "field", "dataType": "integer", "label": "Migrant or seasonal farm worker" },
            { "key": "unemployedShort", "type": "field", "dataType": "integer", "label": "Unemployed (short term, 6 months or less)" },
            { "key": "unemployedLong", "type": "field", "dataType": "integer", "label": "Unemployed (long term, more than 6 months)" },
            { "key": "notInLaborForce", "type": "field", "dataType": "integer", "label": "Unemployed (not in labor force)" },
            { "key": "retired", "type": "field", "dataType": "integer", "label": "Retired" },
            { "key": "unknown", "type": "field", "dataType": "integer", "label": "Unknown or not reported" },
            {
              "key": "totalByEmployment",
              "type": "field",
              "dataType": "integer",
              "label": "Total (auto-calculated)",
              "labels": { "review": "Total (auto-calculated)" }
            }
          ]
        }
      ]
    }
  ]
}
```

### 3.3 Additional Binds (Demographics)

```json
[
  {
    "path": "demographics.sexBreakdown.totalBySex",
    "calculate": "coalesce($demographics.sexBreakdown.male, 0) + coalesce($demographics.sexBreakdown.female, 0)"
  },
  {
    "path": "demographics.employmentStatus.totalByEmployment",
    "calculate": "coalesce($demographics.employmentStatus.fullTime, 0) + coalesce($demographics.employmentStatus.partTime, 0) + coalesce($demographics.employmentStatus.migrantSeasonal, 0) + coalesce($demographics.employmentStatus.unemployedShort, 0) + coalesce($demographics.employmentStatus.unemployedLong, 0) + coalesce($demographics.employmentStatus.notInLaborForce, 0) + coalesce($demographics.employmentStatus.retired, 0) + coalesce($demographics.employmentStatus.unknown, 0)"
  }
]
```

### 3.4 Additional Shapes (Demographics cross-field validation)

```json
[
  {
    "id": "sexBreakdownMatchesTotal",
    "target": "demographics.sexBreakdown.totalBySex",
    "constraint": "$ = $demographics.totalServedOver18",
    "message": "Sex breakdown total must equal total individuals served over 18",
    "severity": "error",
    "timing": "submit"
  },
  {
    "id": "employmentMatchesTotal",
    "target": "demographics.employmentStatus.totalByEmployment",
    "constraint": "$ = $demographics.totalServedOver18",
    "message": "Employment status total must equal total individuals served over 18",
    "severity": "error",
    "timing": "submit"
  },
  {
    "id": "over18NotExceedTotal",
    "target": "demographics.totalServedOver18",
    "constraint": "$ <= $demographics.totalServed",
    "message": "Individuals over 18 cannot exceed total individuals served",
    "severity": "error"
  }
]
```

---

## Phase 4: Component Documents

### 4.1 Short Form Component (`tribal-short.component.json`)

3-step wizard: Basic Info → Expenditures → Expenditure Details

```json
{
  "$formspecComponent": "1.0",
  "version": "1.0.0",
  "targetDefinition": {
    "url": "https://example.org/formspec/annual-report/tribal-short",
    "compatibleVersions": ">=3.0.0 <4.0.0"
  },
  "tree": {
    "component": "Wizard",
    "children": [
      {
        "component": "Page",
        "style": { "title": "Basic Information" },
        "children": [
          {
            "component": "Card",
            "style": { "title": "Tribal Organization" },
            "children": [
              { "component": "Heading", "style": { "text": "Tribal Organization", "level": 3 } },
              { "component": "TextInput", "bind": "orgName" },
              { "component": "TextInput", "bind": "contactName" },
              { "component": "TextInput", "bind": "contactTitle" },
              { "component": "TextInput", "bind": "phone" },
              { "component": "TextInput", "bind": "email" }
            ]
          }
        ]
      },
      {
        "component": "Page",
        "style": { "title": "Expenditure Categories" },
        "children": [
          { "component": "CheckboxGroup", "bind": "applicableTopics" },
          {
            "component": "Card",
            "style": { "title": "Expenditure Amounts" },
            "children": [
              { "component": "Text", "style": { "text": "Provide the amounts for each selected category." } },
              { "component": "NumberInput", "bind": "employmentExpenditure", "when": "selected($applicableTopics, 'employment')" },
              { "component": "NumberInput", "bind": "childcareExpenditure", "when": "selected($applicableTopics, 'childcare')" },
              { "component": "NumberInput", "bind": "assetBuildingExpenditure", "when": "selected($applicableTopics, 'assetBuilding')" },
              { "component": "NumberInput", "bind": "housingExpenditure", "when": "selected($applicableTopics, 'housing')" },
              { "component": "NumberInput", "bind": "healthExpenditure", "when": "selected($applicableTopics, 'health')" },
              { "component": "NumberInput", "bind": "civicExpenditure", "when": "selected($applicableTopics, 'civic')" },
              { "component": "NumberInput", "bind": "transportationExpenditure", "when": "selected($applicableTopics, 'transportation')" },
              { "component": "NumberInput", "bind": "partnershipsExpenditure", "when": "selected($applicableTopics, 'partnerships')" },
              { "component": "NumberInput", "bind": "otherExpenditure", "when": "selected($applicableTopics, 'other')" },
              { "component": "Divider" },
              { "component": "NumberInput", "bind": "totalExpenditures" }
            ]
          },
          {
            "component": "Card",
            "style": { "title": "Administration Costs" },
            "children": [
              { "component": "Text", "style": { "text": "To learn more about what qualifies as Administration costs, refer to guidance IM37." } },
              { "component": "Toggle", "bind": "hasAdministrationCosts" },
              { "component": "NumberInput", "bind": "administrationExpenditure", "when": "$hasAdministrationCosts = true" }
            ]
          }
        ]
      },
      {
        "component": "Page",
        "style": { "title": "Expenditure Details" },
        "children": [
          {
            "component": "Stack",
            "children": [
              {
                "component": "Card",
                "when": "selected($applicableTopics, 'employment')",
                "style": { "title": "Details on employment services" },
                "children": [
                  { "component": "Text", "style": { "text": "Describe all employment related services, such as support for job placement, vocational and skill training, job development and eliminating barriers to work." } },
                  { "component": "TextInput", "bind": "employmentDescription" }
                ]
              },
              {
                "component": "Card",
                "when": "selected($applicableTopics, 'childcare')",
                "style": { "title": "Details on education services" },
                "children": [
                  { "component": "TextInput", "bind": "educationDescription" }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

> [!NOTE]
> The `when` on component nodes maps to the competing framework's `PageBlock` vs `PermanentPageBlock` distinction. `PermanentPageBlock` has no `when` (always visible); `PageBlock` has `when` tied to topic selection. This is more expressive — any FEL expression can gate any component node.

### 4.2 Long Form Component (`tribal-long.component.json`)

Same as Short Form + a 4th wizard step for Demographics. The demographics step adds:

```json
{
  "component": "Page",
  "style": { "title": "Demographic Information" },
  "children": [
    {
      "component": "Card",
      "style": { "title": "Total individuals served" },
      "children": [
        { "component": "NumberInput", "bind": "demographics.totalServed" },
        { "component": "NumberInput", "bind": "demographics.totalServedOver18" }
      ]
    },
    {
      "component": "Card",
      "style": { "title": "Sex of individuals served (Age 18 and older)" },
      "children": [
        { "component": "NumberInput", "bind": "demographics.sexBreakdown.male" },
        { "component": "NumberInput", "bind": "demographics.sexBreakdown.female" },
        { "component": "NumberInput", "bind": "demographics.sexBreakdown.totalBySex" }
      ]
    },
    {
      "component": "Card",
      "style": { "title": "Work status of adults served (age 18 and older)" },
      "children": [
        { "component": "NumberInput", "bind": "demographics.employmentStatus.fullTime" },
        { "component": "NumberInput", "bind": "demographics.employmentStatus.partTime" },
        { "component": "NumberInput", "bind": "demographics.employmentStatus.migrantSeasonal" },
        { "component": "NumberInput", "bind": "demographics.employmentStatus.unemployedShort" },
        { "component": "NumberInput", "bind": "demographics.employmentStatus.unemployedLong" },
        { "component": "NumberInput", "bind": "demographics.employmentStatus.notInLaborForce" },
        { "component": "NumberInput", "bind": "demographics.employmentStatus.retired" },
        { "component": "NumberInput", "bind": "demographics.employmentStatus.unknown" },
        { "component": "Divider" },
        { "component": "NumberInput", "bind": "demographics.employmentStatus.totalByEmployment" }
      ]
    }
  ]
}
```

---

## Phase 5: Theme Document (`tribal.theme.json`)

```json
{
  "$formspecTheme": "1.0",
  "version": "1.0.0",
  "targetDefinition": {
    "url": "https://example.org/formspec/annual-report/tribal-short",
    "compatibleVersions": ">=3.0.0 <4.0.0"
  },
  "tokens": {
    "color.primary": "#005EA2",
    "color.secondary": "#1A4480",
    "color.error": "#B50909",
    "color.warning": "#E5A000",
    "color.background": "#F0F0F0",
    "spacing.sm": 8,
    "spacing.md": 16,
    "spacing.lg": 24,
    "typography.fontFamily": "'Public Sans', -apple-system, sans-serif"
  },
  "defaults": {
    "labelPosition": "top",
    "style": {
      "fontFamily": "$token.typography.fontFamily"
    }
  },
  "selectors": [
    {
      "match": { "dataType": "decimal" },
      "apply": {
        "style": { "textAlign": "right" }
      }
    },
    {
      "match": { "dataType": "integer" },
      "apply": {
        "style": { "textAlign": "right" }
      }
    }
  ]
}
```

> [!TIP]
> Uses USWDS-aligned tokens (US Web Design System) since this is a federal government form. `Public Sans` is the standard government typeface.

---

## Phase 6: Mapping Document (`tribal-grant.mapping.json`)

Maps the grant report response to a government XML reporting format.

```json
{
  "$formspecMapping": "1.0",
  "version": "1.0.0",
  "definitionRef": "https://example.org/formspec/annual-report/tribal-short",
  "definitionVersion": ">=3.0.0 <4.0.0",
  "direction": "forward",
  "targetSchema": {
    "format": "xml",
    "root_element": "AnnualReport",
    "namespaces": {
      "": "https://example.org/schemas/annual-report/2026"
    }
  },
  "rules": [
    {
      "sourcePath": "orgName",
      "targetPath": "OrganizationInfo.TribeName",
      "transform": "preserve",
      "priority": 10
    },
    {
      "sourcePath": "totalExpenditures",
      "targetPath": "Expenditures.TotalAmount",
      "transform": "coerce",
      "coerce": "string",
      "priority": 10
    },
    {
      "sourcePath": "applicableTopics",
      "targetPath": "Expenditures.Categories",
      "transform": "expression",
      "expression": "let topics = @source in count(topics)",
      "priority": 10
    }
  ]
}
```

---

## Phase 7: Composition & Migration Artifacts

### 7.1 Changelog (`tribal-changelog.json`)

```json
{
  "definitionUrl": "https://example.org/formspec/annual-report/tribal-long",
  "fromVersion": "3.0.0",
  "toVersion": "3.0.4",
  "semverImpact": "compatible",
  "changes": [
    {
      "type": "added",
      "target": "item",
      "path": "items.demographics",
      "impact": "compatible",
      "after": { "key": "demographics", "type": "group" }
    },
    {
      "type": "added",
      "target": "shape",
      "path": "shapes.sexBreakdownMatchesTotal",
      "impact": "compatible"
    },
    {
      "type": "added",
      "target": "shape",
      "path": "shapes.employmentMatchesTotal",
      "impact": "compatible"
    }
  ]
}
```

### 7.2 Migration — Short to Long

```json
{
  "migrations": [
    {
      "fromVersion": "3.0.0",
      "changes": [
        {
          "type": "add",
          "path": "demographics",
          "defaultValue": {}
        }
      ]
    }
  ]
}
```

---

## Phase 8: Test Fixtures

### 8.1 Fixture: Short Form — Partial (some topics selected)

```json
{
  "definitionUrl": "https://example.org/formspec/annual-report/tribal-short",
  "definitionVersion": "3.0.0",
  "status": "in-progress",
  "authored": "2026-03-04T12:00:00Z",
  "data": {
    "orgName": "Mashpee Wampanoag Tribe",
    "contactName": "Jane Doe",
    "contactTitle": "Program Director",
    "phone": "(508) 477-0208",
    "email": "jdoe@mashpeewampanoag.gov",
    "applicableTopics": ["employment", "housing", "health"],
    "employmentExpenditure": 45000.00,
    "housingExpenditure": 32000.00,
    "healthExpenditure": 28000.00,
    "totalExpenditures": 105000.00,
    "hasAdministrationCosts": false,
    "employmentDescription": "Job placement assistance and vocational training for 42 tribal members.",
    "housingDescription": "Emergency housing repairs and weatherization for 15 homes.",
    "healthDescription": "Mobile health clinic operating twice monthly."
  }
}
```

### 8.2 Fixture: Short Form — Non-relevant fields show defaults

After deselecting "employment" topic, the response should show `default` values:

```json
{
  "employmentExpenditure": 0,
  "employmentDescription": "N/A"
}
```

This validates the `default` bind re-relevance behavior.

---

## Implementation Checklist

- [x] Create `tribal-base.definition.json` with all shared items, binds, shapes
- [x] Create `tribal-short.definition.json` — self-contained (no `$ref`; assembly is a publish-time step)
- [x] Create `tribal-long.definition.json` — extends base with demographics
- [x] Run `formspec.validator` lint on both definitions: **0 diagnostics each**
- [x] Create `tribal-short.component.json` (3-step wizard)
- [x] Create `tribal-long.component.json` (4-step wizard)
- [x] Create `tribal.theme.json` with USWDS tokens (CSS length units enforced)
- [x] Create `tribal-grant.mapping.json` for XML export (HHS OLDC format)
- [x] Create `tribal-changelog.json` — `semverImpact: "patch"`, no extra sentinel fields
- [x] Create all test fixtures: empty, partial, complete (short), complete (long), short→long migrated
- [x] Validate theme, mapping, changelog, all 5 response fixtures: **0 diagnostics each**
- [x] Schema validation of component docs — **SKIP**: `component.schema.json` uses `oneOf` over 50+ types; `jsonschema`'s `unevaluatedProperties` + `oneOf` causes exponential work / stack overflow. Use the semantic component linter instead (requires `--definition` flag).
- [x] Test `generate_changelog(short_def, long_def, url)` → 20 changes detected, `semverImpact: "major"` (URL+title+description changed)
- [x] Test multiChoice → relevance: employment=True when `['employment']`, housing=False when not selected ✅
- [x] Test calculate: total=45000 with employment=45000, all others null ✅
- [x] Test admin gate: `administrationExpenditure` relevant only when `hasAdministrationCosts=true` ✅
- [x] Verify `labels` contexts: orgName default="Name of Tribe…", review="Tribal Organization" ✅; total default="Total Expenditures", review="Total Expenditures (auto-calculated)" ✅
- [x] Test `default` bind re-relevance: Bug was already fixed — `_eval_fel` calls `from_python()` on all scope values including bare `$`. Added `test_default_bind_relevance_with_numeric_constraint` to Python evaluator tests (multiChoice → relevance + default=0 + constraint $ >= 0). All 3 scenarios pass: default value 0, positive value, negative value ✅
- [x] Browser render test (`<formspec-render>`): 9 Playwright E2E tests in `tests/e2e/playwright/grant-report/render-and-relevance.spec.ts`. Fixed component docs (moved `params` to direct props to match built-in component API) and aligned short definition field names with base. Tests cover: wizard rendering, multiChoice→expenditure relevance, default bind re-relevance, constraint validation, auto-calculation, admin gate ✅
