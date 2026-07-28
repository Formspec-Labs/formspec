/**
 * @filedesc `experience-unit` — resolving the "why this screen exists" artifact.
 *
 * The Experience document says what a unit is for and whose need it serves. It
 * is arguably the most product-meaningful artifact in a bundle and had no
 * rendering anywhere in the stack (gap ledger `experience-unit-rendering`).
 *
 * The resolution is here; the presentation is the renderer binding's. What this
 * module decides is the part that is not a styling choice: **the needs a unit
 * declares are not respondent-facing copy.** `needRefs[].description` reads as an
 * internal product note — "This is the long form. It is where a dropped
 * connection costs the most." — written about the respondent, not to them. The
 * spike printed them on the intake page. A default that shows them to the person
 * filling in the form is a default that leaks the design conversation onto a
 * government service page.
 *
 * So {@link planExperienceUnit} returns the unit's title and its needs in
 * separate fields, marked by audience. A respondent renderer shows the title; an
 * authoring or review surface shows both. Neither has to guess.
 */
import type { ExperienceDocument } from '@formspec-org/types';

export type ExperienceUnit = NonNullable<ExperienceDocument['units']>[number];

export interface ExperienceNeedSummary {
  id: string;
  description?: string;
}

export interface ExperienceUnitPlan {
  unitRef: string;
  status: 'resolved' | 'unresolved';
  /** Respondent-facing. The one string a unit reliably carries for a person. */
  title?: string;
  kind?: string;
  /**
   * NOT respondent-facing. Design rationale about the person, not for them.
   * Shown on authoring and review surfaces; withheld from respondent chrome.
   */
  needs: readonly ExperienceNeedSummary[];
  unit?: ExperienceUnit;
}

export interface ExperienceUnitPlanInput {
  unitRef: string;
  /** `binding.experienceRef` — disambiguates when a bundle carries several. */
  experienceRef?: string | undefined;
  experiences: readonly ExperienceDocument[];
}

export function planExperienceUnit(input: ExperienceUnitPlanInput): ExperienceUnitPlan {
  const candidates = input.experienceRef
    ? input.experiences.filter(
        (experience) =>
          (experience as { url?: string }).url === input.experienceRef ||
          (experience as { id?: string }).id === input.experienceRef,
      )
    : input.experiences;

  for (const experience of candidates) {
    const unit = experience.units?.find((candidate) => candidate.id === input.unitRef);
    if (!unit) continue;
    const needs = (unit.needRefs ?? []).map((need) => {
      const summary = need as { id?: unknown; description?: unknown };
      const id = typeof summary.id === 'string' ? summary.id : '';
      return typeof summary.description === 'string'
        ? { id, description: summary.description }
        : { id };
    });
    const plan: ExperienceUnitPlan = {
      unitRef: input.unitRef,
      status: 'resolved',
      needs,
      unit,
    };
    if (typeof unit.title === 'string') plan.title = unit.title;
    if (typeof unit.kind === 'string') plan.kind = unit.kind;
    return plan;
  }

  return { unitRef: input.unitRef, status: 'unresolved', needs: [] };
}
