---
"@formspec-org/layout": patch
"@formspec-org/webcomponent": patch
---

<!-- tier: foundation -->

Core §4.2.5.3 `styleHints.size` scales an item in the default skin again. Since `zoom` left the skin, the `compact` and `large` rules set font sizes inside `:where()`, and the base label, input and help rules outranked them, so nothing changed size. The hints now set `--formspec-size-scale` (0.875 or 1.125) at zero specificity, so states and Theme classes still restyle over them, and every text and control size the skin gives an item multiplies it: label, legend, description, hint, field help, error, prefix/suffix, inputs and their widget parts, DataTable cells, display headings and group titles. The item's own text scales by `em`. A size inside another compounds (a `compact` item in a `large` group draws at 0.984), exactly to two levels. The never-read size tokens the hints used to set (`--formspec-font-size-*`, `--formspec-default-font-size-*`, `--formspec-space-*`, `--formspec-control-height`) are gone.
