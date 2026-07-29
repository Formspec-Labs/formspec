# Blind builder instruction

Build the app in the supplied mission with the public tools in this session.

No app is active. Call `formspec_wireframes_start_app` once; this session then
owns that app through preview, validation, and export.

Use only the mission, this instruction, the public tool catalog, and results or
diagnostics returned by your own calls. Do not read a repository, source file,
schema, test, plan, prior experiment, another agent's output, or generated
artifact. Do not use a shell, filesystem, internet, internal object, raw
loader, or out-of-band edit.

You have 90 minutes or 120 public tool calls, whichever ends first. Work
through public diagnostics when a call fails. Do not discard or hide failed or
partial work.

Before stopping:

1. read the app summary;
2. inspect the structured public preview;
3. run public validation and address errors you can fix through public tools;
4. export the result; and
5. state any unmet mission requirement and every assumption you made.

The runner records time and tool calls. Return the public export without
editing it.
