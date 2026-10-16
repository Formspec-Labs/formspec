# Accessibility document checks

**Status:** draft. Source: ADR 0166 §3 step 1 (formspec-stack `thoughts/adr/0166-real-receipt-integrity-features.md`).

`formspec-lint` checks a form version's pinned Definition, Theme and Locale documents for accessibility defects that can be decided from the documents alone. Each rule carries the WCAG 2.2 success criteria it serves in `specs/lint-codes.json` (`wcag`), and its registry `severity` decides what happens: an error blocks publish, a warning is reported and publishes.

The check claims only that these rules found nothing in these documents. It is not a statement of WCAG conformance. What a document cannot decide (the rendered page, the quality of a label, languages the heuristics do not read) is covered by the reference-renderer check (`@formspec-org/walk`, axe-core) or listed for human review in that tool's report.

`check_accessibility(definition, theme, locales)` runs every rule over one version's documents and returns each rule's outcome; the same rules also run per document inside `lint`.

## E1900 empty label

A field or group whose `label` is empty or whitespace has no accessible name (1.3.1, 3.3.2, 4.1.2).

## E1901 locale empty label

A Locale string `<itemKey>.label` (with or without an `@context`) that is empty or whitespace leaves the item nameless in that language. Deleting the key restores the Definition's label (1.3.1, 3.3.2, 4.1.2).

## E1902 empty option label

An option, in an item's inline `options`, in an `optionSets` entry, or in a Locale string `<itemKey>.options.<value>.label`, whose label is empty or whitespace (1.3.1, 4.1.2).

## E1903 contrast below AA

An effective Theme colour pair (declared in `contrastPairs`, or a platform pair a Theme token override touches) whose WCAG 2.2 contrast ratio is below the usage floor: 4.5:1 for `normalText`, 3:1 for `largeText` and `uiComponent` (1.4.3, 1.4.11). A pair that reaches the floor but not the Theme's own stricter `minimumRatio` is the advisory W714, not an error. A pair that cannot be reduced to opaque sRGB is not judged.

## W1900 locale missing label

A Locale that writes some item labels but not this field's or group's, where no Locale in its `fallback` chain writes it, shows the Definition's wording for that item, which may be in another language (3.1.2). A Locale that writes no item labels is not judged.

## W1901 duplicate option label

Two options in one list whose labels are equal ignoring case and spacing cannot be told apart (3.3.2).

## W1902 duplicate sibling label

Two fields or groups under the same parent with equal labels (ignoring case and spacing) cannot be told apart in a list of controls or headings (2.4.6). Labels computed by `{{ }}` are not compared.

## W1903 colour as instruction

English text in a label, hint or description that points at something by colour alone, such as "fields marked in red" or "the green button" (1.4.1, 1.3.3). A heuristic, so a warning; other languages are for human review.

## W1904 image syntax

Markdown image syntax in a label, hint or description. The rich-text subset (core §4.2.1) draws no images, so the text would be read aloud as punctuation (1.1.1). The Definition, Theme and Locale documents have no other way to carry an image, so "images have alternative text" is decided for these documents by there being none.

## Not decided from the documents

Locale `locale` is required and pattern-checked by the Locale schema, so a missing or malformed language tag is already E101. No document property names an input purpose (1.3.5), so that criterion is for human review.
