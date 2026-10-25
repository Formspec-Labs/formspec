---
"@formspec-org/layout": patch
"@formspec-org/webcomponent": patch
---

<!-- tier: foundation -->

Core §4.2.5.3 `styleHints.size` scales an item in the default skin again. Since `zoom` left the skin, the `compact` and `large` rules set font sizes inside `:where()`, and the base label, input and help rules outranked them, so nothing changed size. The hints now set `--formspec-size-scale` (0.875 or 1.125) at zero specificity, so states and Theme classes still restyle over them, and the base label, legend, description, hint, control, button and prefix/suffix sizes multiply it; the item's own text scales by `em`. The never-read size tokens the hints used to set (`--formspec-font-size-*`, `--formspec-default-font-size-*`, `--formspec-space-*`, `--formspec-control-height`) are gone.
