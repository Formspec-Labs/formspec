/**
 * @filedesc Generates `lifecycle-walkthrough.html` FROM the evidence JSON.
 *
 * The JSON is the provenance; this file is the deliverable. Nothing here
 * invents a fact — every string rendered is read out of `evidence/lifecycle.json`,
 * which is written by the stage runners from the substrate's own returns.
 *
 * Written for a NON-ENGINEER. The default view is six plain-language stages and
 * a verdict board; substrate state is behind `<details>` and never the first
 * thing a reader meets. Refusals quote the substrate verbatim because the whole
 * point of a refusal beat is that the machine said it, not that we did.
 *
 * **Design note.** Typography carries a distinction the content actually has:
 * a bookish serif is what a person meant to do, monospace is what the substrate
 * said back. The palette is the exemplar's own — the tenant brand oxblood the
 * demo pushes at four routes — so the page is coloured by the thing under test.
 * Self-contained: no CDN, no external font, no fetch.
 */
import { writeFileSync } from 'node:fs';
import { WALKTHROUGH_PATH, type BarResult, type Beat, type StageRecord } from './harness.js';

export interface WalkthroughInput {
  exemplar: { title: string; bundleId: string; brief: Array<{ id: string; text: string; unitId: string }> };
  stages: StageRecord[];
  bars: BarResult[];
  signature: Record<string, unknown>;
  verification: Record<string, unknown>;
  moat: Record<string, unknown>;
}

const STAGE_TITLES: Record<string, { label: string; plain: string }> = {
  idea: { label: 'Idea', plain: 'Somebody describes the job' },
  plan: { label: 'Plan', plain: 'It becomes a real form' },
  build: { label: 'Build', plain: 'A person takes the pen' },
  'sign-off': { label: 'Sign-off', plain: 'On the record, and signed' },
  release: { label: 'Release', plain: 'What the tenant may restyle' },
  feedback: { label: 'Feedback', plain: 'It changes, and regenerates' },
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json(value: unknown): string {
  return esc(JSON.stringify(value, null, 2));
}

function beatHtml(beat: Beat): string {
  const chip =
    beat.outcome === 'refused'
      ? '<span class="chip chip--refused">Refused</span>'
      : beat.outcome === 'admitted'
        ? '<span class="chip chip--admitted">Allowed</span>'
        : '<span class="chip chip--noted">Noted</span>';
  const who =
    beat.actor === 'ai-agent' ? 'The AI' : beat.actor === 'human' ? 'A person' : 'The substrate';
  // Attribution matters here: an `admitted`/`refused` message is the substrate's
  // own words, quoted verbatim; a `recorded` message is the walk's note about
  // something the substrate did NOT say. Labelling both "the substrate said"
  // would put words in its mouth, which is the one thing this page must not do.
  const quote = beat.message
    ? `<blockquote class="said said--${beat.outcome === 'recorded' ? 'walk' : 'substrate'}">`
      + `<span class="said__who">${beat.outcome === 'recorded' ? 'What the walk found' : 'The substrate said'}</span>`
      + `<code>${esc(beat.message)}</code></blockquote>`
    : '';
  const detail =
    beat.details && Object.keys(beat.details).length > 0
      ? `<details class="detail"><summary>What this looks like underneath</summary><pre>${json(beat.details)}</pre></details>`
      : '';
  return `<li class="beat beat--${beat.outcome}">
  <div class="beat__head">
    <span class="beat__who">${esc(who)}</span>
    <code class="beat__verb">${esc(beat.verb)}</code>
    ${chip}
  </div>
  <p class="beat__intent">${esc(beat.intent)}</p>
  ${quote}
  ${detail}
</li>`;
}

function stageHtml(stage: StageRecord, index: number): string {
  const meta = STAGE_TITLES[stage.stage] ?? { label: stage.stage, plain: '' };
  const refusals = stage.beats.filter((b) => b.outcome === 'refused').length;
  return `<section class="stage" id="stage-${esc(stage.stage)}">
  <header class="stage__head">
    <span class="stage__num">${index + 1}</span>
    <div>
      <h2 class="stage__title">${esc(meta.label)}</h2>
      <p class="stage__sub">${esc(meta.plain)}</p>
    </div>
    ${refusals > 0 ? `<span class="stage__flag">${refusals} refusal${refusals === 1 ? '' : 's'}</span>` : ''}
  </header>
  <p class="stage__narration">${esc(stage.narration)}</p>
  <ol class="beats">${stage.beats.map(beatHtml).join('\n')}</ol>
  <details class="detail detail--state">
    <summary>What exists in the substrate after this stage</summary>
    <pre>${json(stage.substrateState)}</pre>
  </details>
</section>`;
}

function barHtml(bar: BarResult): string {
  return `<article class="bar bar--${bar.met ? 'met' : 'unmet'}">
  <header class="bar__head">
    <span class="bar__id">${esc(bar.id)}</span>
    <span class="bar__verdict">${bar.met ? 'Met' : 'Not met'}</span>
  </header>
  <h3 class="bar__title">${esc(bar.title)}</h3>
  ${bar.qualifier ? `<p class="bar__qualifier">${esc(bar.qualifier)}</p>` : ''}
  <p class="bar__criterion">${esc(bar.criterion)}</p>
  ${bar.finding ? `<p class="bar__finding">${esc(bar.finding)}</p>` : ''}
  <details class="detail"><summary>Evidence</summary><pre>${json(bar.evidence)}</pre></details>
</article>`;
}

export function renderWalkthrough(input: WalkthroughInput): string {
  const met = input.bars.filter((b) => b.met).length;
  const verification = input.verification as { result?: string; digestMatches?: boolean; recomputedDigest?: string; methodUriFromEnvelope?: string; inputsRead?: string[]; tamperResult?: string };
  const moat = input.moat as { survivingEdits?: number; totalEdits?: number; mergeAttempt?: { entryPoint?: string | null; outcome?: string }; edits?: Array<{ id: string; what: string; survived: boolean; deltaClass: string }> };
  const signature = input.signature as { record?: { signerName?: string; affirmationText?: string; signedPayload?: { digest?: string; canonicalization?: string } } };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.exemplar.title)} — the whole life of one app</title>
<style>
  :root {
    color-scheme: light dark;
    --ground: #EDEEE9;
    --surface: #F7F7F4;
    --surface-sunk: #E3E5DE;
    --ink: #20211D;
    --ink-soft: #55584F;
    --ink-faint: #8A8D83;
    --rule: #D0D3C9;
    --accent: #7A1F3D;
    --accent-soft: #F0E2E7;
    --affirm: #2F6B4F;
    --affirm-soft: #DFEBE4;
    --note: #6B6455;
    --shadow: 0 1px 0 rgba(32, 33, 29, .06), 0 8px 24px -18px rgba(32, 33, 29, .5);

    --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #171916;
      --surface: #1F221D;
      --surface-sunk: #141610;
      --ink: #E7E9E0;
      --ink-soft: #A9AC9F;
      --ink-faint: #767A6D;
      --rule: #343829;
      --accent: #D48DA0;
      --accent-soft: #3A2229;
      --affirm: #7CC29B;
      --affirm-soft: #1E2E25;
      --note: #B5AB93;
      --shadow: 0 1px 0 rgba(0,0,0,.4), 0 10px 30px -20px rgba(0,0,0,.9);
    }
  }
  :root[data-theme="dark"] {
    --ground: #171916; --surface: #1F221D; --surface-sunk: #141610;
    --ink: #E7E9E0; --ink-soft: #A9AC9F; --ink-faint: #767A6D; --rule: #343829;
    --accent: #D48DA0; --accent-soft: #3A2229; --affirm: #7CC29B; --affirm-soft: #1E2E25;
    --note: #B5AB93;
    --shadow: 0 1px 0 rgba(0,0,0,.4), 0 10px 30px -20px rgba(0,0,0,.9);
  }
  :root[data-theme="light"] {
    --ground: #EDEEE9; --surface: #F7F7F4; --surface-sunk: #E3E5DE;
    --ink: #20211D; --ink-soft: #55584F; --ink-faint: #8A8D83; --rule: #D0D3C9;
    --accent: #7A1F3D; --accent-soft: #F0E2E7; --affirm: #2F6B4F; --affirm-soft: #DFEBE4;
    --note: #6B6455;
    --shadow: 0 1px 0 rgba(32, 33, 29, .06), 0 8px 24px -18px rgba(32, 33, 29, .5);
  }

  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 50rem; margin: 0 auto; padding: 3.5rem 1.25rem 6rem; }
  @media (min-width: 60rem) { .wrap { padding-left: 2rem; padding-right: 2rem; } }

  /* ── masthead ─────────────────────────────────────────────────── */
  .masthead { border-bottom: 2px solid var(--ink); padding-bottom: 1.5rem; margin-bottom: 2.5rem; }
  .eyebrow {
    font-family: var(--mono); font-size: .7rem; letter-spacing: .16em;
    text-transform: uppercase; color: var(--ink-faint); margin: 0 0 .9rem;
  }
  h1 {
    font-family: var(--serif); font-weight: 600; font-size: clamp(2rem, 6vw, 3.1rem);
    line-height: 1.08; letter-spacing: -.015em; margin: 0 0 .7rem; text-wrap: balance;
  }
  .standfirst {
    font-family: var(--serif); font-size: 1.14rem; line-height: 1.55;
    color: var(--ink-soft); margin: 0; max-width: 40ch;
  }

  /* ── brief ────────────────────────────────────────────────────── */
  .brief { margin: 0 0 3rem; padding: 1.4rem 1.5rem; background: var(--surface); border: 1px solid var(--rule); box-shadow: var(--shadow); }
  .brief h2 { font-family: var(--mono); font-size: .7rem; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-faint); margin: 0 0 .9rem; font-weight: 500; }
  .brief ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .6rem; }
  .brief li { font-family: var(--serif); font-size: 1.05rem; display: flex; gap: .85rem; align-items: baseline; }
  .brief .tag { font-family: var(--mono); font-size: .68rem; color: var(--accent); flex: none; padding-top: .2em; }

  /* ── verdict board ────────────────────────────────────────────── */
  .board { margin: 0 0 3.5rem; }
  .board__head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--rule); padding-bottom: .6rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
  .board__head h2 { font-family: var(--serif); font-size: 1.45rem; margin: 0; font-weight: 600; }
  .tally { font-family: var(--mono); font-size: .8rem; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  /* minmax(0,1fr) + min-width:0 — grid and flex children default to
     min-width:auto, so one long unbreakable string inside a card widens the
     whole track and pushes the page sideways on a phone. */
  .bars { display: grid; gap: .9rem; grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 46rem) { .bars { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  .bar { min-width: 0; background: var(--surface); border: 1px solid var(--rule); border-left: 3px solid var(--affirm); padding: 1rem 1.1rem; }
  .bar > * { min-width: 0; overflow-wrap: anywhere; }
  .bar--unmet { border-left-color: var(--accent); }
  .bar__head { display: flex; justify-content: space-between; align-items: baseline; gap: .6rem; }
  .bar__id { font-family: var(--mono); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); }
  .bar__verdict { font-family: var(--mono); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: var(--affirm); font-weight: 600; }
  .bar--unmet .bar__verdict { color: var(--accent); }
  .bar__title { font-family: var(--serif); font-size: 1.06rem; margin: .35rem 0 .4rem; font-weight: 600; line-height: 1.3; }
  /* A limit on a met verdict reads at headline weight, not footnote weight —
     it is part of the claim, so it sits above the criterion and in serif. */
  .bar__qualifier {
    font-family: var(--serif); font-size: .95rem; font-style: italic; line-height: 1.45;
    color: var(--note); margin: 0 0 .5rem; padding-left: .7rem; border-left: 2px solid var(--note);
  }
  .bar__criterion { font-size: .87rem; color: var(--ink-soft); margin: 0; }
  .bar__finding { font-size: .87rem; margin: .6rem 0 0; padding: .6rem .75rem; background: var(--accent-soft); border-left: 2px solid var(--accent); color: var(--ink); }

  /* ── stages ───────────────────────────────────────────────────── */
  .stages { display: flex; flex-direction: column; gap: 3rem; }
  .stages > * { min-width: 0; }
  .stage { min-width: 0; }
  .stage__head { display: flex; align-items: flex-start; gap: 1rem; border-bottom: 1px solid var(--rule); padding-bottom: .75rem; margin-bottom: 1.1rem; flex-wrap: wrap; }
  .stage__num {
    font-family: var(--mono); font-size: .8rem; font-weight: 600;
    width: 2rem; height: 2rem; flex: none; display: grid; place-items: center;
    border: 1px solid var(--ink); border-radius: 50%; font-variant-numeric: tabular-nums;
  }
  .stage__title { font-family: var(--serif); font-size: 1.6rem; margin: 0; font-weight: 600; line-height: 1.1; }
  .stage__sub { font-family: var(--mono); font-size: .72rem; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-faint); margin: .2rem 0 0; }
  .stage__flag { margin-left: auto; font-family: var(--mono); font-size: .68rem; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); align-self: center; }
  .stage__narration { font-family: var(--serif); font-size: 1.14rem; line-height: 1.62; margin: 0 0 1.5rem; max-width: 62ch; }

  .beats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .55rem; }
  .beat { min-width: 0; background: var(--surface); border: 1px solid var(--rule); border-left: 3px solid var(--rule); padding: .8rem .95rem; }
  .beat--admitted { border-left-color: var(--affirm); }
  .beat--refused { border-left-color: var(--accent); }
  .beat--recorded { border-left-color: var(--note); }
  .beat__head { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
  .beat__who { font-size: .78rem; font-weight: 600; letter-spacing: .01em; }
  .beat__verb { font-family: var(--mono); font-size: .72rem; color: var(--ink-faint); }
  .chip { margin-left: auto; font-family: var(--mono); font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; padding: .18em .5em; border: 1px solid currentColor; }
  .chip--admitted { color: var(--affirm); }
  .chip--refused { color: var(--accent); }
  .chip--noted { color: var(--note); }
  .beat__intent { font-family: var(--serif); font-size: 1.02rem; margin: .4rem 0 0; line-height: 1.5; overflow-wrap: anywhere; }
  .beat__verb { overflow-wrap: anywhere; }

  .said { margin: .7rem 0 0; padding: .7rem .85rem; background: var(--surface-sunk); border-left: 2px solid var(--accent); }
  .said--walk { border-left-color: var(--note); border-left-style: dashed; }
  .said__who { display: block; font-family: var(--mono); font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: .35rem; }
  .said code { font-family: var(--mono); font-size: .8rem; line-height: 1.55; color: var(--ink); overflow-wrap: anywhere; }

  /* ── seal (the signature) ─────────────────────────────────────── */
  .seal { margin: 3.5rem 0; padding: 1.6rem 1.5rem; background: var(--surface); border: 1px solid var(--ink); box-shadow: var(--shadow); }
  .seal h2 { font-family: var(--serif); font-size: 1.45rem; margin: 0 0 .3rem; font-weight: 600; }
  .seal__sub { font-family: var(--mono); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-faint); margin: 0 0 1.1rem; }
  .seal__affirm { font-family: var(--serif); font-size: 1.1rem; font-style: italic; margin: 0 0 1.2rem; padding-left: 1rem; border-left: 2px solid var(--accent); max-width: 52ch; }
  .facts { display: grid; gap: .55rem; margin: 0; }
  @media (min-width: 40rem) { .facts { grid-template-columns: 12rem 1fr; align-items: baseline; } }
  .facts dt { font-family: var(--mono); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); }
  .facts dd { font-family: var(--mono); font-size: .82rem; margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .verdict-inline { font-weight: 600; color: var(--affirm); }
  .verdict-inline--bad { color: var(--accent); }

  /* ── moat ─────────────────────────────────────────────────────── */
  .moat { margin: 3.5rem 0 0; padding: 1.6rem 1.5rem; background: var(--accent-soft); border: 1px solid var(--accent); }
  .moat h2 { font-family: var(--serif); font-size: 1.45rem; margin: 0 0 .3rem; font-weight: 600; }
  .moat__sub { font-family: var(--mono); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin: 0 0 1.1rem; }
  .moat p { max-width: 62ch; }
  .moat__why { overflow-wrap: anywhere; font-family: var(--mono); font-size: .78rem; line-height: 1.65; background: var(--surface); border: 1px solid var(--rule); padding: .8rem .9rem; margin: 1.2rem 0 0; }
  .edits { list-style: none; margin: 1.2rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
  .edits li { min-width: 0; background: var(--surface); border: 1px solid var(--rule); padding: .75rem .9rem; display: flex; gap: .8rem; align-items: baseline; flex-wrap: wrap; }
  .edits .what { font-family: var(--serif); font-size: 1rem; flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; }
  .edits .verdict { font-family: var(--mono); font-size: .66rem; letter-spacing: .1em; text-transform: uppercase; }

  /* ── details ──────────────────────────────────────────────────── */
  .detail { margin-top: .7rem; }
  .detail summary {
    font-family: var(--mono); font-size: .68rem; letter-spacing: .08em; text-transform: uppercase;
    color: var(--ink-faint); cursor: pointer; padding: .15rem 0; list-style: none; display: inline-flex; gap: .45rem; align-items: center;
  }
  .detail summary::-webkit-details-marker { display: none; }
  .detail summary::before { content: "+"; font-size: .9rem; line-height: 1; }
  .detail[open] summary::before { content: "\\2212"; }
  .detail summary:hover, .detail summary:focus-visible { color: var(--accent); }
  .detail pre {
    margin: .55rem 0 0; padding: .8rem .9rem; background: var(--surface-sunk); border: 1px solid var(--rule);
    font-family: var(--mono); font-size: .74rem; line-height: 1.5; overflow-x: auto; color: var(--ink-soft);
  }
  .detail--state summary { color: var(--ink-soft); }

  footer { margin-top: 4rem; padding-top: 1.2rem; border-top: 1px solid var(--rule); font-family: var(--mono); font-size: .72rem; color: var(--ink-faint); line-height: 1.7; }
  footer code { overflow-wrap: anywhere; }
  a { color: var(--accent); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>

<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">One application &middot; six stages &middot; nothing hidden</p>
    <h1>${esc(input.exemplar.title)}</h1>
    <p class="standfirst">Watch one small government application go from a sentence somebody said, to a signed release, to a change request that rebuilds it &mdash; and see exactly what the machinery allowed, refused, and lost along the way.</p>
  </header>

  <section class="brief">
    <h2>The brief it started from</h2>
    <ol>
      ${input.exemplar.brief.map((line) => `<li><span class="tag">${esc(line.id)}</span><span>${esc(line.text)}</span></li>`).join('\n      ')}
    </ol>
  </section>

  <section class="board">
    <div class="board__head">
      <h2>What we set out to prove, and what happened</h2>
      <span class="tally">${met} of ${input.bars.length} met</span>
    </div>
    <div class="bars">
      ${input.bars.map(barHtml).join('\n      ')}
    </div>
  </section>

  <div class="stages">
    ${input.stages.map((stage, i) => stageHtml(stage, i)).join('\n    ')}
  </div>

  <section class="seal">
    <h2>The signature</h2>
    <p class="seal__sub">Checked from the files alone &mdash; nothing running</p>
    <p class="seal__affirm">&ldquo;${esc(signature.record?.affirmationText ?? '')}&rdquo;</p>
    <dl class="facts">
      <dt>Signed by</dt><dd>${esc(signature.record?.signerName ?? '')}</dd>
      <dt>Covers</dt><dd>every byte of the exported app, canonicalised as <code>${esc(signature.record?.signedPayload?.canonicalization ?? '')}</code></dd>
      <dt>Fingerprint</dt><dd>${esc(signature.record?.signedPayload?.digest ?? '')}</dd>
      <dt>Method</dt><dd>${esc(verification.methodUriFromEnvelope ?? '')}</dd>
      <dt>Verdict</dt><dd class="verdict-inline${verification.result === 'verified' ? '' : ' verdict-inline--bad'}">${esc(verification.result ?? '')}</dd>
      <dt>Tampered copy</dt><dd class="verdict-inline${verification.tamperResult === 'failed' ? '' : ' verdict-inline--bad'}">${esc(verification.tamperResult ?? '')} &mdash; one changed byte and the signature stops verifying</dd>
    </dl>
    <details class="detail"><summary>Everything the check read</summary><pre>${json(verification.inputsRead ?? [])}</pre></details>
  </section>

  <section class="moat">
    <h2>Did the designer's two edits survive?</h2>
    <p class="moat__sub">${esc(moat.survivingEdits ?? 0)} of ${esc(moat.totalEdits ?? 0)} survived</p>
    <p>This is the claim the whole platform rests on: when an AI rebuilds an app, the changes a person made by hand are supposed to be kept, not flattened. Here is what actually happened.</p>
    <p class="moat__why">${esc(moat.mergeAttempt?.outcome ?? '')}</p>
    <ul class="edits">
      ${(moat.edits ?? [])
        .map(
          (edit) => `<li>
        <span class="what">${esc(edit.what)}</span>
        <span class="verdict" style="color: var(--${edit.survived ? 'affirm' : 'accent'})">${edit.survived ? 'Kept' : 'Lost'}</span>
      </li>`,
        )
        .join('\n      ')}
    </ul>
    <details class="detail"><summary>Why &mdash; the full measurement</summary><pre>${json(input.moat)}</pre></details>
  </section>

  <footer>
    <p>Every sentence above is read out of <code>evidence/lifecycle.json</code>, written by the run itself. Nothing on this page was typed by hand from memory.</p>
    <p>Spike v10 &middot; <code>${esc(input.exemplar.bundleId)}</code></p>
  </footer>
</div>
</body>
</html>
`;
}

export function writeWalkthrough(input: WalkthroughInput): string {
  writeFileSync(WALKTHROUGH_PATH, renderWalkthrough(input));
  return WALKTHROUGH_PATH;
}
