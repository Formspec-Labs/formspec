# Findings from building the NJ weekly certification demo (2026-09-15)

> Archived record. Every defect below was fixed in the formspec, formspec-studio, fel-core and formspec-web
> repos and the demo — https://github.com/Formspec-Labs/formspec-demo, live at
> https://formspec-labs.github.io/formspec-demo/ — was rebuilt on the fixed stack. Later sections name
> what the design frames asked for that the renderer could not show at the time. Inner status lines
> ("still open", TODOs) are as written on the day; the closing sections and the tickets they cite
> (`tk show fs-…` in formspec-stack) carry the final state.

Everything below was hit while authoring through the Forms MCP and rendering with the
webcomponent + USWDS adapter. Paths are relative to `formspec-stack` and describe
the code as it was when each problem was found. `review/` and `screenshots/` paths refer to
the demo repository's history before its first public commit (`git log --all -- review/` there).

## Engine / renderer (affects anyone rendering a form)

| # | Severity | Problem | Root cause | Fix |
|---|---|---|---|---|
| E1 | MAJOR | Date answers compared to dates give `null`, so date rules misfire | Ad-hoc FEL context tags only money (`formspec/packages/formspec-engine/src/engine/wasm-fel.ts:216-252`, `helpers.ts:229-248`); Rust repeat sibling lookups use untyped `json_to_runtime_fel` (`formspec/crates/formspec-eval/src/recalculate/repeats.rs:45,60,83,131,148`, `bind_pass.rs:239`, `calculate_pass.rs:130`, `revalidate/env.rs:115`) | Tag `date`/`dateTime` like money (fel-core already accepts `{"$type":"date"}`); use `json_to_runtime_fel_typed` in repeat paths |
| E2 | MAJOR | A rule that evaluates to `null` because of a type error is reported as a failed validation (spec §3.8.1, §3.10.2 say it passes) | `constraint_passes` (`formspec-eval/src/revalidate/expr.rs:14-24`), also `shapes.rs:199,297-366`; deliberate in `0df1cc352` to expose broken expressions to authors | Return pass for any null; show the diagnostic to authors in preview instead of `ValidationReport.results` |
| E3 | MAJOR | Custom error text and translated labels don't apply to fields inside groups | Engine looks up Locale strings by full path (`templatePath: basePath`, `FormEngine.ts:1701`); Locale spec §3.1 keys by item `key` (MCP follows spec). Engine tests only cover top-level items | Look up by item key (keys are unique per definition) |
| E4 | MAJOR | Hints never substitute `{{...}}` values and ignore Locale | Field behaviors read raw `item?.hint` (e.g. `formspec-webcomponent/src/behaviors/radio-group.ts:39`) instead of the view model's resolved hint | Use the field view model's hint, as labels already do |
| E5 | MAJOR | Display text never substitutes `{{...}}` values or Locale | Planner copies `item.label` into a static `Text` (`formspec-layout/src/planner-definition-fallback.ts:156`) | Resolve display labels through locale + interpolation |
| E6 | MAJOR | Show/hide rules on display text are ignored | Planner reads non-schema `item.relevant` (`planner-definition-fallback.ts:163`) instead of the bind for that path | Use the engine's relevance for the display item's path |
| E7 | MINOR | Add button stays visible at `maxRepeat`; rows supplied by data always get Add/Remove | `formspec-webcomponent/src/rendering/emit-node.ts:137-230` never consults `maxRepeat`/`minRepeat` | Hide Add at max, Remove at min; a 5th job is still blocked at submit (MAX_REPEAT), which is spec-correct |
| E8 | MEDIUM | Validation result for the first repeat row came back as `r[1]` (spec requires 0-based) | Not traced | Investigate |

### Found in the browser review

| # | Severity | Problem | Where |
|---|---|---|---|
| R1 | MAJOR | Hiding a repeatable group hides its questions but leaves the "Job 1" heading, Remove Job, and Add Job on screen | webcomponent repeat rendering (`rendering/emit-node.ts:137-230`) doesn't apply the group's relevance to its own heading or buttons |
| R2 | MAJOR | After submit, focus stays at the top of the page; no error summary; invalid questions get red text but not the USWDS error bar | webcomponent submit flow + USWDS adapter error styling |
| R3 | MAJOR | Error text isn't linked to the question for screen readers (`aria-describedby` lists only the hint) | USWDS adapter field DOM (`formspec-adapters/src/uswds/shared.ts`) |
| R4 | MINOR | `prefix: "$"` on dollar fields isn't rendered | USWDS number input adapter |
| R5 | MINOR | Theme `widgetConfig` (`rows: 5`, `maxLength: 200`) ignored: text areas are 3 rows with no length limit or counter | theme resolution → text input behavior |
| R6 | MINOR | Read-only record values (employer name) render as a focusable text box instead of plain text | field renderer has no read-only display mode |
| R7 | MINOR | "Remove Job" shows on the only job even though at least 1 is required | same as E7 |

### Demo content bugs (mine, fixable in the definition)

- The Return to Work question appears before question 7 is answered; the screenshots show it only after a Yes or No.
- Hours, minutes, and earnings under Return to Work appear before a corrected date is entered: the rule compares an empty date, gets `null`, and a `null` show-rule means "show". Needs `present($correctedRtwDate)`.
- Date formats are inconsistent: "3/23/25" in two questions, "Mar 23, 2025" in another; the screenshots use 03/23/2025.
- Layout differences from the screenshots (hours and minutes side by side, City and State on one row, short ZIP) need a component layout, which is blocked by M1/M2.

## Forms MCP / studio-core (affects AI authoring)

| # | Severity | Problem | Root cause | Fix |
|---|---|---|---|---|
| M1 | BLOCKER | Saved layout binds repeat children to paths that don't exist, so those fields vanish when the layout is used | `cleanTreeForExport` (`formspec/packages/formspec-core/src/raw-project.ts:179-191`) advances the lookup prefix for plain groups but not for Accordion/DataTable children | Track separate lookup and write prefixes; add an export test for a repeat inside a group |
| M2 | MAJOR | Every save writes a layout file that hard-codes dropdowns/toggles, overriding the theme (spec says layout wins) | `_syncComponentTree` (`raw-project.ts:341-346`) always generates; `export()` always includes it; `writeBundle` always writes it (`formspec-mcp/src/tools/lifecycle.ts:91-95`); marker for generated trees removed in `13fd99a1c` | Only write the layout when it differs from the generated default |
| M3 | MAJOR | Every save writes an invalid empty mapping (`rules: []`, schema needs ≥1) | Default seed `mappings.default = { rules: [] }` (`raw-project.ts:260-264`), exported and written unconditionally (`lifecycle.ts:105-114`) | Export only mappings with rules |
| M4 | MAJOR | Re-opening a folder silently returns the old in-memory copy; shutdown autosave then overwrites disk edits | `registerOpen` returns the existing id (`formspec-mcp/src/registry.ts:209-213`); autosave in `src/server.ts:74-81`; no close/reload tool | Replace the project on re-open (refuse if dirty); add `close` to `manage_lifecycle` |
| M5 | MAJOR | Removing or changing a rule misses entries when a field has more than one rule entry | `bindFor` uses `find` (`formspec-core/src/queries/field-queries.ts:200`); `definition.setBind` edits the first entry only (`handlers/definition-binds.ts:154`). Callers: `studio-core/src/project-definition.ts:713,792,839,1284,1399`, `formspec-mcp/src/tools/query.ts:49` | Merge all entries in `bindFor`; fold entries in `setBind` |
| M6 | MAJOR | No MCP verb creates a Locale, so setting any message fails on a new form | `setLocale` (`formspec-mcp/src/product-tools.ts:236-256`) never calls `loadLocale`; facade has private `ensureLocale` (`studio-core/src/kernel/ProposalManagerFacade.ts:4751`) | Export `ensureLocale`, call it from `formspec_set_locale` |
| M7 | MAJOR | No MCP verb edits or removes an existing item (label, hint, delete) | Product tool set has add-only item verbs | Add update/remove item verbs |

## Found while moving the page to native USWDS

Fixed by the adapter-ownership pass (formspec ADR 0063): the adapter ships one self-contained stylesheet with typefaces and icons inlined and declares it; the theme names its adapter; hosts import no CSS. Verified in the browser: Source Sans Pro / Merriweather load from data URIs, the checked certification box shows its mark, the select has its caret.

| # | Severity | Problem | Root cause | Fix |
|---|---|---|---|---|
| N2 | MAJOR | The form applied USWDS at component level only: inputs stretched to the page column, required asterisks kept the browser's dotted underline, sections jammed against the previous question | The adapter build never forwarded USWDS's `usa-form` package (form width 20/30rem, inputs fill it, required-marker and button rules) and compensated with a global `$theme-input-max-width: none` | Forward `usa-form`; the render root extends `usa-form usa-form--large`; the global width override and the glue that faked width deleted (formspec 2fb52c11) |
| N3 | MAJOR | The red error bar started halfway down multi-line questions | Error modifier was applied to the `<fieldset>`; a fieldset's border starts at the legend's midpoint. USWDS puts it on a wrapping `usa-form-group` | Group widgets render inside `div.usa-form-group`; modifier lives there (bcc83676) |
| N4 | MAJOR | A theme `widget` on a display item was ignored (the benefit-week notice could not become USWDS's info alert) | Definition-fallback planner resolved theme widgets for fields only | Same resolution ladder for display items; `widgetConfig` reaches the component (99de0704) |
| N5 | MAJOR | Page flashed unstyled on reload; the form's column sat empty until the engine booted, then the submit row jumped | Renderer-linked CSS lands after first paint; no placeholder while WASM initializes; `formspec-render` was `display: inline` | Stylesheets declare themselves (`--formspec-layout`, `--formspec-adapter`), the renderer links only what the page lacks and hides the form until its links load; host element is block; a skeleton planned from the Definition holds the column until the engine swaps in (7c32f8dc, 4c4f58a9) |
| N1 | MAJOR | The adapter stylesheet references 18 font files and 23 images that the package does not ship, so every one 404s: headings fall back to the system serif instead of Merriweather, body text to the system sans instead of Source Sans Pro, and image-backed control states are blank — the checked checkbox mark (`correct8.svg`), the select caret (`unfold_more.svg`), the date-picker button icon (`calendar_today.svg`) | `packages/formspec-adapters/dist/uswds-integration.css` keeps USWDS's default `$theme-font-path` / `$theme-image-path` (`../fonts/`, `../img/`), but the package ships neither directory (`package.json` `files`, `scripts/build-css.mjs`) | Ship the directory the way USWDS does: `build-css.mjs` copies the referenced families (`source-sans-pro`, `merriweather`, `roboto-mono`) and `img/` from `@uswds/uswds/dist` into `dist/`, compiles with `$theme-font-path: "./fonts"` and `$theme-image-path: "./img"`, and `files` includes them; done when the demo loads with zero font/image warnings, headings render in Merriweather, and a checked certification box shows its mark |

## Aligned to the Figma frames

A second pass rewrote the Definition, Theme and Locale against the eight design
frames (`~/NJUI/image.png`, `image (1).png` … `image (7).png`). Validator:
`python -m formspec.validate ~/NJUI/formspec-demo/form-v2 --registry registries/formspec-common.registry.json`
— "All artifacts clean, 0 errors". Verified in the browser at 480 px form width.

### What the frames asked for and the artifacts now say

| Frame detail | Change |
|---|---|
| Two section headings only — "Eligibility Questions" and "Certification" | `retirement` and `work` are now children of `eligibility`, so USWDS gives them the plain nested legend and only the two top-level groups get `usa-legend--large`. Every Bind path, FEL reference and the host page's `initialData` moved under `eligibility.` |
| Hairlines between Q3a→Q4, Q4b→Q5, Q5c→retirement, employer questions→Q7, and before Certification | Five display Items with an empty label, themed `widget: "Divider"`. Renders as five 1 px rules |
| No "Work this week" heading | `work` nested (plain legend) + theme `labelPosition: "hidden"` — authored, not yet honored (below) |
| "Your employers on record" above the pension questions | The repeat group is relabelled; its rows read "Your employers on record 1 / 2" until Locale row labels land (below) |
| Lead line + "more than 99 hours" note above **Hours / Minutes** | New `hoursWorked` / `rtwHoursWorked` groups carry the lead line as their label, with the note as a display Item themed `usa-hint`. The hint no longer hangs off `hours`. The pair's show/hide rule moved onto the group, so the legend and note hide with the boxes |
| Hours 6 / Minutes 6, City 6 / State 4 / ZIP 2 on a 12-column grid | Declared with core `presentation.layout` — `flow: "grid"`, `columns: 12` on the parent group, `grid.span` on each child (core §4.2.5.2). Not yet rendered (below) |
| Q6a answers read **No / Yes** | `amountChanged` carries inline options in that order instead of the `yesNo` OptionSet |
| Q5c hint ends "Use format mm/dd/yyyy" | `expectedReturnDate.hint` updated |
| Q7 "between Sunday, 03/23/2025 and Saturday, 03/29/2025" | `formatDate(…, 'full')` — the widest style FEL has (below) |
| "Add another job" button | Locale `jobs.addLabel` / `jobs.removeLabel` / `jobs.rowLabel` and `employersOnRecord.rowLabel` authored under the keys the renderer will read |

Conditional flow, the record-seeded employer rows and submit are unchanged:
Q1 "No" reveals 1a, Q7 "Yes" reveals the jobs repeat, and a complete form submits
with only the answers that applied (`1 job, 2 employers on record`).

### What waits on renderer capabilities

> Historical. F1–F9 closed in the passes recorded below (F3, F5 and F7 by the renderer honoring group `labelPosition`, group hints and rich text in labels — verified live in the rhythm pass). F10 is the one still open.

| # | What the frames show | What blocks it |
|---|---|---|
| F1 | Hours / Minutes side by side; City / State / ZIP on one row | Two gaps. (a) The definition-fallback planner plans **every** group as a `Stack` node dispatched to the `Group` adapter (`formspec-layout/src/planner-definition-fallback.ts` group branch; `formspec-webcomponent/src/rendering/emit-node.ts` `scopeChange` dispatch), so `layout.flow: "grid"` never becomes a grid context — children land as block siblings in the `<fieldset>`. (b) The per-child `grid.span` the planner *does* turn into `style.gridColumn` is dropped by the USWDS field wrapper, which applies only `cssClass` and `accessibility` from the cascade (`formspec-adapters/src/uswds/shared.ts` → `createUSWDSFieldDOM`; `formspec-adapters/src/helpers.ts`). The default adapter applies both `presentation.style` and the node style (`formspec-webcomponent/src/adapters/default/shared.ts:142,153`). Fix: plan a `flow: "grid"` group as a `Grid` node — the USWDS `Grid` adapter already maps `span N` onto `tablet:grid-col-N` (`uswds/layout/grid-shared.ts`) — and make the USWDS field wrapper apply style like the default one |
| F2 | Short Hours, Minutes and ZIP boxes | Every input fills the 30 rem `usa-form--large` column; no per-field input-width lever reaches the control |
| F3 | No "Work this week" legend (and no "Return to work on record") | `renderUSWDSGroup` draws a legend whenever the node has a title and never reads `labelPosition` (`uswds/layout/group.ts`), so theme `labelPosition: "hidden"` on a group is inert. Group titles also always exist — the planner falls back to the item key — so an authored empty label cannot suppress one either |
| F4 | One "Your employers on record" sub-head, rows unlabelled; "Add another job" | Repeat row and button text is derived from the group label (`formspec-webcomponent/src/rendering/group-behaviors.ts` — `addLabel`, `rowText`), so the Locale keys authored here are ignored: the button reads "Add Job" and the employer rows read "Your employers on record 1 / 2". **TODO:** re-check once the Locale switch for repeat add/remove/row labels lands |
| F5 | The 99-hour note as the group's own hint | A Group `hint` is schema-valid but the planner puts only `title`/`bind` on a group node and the Group adapter renders no description, so the note is authored as a display Item themed `usa-hint`. Fold it back into `hoursWorked.hint` when group hints render |
| F6 | "Sunday, 03/23/2025" | FEL `formatDate` takes short/medium/long/full only, and in the reference implementation `full` is an alias of `long` (`fel-core/src/evaluator/builtins/locale.rs` → `format_date_locale`): "March 23, 2025". No weekday, and no `mm/dd/yyyy` pattern at all. Q7 therefore reads "March 23, 2025" while the other dates read "Mar 25, 2025" |
| F7 | Q1's hint as a paragraph plus a bullet list; bold runs in the earnings question; "false and misleading information" as a link in the certification text | Item `label` / `hint` are plain strings — no rich text |
| F8 | "> Help me answer this question" under Q7 and the work-type question | No Item-level help-link affordance |
| F9 | No red `*` on required questions | The renderer appends a required marker to every required field (`formspec-webcomponent/src/adapters/default/shared.ts`); no policy switch turns it off |
| F10 | "Retirement and pension" / "Your employers on record" in bold | USWDS has two legend sizes: `usa-legend` (regular) and `usa-legend--large` (bold, section-sized). A bold sub-head at body size has no USWDS class |

### Closed by the rich-text / repeat-cards / references pass

The renderer now carries everything the frames needed and the demo uses it: rich-text hints, labels and display text (Q1's bulleted examples, the bold benefit-week dates, the linked certification sentence), "Help me answer this question" links from `form-v2.references.json`, no required asterisks (`defaults.requiredIndicator: "none"`), grid-flow groups (Hours/Minutes, City/State/ZIP rows), hidden group legends and group hints, the `RepeatCards` presentation for jobs with Locale-owned "Add another job" / row labels, the `Hidden` widget for the employer name, and an empty row label on the employer rows. Two renderer defects surfaced while wiring it and were fixed in formspec (a group nested in a repeat row, and any group rendered inside an adapter's Grid cell, came back as a page section — heading depth now flows through both paths). Date patterns followed (fel-core 164d562, formspec 754c11bb): `full` names the weekday, and the Locale's `formats.date` gives `medium`/`full` the `03/23/2025` / `Sunday, 03/23/2025` shape the screens use. Input width stops followed (formspec d20d4239): `widgetConfig.width` stops on ZIP, Hours/Minutes and phone. **Regressed since:** splitting the USWDS stylesheet into base and rules layers (ADR 0063 D-4) moved `usa-form`'s `:where(.usa-input…) { max-width: none }` into the later rules layer, where it outranks the width classes by source order — the classes render but compute to `max-width: none` (verified in the Figma round-2 review). Closed below (formspec d02b34da).

### Rhythm pass (formspec edf41f2d)

Re-checked against the frames after the above landed. Fields sat 24 px apart — USWDS's own `usa-form-group` margin — where every frame uses 40 px; the Theme now sets the semantic `spacing.field` token to 2.5rem and the USWDS adapter reads it for that margin (Theme spec §3.2), with Formspec's structural stack gap dropped under the USWDS root so the rhythm has one owner (repeat rows had been 36 px). "Help me answer this question" moved into its own row with a unit-2 gap above; the frame's `>` chevron is NJ's, not USWDS's, and was left out. "Add another job" carries the structural `formspec-repeat-add` class the accordion layout already had, so it is label-width and left-aligned. The counter was already live (`181 characters left`, screen-reader status after a one-second pause, `5 characters over limit` in the error style); the frames' `200/200` is NJ's wording, not USWDS's.

Re-verified live in the same pass: submit moves focus to the first invalid question and every invalid group shows the USWDS error bar with the error text in `aria-describedby` (R2, R3); Remove is gone on the only job and Add is gone at four (E7, R7); the first job's results come back as `jobs[0]` and land on that row (E8); Return to Work waits for Q7 and its hours wait for a corrected date (the content bugs above). No error summary is drawn: the frames show none, and the `ValidationSummary` display widget is there if one is wanted.

**Content pass (documents only, no renderer change).** Three frame details traced to the documents, not the renderer: the "up to 4 employers" notes take the Theme's `usa-hint` class like the 99-hour notes; the two gross-earnings labels were paraphrased and had lost the frames' sentence and its bold runs ("…**before any deductions** are taken out and **includes tips.**"), restored in the Definition; the Return-to-Work group's legend is hidden in the Theme like the work group's, since the frames show no heading there. Q1's hint is regular weight in the frames too — nothing lost. A dead contract surfaced on the way and is filed as fs-1u4n: Core `styleHints.emphasis` is declared, typed and read by nothing. One renderer gap did surface: no adapter rendered a repeatable group's own title, so "Your employers on record" never appeared (formspec 18e8aded fixes it in every adapter; the jobs group's title is hidden in the Theme, as the frames show cards with no heading above them). The typed-date defect ("12/22/2026" reported as an invalid date) traced to the USWDS DatePicker rendering USWDS's pre-enhancement markup without its script; the adapter now mounts USWDS's own date-picker module (formspec b510909e), which also brings the calendar the frames show.

**F10 closed by an adapter variant (formspec ADR 0064, 0063 D-4).** "Retirement and pension" and "Your employers on record" are bold now, and not through the Theme: they are NJ's house rule, so they live in `app/uswds-nj.scss`, a variant compiled from the adapter's shipped `uswds-base.scss` partial. The adapter marks every group legend with `formspec-group-title` and its heading depth, so the rule targets sub-sections (h4/h5) without bolding the h6 lead lines ("Enter the total number of hours…") or any question legend. The same file carries the frames' `>` chevron on help links. The page pre-links three layers (structure, NJ base, Formspec's USWDS rules) and the renderer links nothing twice; a host that already loads USWDS from a CDN would pre-link the rules layer alone. Verified live: h3 large, h4/h5 700, h6 400, question legends 400, chevron present, zero warnings.

**Spanish.** `form-v2.es.locale.json` translates the whole form; switching surfaced three renderer gaps, all fixed: option labels ignored the Locale's cascade (the choice behaviors bypassed the engine's resolved options — formspec 895938e5), FEL had no Spanish month or weekday names (fel-core d20092c), and the renderers' own chrome ("Add …", "Select…", "Next", the character counter, the date hint, "Close", …) was hardcoded English — Locale §3.1.10 now defines a closed `$ui.<key>` family (one inventory shared by the web component, the USWDS and Tailwind adapters and the React renderer; schema enum and lint keep it closed, and it has since grown to cover the data table, the wizard's step wording, the validation summary's sentences, the file-upload dropzone and the screener — ticket fs-ujlr) and `form-v2.es.locale.json` authors every key, so the counter reads "Quedan 173 caracteres" and the locked employers repeat "Agregar Sus empleadores registrados" (ticket fs-89ge closed). One aria string still composes English: the accessible name of a row whose heading the Locale authored ("Empleo 1 of 2").

### Figma round 2 (review/figma-round2/)

A second full comparison against the eight frames, on the production build after the USWDS simplification. Open, most visible first: the frames' Last day of Work block (748–754) has no counterpart in the Definition; the job card has no "Save job" button; the work-type definitions render as a seven-line hint where the frames keep them in the margin; City/State/ZIP sit in one row (5/4/3) where the frames put City and State half and half and ZIP below; three gaps double to ~80px where a hidden-legend group's margin stacks on its first question's (divider → Q7, help link → Return to Work, divider → Certification); the 99-hour note is still a display item (F5's move into the group hint never happened), so note → Hours is 57px; "Job 1" renders as a 14.56px Merriweather h5 because the rules layer's h5 size outranks `.usa-card__heading`; the width-stop regression above. Type and control sizes (Public Sans, 28px line pitch, larger controls) may be the frames being drawn above 1:1 — worth asking the designer before changing the 2.5rem field token, which was measured from the same frames. Confirmed fixed in the same pass: F1, F3, F4, F6–F10, R2, R4–R7, N1, N3, N4, dates, conditional logic, every error message's wording.

### Round 2 applied (formspec 8a538fee, bf1ed1c6, d02b34da, d5dacd6a)

Each open item traced to one structural cause, fixed once rather than per gap:

- **Width stops and the card heading** had one cause: the rules layer re-derived `usa-form` with `@extend`, so its copies loaded after USWDS and outranked it. The adapter now declares `usa-form usa-form--large` as the render root's classes (formspec bf1ed1c6), the rules layer drops the partial (11 KB to 8 KB), and headings join the zero-specificity reset (d02b34da). ZIP takes USWDS's `md` stop at 165px; "Job 1" is 18px Source Sans, NJ's `$theme-card-header-typeset` in `app/uswds-nj.scss`.
- **The doubled and missing gaps** had one cause: fields, display text and dividers each owned a different margin. One rule now gives all three the `spacing.field` gap above and no bottom margin, and a group whose title is hidden no longer adds a form-group gap on top of its first question's; one group shell builds every titled group in the adapter, replacing three copies. Every measured gap is now 32px, with the token recalibrated to 2rem from the frames' ratio of question gap to line pitch, since the frames are not drawn 1:1.
- **Content**, documents only: the Last day of Work block (748–754) mirrors Return to Work, with its date window as a Bind rule; the 99-hour notes are group hints; City and State share a row with ZIP below; the work-type definitions are left to the help link; the corrected Return to Work date shows the format hint; typographic apostrophes and quotes; the State select reads `-Select-`.
- **The date-window message** surfaced two engine defects. A Bind `constraintMessage` surfaced its `{{…}}` unresolved, where Core requires a surfaced message to carry none (formspec 8a538fee: the evaluator resolves it as it does a Shape message; spec, schema and an all-codes conformance case updated). The renderer then showed the processor's message instead of Locale cascade step 3, so its date ignored the Locale's formats (formspec d5dacd6a: the view model reads the Bind's template). It now reads "between 01/05/2024 and today", and the Spanish Locale carries its own `correctedLdwDate.constraintMessage`.

A code review of those commits found two more ways a message diverged and one spacing edge, all fixed. `{{$}}` in a message showed blank at the field while the report showed the value, and every summary printed the processor's message instead of the field's (formspec 57ca029d: messages bind `$` to their field, and summaries read the engine's `resolveValidationMessage`). A group whose title is hidden and that opens with a hint or a card sat flush against the field above (formspec 431e9df7). Still open, filed as fs-fmgq: in the Rust evaluator a Bind constraint inside a repeat row cannot see `@index` or `@count`, so a report message using them prints blanks; this form does not use them.

Verified on the dev and production builds: every gap 32px, including note to first job card, ZIP 165px, card heading 18.08px Source Sans, root 480px Source Sans, both employer rows, hidden legends still naming their fieldsets, chevron outside the link underline, English and Spanish messages, console clean. Left as they are: "Save job" (a product decision, not a rendering gap), type and control sizes and colors (the frames are not to scale), and bold error labels (stock USWDS does not bold them).

