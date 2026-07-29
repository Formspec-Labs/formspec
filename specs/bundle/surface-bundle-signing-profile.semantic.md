The profile separates byte integrity from host admission. The verifier consumes
one immutable acquisition snapshot, constructs the domain-separated canonical
preimage, resolves the protected `kid` through independent deployment
configuration, and preserves the integrity receipt unchanged through later
checks.

Deployment trust decides whether that key may publish the signed app with the
selected method at `checkedAt`. Release policy then rejects unpinned, stale, or
conflicting payloads. In monotonic mode, the durable store atomically
re-evaluates and commits only after schema, app-graph, actor, entry, and
dereference checks pass.

`verified`, `failed`, and `unverified` report integrity, trust, and release
precheck outcomes. `admitted`, `refused`, and `unavailable` report the later host
decision. Sidecar keys, signer names, signing times, affirmation text, and raw
public keys never become verified facts.
