---
"@formspec-org/walk": minor
"@formspec-org/react": patch
---

<!-- tier: foundation -->

Emit one readable Playwright spec per manifest form with `emit --manifest package-manifest.json --all --out-dir specs --url-template '/forms/{slug}' --axe`. Each spec checks the mounted Definition, and the axe test scans the whole host page. Use `--root` to select the form to navigate. Templates accept `{formId}` and `{slug}` as URL-encoded values. Relative host URLs use Playwright’s configured base URL.

Run the specs with `formspec-walk test --summary walk.json`. Each form lists discovered tests and their attempts, walk findings, uncovered items and axe reports. Each attempt with an axe report records its index in the form’s `axe` array. The summary retains the runner’s verdict and global errors, including a failure when execution was expected and no tests ran.

The React renderer marks its mounted Definition so the walk can recognize a display-only form. The walk waits for the live form in either renderer.
