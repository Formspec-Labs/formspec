/** @filedesc Compatibility shims on the tools-side public API. */
import assert from 'node:assert/strict';
import test from 'node:test';

test('deprecated lintDocumentWithRegistries remains a public shim', async () => {
    const publicSurface = await import('../dist/index.js');
    assert.equal(typeof publicSurface.lintDocumentWithRegistries, 'function');

    const doc = { notAFormspecDocument: true };
    assert.deepEqual(
        publicSurface.lintDocumentWithRegistries(doc, []),
        publicSurface.lintDocument(doc, { registryDocuments: [] }),
    );
});
