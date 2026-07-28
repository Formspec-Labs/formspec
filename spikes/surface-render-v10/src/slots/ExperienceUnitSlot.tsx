/**
 * @filedesc `experience-unit` slot — hand-built. Gap ledger `experience-unit-rendering`.
 *
 * The Experience document says why a screen exists and whose need it serves.
 * That is arguably the most product-meaningful artifact in the bundle and it
 * has no rendering anywhere in the stack.
 *
 * The presentation below is this spike's invention: the unit title, and the
 * needs it claims to serve, shown to the person the need is about. A real
 * default would have to decide whether needs are respondent-facing at all —
 * they read as internal product notes here, and on a live intake page that is
 * probably wrong. Recorded rather than smoothed over.
 */
import { experienceUnit } from '../bundle.ts';

export function ExperienceUnitSlot({ unitRef }: { unitRef: string }) {
  const unit = experienceUnit(unitRef);

  if (!unit) {
    return (
      <p className="slot-missing" role="status">
        This page refers to a step called “{unitRef}” that is not in the bundle.
      </p>
    );
  }

  const needs = (unit.needRefs ?? []) as { id: string; description?: string }[];

  return (
    <div className="experience-unit">
      <p className="experience-unit__title">{unit.title}</p>
      {needs.length > 0 && (
        <ul className="experience-unit__needs">
          {needs.map((need) => (
            <li key={need.id}>{need.description ?? need.id}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
