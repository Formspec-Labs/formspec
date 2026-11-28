# Regional Annual Report (Base / Short / Long)

Build the Regional Annual Report — the yearly program report a tribal grantee submits to the federal funder — as three related definitions that share a base:

1. **Base module** (`tribal-base`): shared items used by both variants — grantee identifying information (agency name, EIN, tribal nation served, contact person), reporting period (start and end dates), total funds received and expended for the year, per-category expenditure amounts (employment assistance, education, income management, housing, emergency services, health/social services), and expenditure description narratives. Dollar amounts validated as non-negative currency; the sum of "expended" figures must not exceed "received."

2. **Short form** (`tribal-short`, `derivedFrom` base): adds per-category counts of individuals and families served. Extends the base with no new sections — just response totals by category.

3. **Long form** (`tribal-long`, `derivedFrom` base): adds a Demographics section on top of the short form — total served, total served over 18, sex breakdown (with an auto-calculated total), and employment status breakdown (with an auto-calculated total). Includes submit-timing shapes asserting the demographics sub-totals equal `totalServedOver18`.

Both variants share a theme. A changelog document tracks the diff between `tribal-base` and `tribal-long` (additive, compatible). The report should be exportable to the funder's grant-data format via a Mapping document.
