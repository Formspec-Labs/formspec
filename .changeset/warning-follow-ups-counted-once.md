---
"@formspec-org/layout": minor
"@formspec-org/react": minor
"@formspec-org/surface": minor
"@formspec-org/surface-react": minor
"@formspec-org/assist": minor
---

<!-- tier: foundation -->

**Breaking**

- Layout `summarizeFormProgress` requires its explanation-state argument (`ExplanationStateLike | null`), and `ExplanationStateLike` requires `instances` and `groups`, with each group's `shapeIds` and `paths`. Omitting it used to count an answered follow-up again as its warnings.
- An owed warning explanation or group acknowledgement (Core §5.3.1) is counted once under `toCheck` in every validation profile, and in the new `followUps` count. It is listed in the new summary `followUps`, not in `findings`, and it keeps `form.ready` false; `pageProgressIssue` still reports such a page as `invalid`. A Submit report's explanation errors no longer count under `toFix`.
- A current group acknowledgement explains only the firings it covers (its code, Shape and path), not every warning that shares its code.

**Added**

- Layout `declaresWarningFollowUps`, `readFormProgressFollowUpRows` and `warningAcknowledgementLegend`.
- React `acknowledgementLink` workspace prop: the Findings margin lists each owed follow-up once and links a group to the control that accepts it.
- Surface plans a form slot's `draftReviewHref` from the one review route whose binding resolves to it, and reports `SLOT-BINDING-INCOMPLETE` (`draft-review-ambiguous`) when two or more review it. Surface React links Findings to that route, `?acknowledge=<code>`, whose arrival moves focus from the route heading to the group's enabled Accept button.
- React shows a Submit-timing warning's explanation control beside its field before Submit once the explanation state names it, and a Findings row for an owed explanation lands in that control. The form reads the explanation state once edits pause, and at once for an answer or a Submit; before Submit and while no live warning fires, typing therefore costs no Submit evaluation.
- Assist reports an owed follow-up: `getProgress().ready` is false, and `formspec.form.nextIncomplete` returns reason `follow-up` (a group acknowledgement belongs to no page).
