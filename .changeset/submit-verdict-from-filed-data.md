---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: FormEngine recomputes calculated values and drops answers that become non-relevant after other answers are pruned when preparing submit data. The submit report uses the final evaluator findings as-is and includes relevant external findings. APIs that request the submit profile can throw “Submit evaluation did not converge on stable Response data”.
