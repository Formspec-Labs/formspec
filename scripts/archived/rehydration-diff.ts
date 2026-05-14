/** @filedesc Diffs original example artifacts against reconstructed outputs and writes a report. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const scriptFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptFile), '..');
const originalsDir = path.join(rootDir, 'examples');
const reconstructedDir = path.join(rootDir, 'reconstructed-examples');

const ARTIFACT_FILE = path.join(rootDir, 'rehydration_diffs.md');

let diffReport = `# Rehydration Diffs\n\n`;
diffReport += `Comparing \`examples/\` (original) with \`reconstructed-examples/\` (generated via formspec-studio-core handlers).\n\n`;

const mapping = [
    { orig: 'clinical-intake/intake.', recon: 'clinical-intake-intake/' },
    { orig: 'grant-application/application.', recon: 'grant-application-application/' },
    { orig: 'grant-report/tribal-base.', recon: 'grant-report-tribal-base/' },
    { orig: 'grant-report/tribal-long.', recon: 'grant-report-tribal-long/' },
    { orig: 'grant-report/tribal-short.', recon: 'grant-report-tribal-short/' },
    { orig: 'invoice/invoice.', recon: 'invoice-invoice/' }
];

for (const map of mapping) {
    const origPrefix = path.join(originalsDir, map.orig);
    const reconBase = path.join(reconstructedDir, map.recon);

    for (const type of ['definition.json', 'theme.json', 'mapping.json', 'component.json']) {
        const origFile = origPrefix + type;
        const reconFile = path.join(reconBase, type);
        
        let hasOrig = fs.existsSync(origFile);
        let hasRecon = fs.existsSync(reconFile);

        if (!hasOrig && !hasRecon) continue;
        
        diffReport += `## Diff: \`${map.orig}${type}\`\n`;

        if (hasOrig && !hasRecon) {
            diffReport += `**MISSING IN GENERATED** - Failed to reconstruct.\n\n`;
            continue;
        }
        if (!hasOrig && hasRecon) {
            diffReport += `**GENERATED EXTRA FILE** - Did not exist in original.\n\n`;
            continue;
        }

        // We format both with jq to ensure sorting and formatting is perfectly strict so diffs matter
        try {
            execSync(`jq -S . "${origFile}" > /tmp/orig.json`);
            execSync(`jq -S . "${reconFile}" > /tmp/recon.json`);
            const diff = execSync(`diff -u /tmp/orig.json /tmp/recon.json || true`).toString();
            
            if (!diff.trim()) {
                diffReport += `✅ Perfect structural match (0 differences).\n\n`;
            } else {
                diffReport += `⚠️ Differences found:\n\`\`\`diff\n${diff.substring(0, 1500)}${diff.length > 1500 ? '...\n(diff truncated for length)' : ''}\n\`\`\`\n\n`;
            }
        } catch(e: any) {
            diffReport += `❌ Error diffing: ${e.message}\n\n`;
        }
    }
}

fs.writeFileSync(ARTIFACT_FILE, diffReport);
console.log('Diff artifact generated.');
