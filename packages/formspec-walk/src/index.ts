/** @filedesc @formspec-org/walk — the Definition walk: checks derived from a Definition, Locale and Theme, run generically or emitted as a readable spec. */
export { derivePlan, expected, matches, stripMarkdown } from './plan.js';
export type { ExpectedText, Plan, PlanDocuments, PlanField, PlanGroup, PlanOption, PlanRepeat } from './plan.js';
export { Walk, DEFAULT_WALK_ROOT_SELECTOR } from './checks.js';
export type { FieldWant, LiveField, OpenOptions, RepeatWant, RevealWant, SummaryRowWant, Text } from './checks.js';
export { walkDefinition, expectClean, fieldWant } from './walk.js';
export type { WalkReport } from './walk.js';
export { virtualScreenReader, guidepupScreenReader } from './screen-reader.js';
export type { GuidepupLike, ScreenReader } from './screen-reader.js';
export { emitSpec, deriveRecipes } from './emit.js';
export type { EmitOptions } from './emit.js';
export { revealSearch, needsHostData } from './reveal.js';
export type { RecipeStep, RevealEngine } from './reveal.js';
export { checkAccessibility, runAxePass, expectedPages, reviewFinding, PageCoverageError, criteriaOf, WCAG_TAGS, CHECK_VERSION, DEFAULT_TIMEOUT_MS, MANUAL_REVIEW, AxeMissingError, RendererError } from './axe.js';
export type { PageCoverage, AccessibilityCheckOptions, AxeFinding, AxeNodeFinding, AxePassOptions, AxePassResult, AxeState, CheckFailure, FailureReason, ManualReviewCriterion, RendererCheckReport } from './axe.js';
