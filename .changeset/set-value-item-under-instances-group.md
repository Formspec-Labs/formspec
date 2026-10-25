---
"@formspec-org/engine": patch
---

<!-- tier: foundation -->

`setValue` keeps respondent input to a field under a group keyed `instances`, a legal Item key. It read `instances.<name>…` as an instance target before looking up the field, so the input was lost: with a writable instance of that name the value went into the instance and the field stayed null; with none, `setValue` threw `Unknown instance`. A path that names an Item now writes that Item; only a path naming no Item targets an instance.
