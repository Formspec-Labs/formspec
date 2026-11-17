---
"@formspec-org/walk": minor
---

<!-- tier: foundation -->

The Definition Walk now makes a native select choice with one keyboard action and checks the displayed value, field state and exported Response before restoring the original answer. The public `Walk.choice()` check can also run independently. It can reach a choice in an initially empty repeat. Emitted test titles remain distinct when group labels repeat or long labels share a prefix. The new `formspec-walk test <spec>` command and `@formspec-org/walk/reporter` export fail when no tests execute, including all-skipped runs and `--pass-with-no-tests`. Listing tests and shards with no assigned tests remain successful.

Choice checks report unsupported native typeahead labels as uncovered rather than falsely failing a correct control. Playwright supplies printable US-layout keys; the walk includes punctuation and explicitly reports when no option can be exercised.
