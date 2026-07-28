#!/usr/bin/env node
/**
 * @filedesc Bundles cargo-doc-md Rust documentation output into a single Markdown file.
 *
 * Concatenate cargo-doc-md output into one Markdown file (supports nested modules).
 *
 * Usage (from repo root):
 *   node scripts/bundle-rustdoc-md.mjs <title> <target-subdir> <crate-folder> <out.md>
 *
 * Example:
 *   node scripts/bundle-rustdoc-md.mjs fel-core doc-md-fel-core fel_core crates/fel-core/docs/rustdoc-md/API.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function walkMdFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walkMdFiles(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function read(p) {
  return fs.readFileSync(p, "utf8").trimEnd();
}

const [, , title, targetSubdir, crateFolder, outArg] = process.argv;
if (!title || !targetSubdir || !crateFolder || !outArg) {
  console.error(
    "Usage: node scripts/bundle-rustdoc-md.mjs <title> <target-subdir> <crate-folder> <out.md>"
  );
  process.exit(1);
}

const inRoot = path.join(root, "target", targetSubdir);
const moduleAbs = path.join(inRoot, crateFolder);
const outPath = path.resolve(root, outArg);

if (!fs.existsSync(moduleAbs)) {
  console.error(`Missing ${path.relative(root, moduleAbs)} — run cargo doc-md first.`);
  process.exit(1);
}

const all = walkMdFiles(moduleAbs);
const rel = (f) => path.relative(moduleAbs, f).split(path.sep).join("/");
const byRel = new Map(all.map((f) => [rel(f), f]));
const orderedPairs = [];
const take = (r) => {
  const f = byRel.get(r);
  if (f) {
    orderedPairs.push([r, f]);
    byRel.delete(r);
  }
};
take("index.md");
take(`${crateFolder}.md`);
for (const r of [...byRel.keys()].sort((a, b) => a.localeCompare(b))) {
  orderedPairs.push([r, byRel.get(r)]);
  byRel.delete(r);
}

const pieces = [
  `# ${title} — generated API (Markdown)`,
  "",
  `> Do not edit by hand; regenerate via npm script / cargo doc-md + this bundler.`,
  "",
  "Bundled from [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md). Nested module paths are preserved in headings. Relative links may not resolve; search by heading.",
  "",
  "---",
  "",
];

const topIndex = path.join(inRoot, "index.md");
if (fs.existsSync(topIndex)) {
  pieces.push("## doc-md index", "", read(topIndex), "", "---", "");
}

for (const [label, filePath] of orderedPairs) {
  pieces.push(`## Source: ${crateFolder}/${label}`, "", read(filePath), "", "---", "");
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${pieces.join("\n").trimEnd()}\n`, "utf8");
console.log(`Wrote ${path.relative(root, outPath)}`);
