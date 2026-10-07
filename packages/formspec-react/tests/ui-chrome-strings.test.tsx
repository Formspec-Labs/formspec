/** @filedesc Renderer chrome strings (Locale §3.1.10 $ui.<ChromeStringKey>): Add label and Select placeholder come from the shared UI_STRINGS inventory, and the repeat Add label follows a Locale override. */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';

import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const URL = 'urn:test:ui-chrome-strings';

describe('$ui.repeat.add — repeat Add button', () => {
    function render() {
        const engine = createFormEngine({
            $formspec: '1.0', url: URL, version: '1.0.0', title: 'Jobs',
            items: [
                {
                    key: 'jobs', type: 'group', label: 'Job', repeatable: true, minRepeat: 1,
                    children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
                },
            ],
        });
        const tree = { component: 'Stack', bind: 'jobs', title: 'Job', children: [{ component: 'TextInput', bind: 'employer' }] };
        const componentDocument = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: URL }, tree };
        const container = actRender(<FormspecForm engine={engine} componentDocument={componentDocument} />);
        return { container, engine };
    }

    it('the unauthored default comes from the shared UI_STRINGS inventory ("Add {{$label}}")', () => {
        const { container } = render();
        const addBtn = container.querySelector('.formspec-repeat-add') as HTMLElement;
        expect(addBtn.textContent).toBe('Add Job');
    });

    it('follows an authored $ui.repeat.add Locale override, and back', () => {
        const { container, engine } = render();
        const addBtn = () => container.querySelector('.formspec-repeat-add') as HTMLElement;
        expect(addBtn().textContent).toBe('Add Job');

        act(() => {
            engine.loadLocale({
                $formspecLocale: '2.0', locale: 'es', version: '1.0.0',
                target: { kind: 'definition', url: URL },
                strings: { '$ui.repeat.add': 'Agregar {{$label}}' },
            } as any);
            engine.setLocale('es');
        });
        expect(addBtn().textContent).toBe('Agregar Job');

        act(() => engine.setLocale(''));
        expect(addBtn().textContent).toBe('Add Job');
    });
});

describe('$ui.select.placeholder — Select control', () => {
    function render() {
        const engine = createFormEngine({
            $formspec: '1.0', url: URL, version: '1.0.0', title: 'Test',
            items: [
                {
                    key: 'color', type: 'field', dataType: 'choice', label: 'Color',
                    options: [{ value: 'r', label: 'Red' }],
                },
            ],
        });
        const componentDocument = {
            $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: URL },
            tree: { component: 'Stack', children: [{ component: 'Select', bind: 'color' }] },
        };
        const container = actRender(<FormspecForm engine={engine} componentDocument={componentDocument} />);
        return { container };
    }

    it('the unauthored placeholder comes from the shared UI_STRINGS inventory', () => {
        const { container } = render();
        const placeholderOpt = container.querySelector('select option[value=""]') as HTMLOptionElement;
        expect(placeholderOpt.textContent).toBe('Select…');
    });
});

describe('public chrome hook for host upload controls', () => {
    it('exports the same supported hook through root and hooks entry points', async () => {
        const root = await import('../src/index');
        const hooks = await import('../src/hooks');
        expect(root.useChromeText).toBe(hooks.useChromeText);
    });

    it('keeps stored keys live across locale load/switch, with literal parameters and shared fallback', async () => {
        const { useChromeText, FormspecProvider } = await import('../src/index');
        const engine = createFormEngine({ $formspec: '1.0', url: URL, version: '1.0.0', title: 'Upload', items: [] });
        function UploadChrome() {
            const chrome = useChromeText();
            return <>
                <button>{chrome('fileUpload.browse')}</button>
                <button aria-label={chrome('fileUpload.remove', { filename: '{{$secret}}.png' })}>×</button>
                <p>{chrome('fileUpload.uploadProgress', { percent: 42 })}</p>
                <p>{chrome('fileUpload.fileTooLarge', { filename: 'scan.png', limit: '25 MB' })}</p>
                <p>{chrome('fileUpload.errorNetwork')}</p>
                <button>{chrome('fileUpload.useCamera')}</button>
                <button>{chrome('fileUpload.clearRedactions')}</button>
            </>;
        }
        const container = actRender(<FormspecProvider engine={engine}><UploadChrome /></FormspecProvider>);
        expect(container.textContent).toContain('Upload a file');
        expect(container.textContent).toContain('Uploading 42%');
        expect(container.querySelectorAll('button')[1].getAttribute('aria-label')).toBe('Remove {{$secret}}.png');
        act(() => {
            engine.loadLocale({ $formspecLocale: '2.0', locale: 'es', version: '1.0.0',
                target: { kind: 'definition', url: URL }, strings: {
                    '$ui.fileUpload.browse': 'Subir archivo',
                    '$ui.fileUpload.remove': 'Quitar {{$filename}}',
                    '$ui.fileUpload.uploadProgress': '{{$percent}}% cargado',
                    '$ui.fileUpload.clearRedactions': 'Borrar ocultaciones',
                },
            });
            engine.loadLocale({ $formspecLocale: '2.0', locale: 'es-US', fallback: 'es', version: '1.0.0',
                target: { kind: 'definition', url: URL }, strings: {},
            });
            engine.setLocale('es-US');
        });
        expect(container.textContent).toContain('Subir archivo');
        expect(container.textContent).toContain('42% cargado');
        expect(container.textContent).toContain('Borrar ocultaciones');
        expect(container.textContent).toContain('We could not reach the upload service.');
        expect(container.textContent).toContain('Use camera');
        expect(container.querySelectorAll('button')[1].getAttribute('aria-label')).toBe('Quitar {{$secret}}.png');
        act(() => engine.loadLocale({ $formspecLocale: '2.0', locale: 'es', version: '2.0.0',
            target: { kind: 'definition', url: URL }, strings: { '$ui.fileUpload.browse': 'Elegir archivo' },
        }));
        expect(container.textContent).toContain('Elegir archivo');
        act(() => engine.setLocale(''));
        expect(container.textContent).toContain('Upload a file');
        expect(container.textContent).toContain('Uploading 42%');
    });
});

// Supported host usage, not a claim that the external upload renderer has adopted these keys.
describe('public-hook upload/editor host scenarios', () => {
    it('renders the closed controls, status and errors with their English defaults', async () => {
        const { useChromeText } = await import('../src/hooks');
        function UploadEditorChrome() {
            const chrome = useChromeText();
            return <>
                <span data-chrome="fileUpload.attachedList">{chrome('fileUpload.attachedList')}</span>
                <span data-chrome="fileUpload.pendingList">{chrome('fileUpload.pendingList')}</span>
                <span data-chrome="fileUpload.remove">{chrome('fileUpload.remove', {"filename": "scan.png"})}</span>
                <span data-chrome="fileUpload.dismissError">{chrome('fileUpload.dismissError', {"filename": "scan.png"})}</span>
                <span data-chrome="fileUpload.uploading">{chrome('fileUpload.uploading')}</span>
                <span data-chrome="fileUpload.uploadProgress">{chrome('fileUpload.uploadProgress', {"percent": 42})}</span>
                <span data-chrome="fileUpload.deferredLibrary">{chrome('fileUpload.deferredLibrary')}</span>
                <span data-chrome="fileUpload.cameraCapture">{chrome('fileUpload.cameraCapture')}</span>
                <span data-chrome="fileUpload.cameraPreview">{chrome('fileUpload.cameraPreview')}</span>
                <span data-chrome="fileUpload.captureImage">{chrome('fileUpload.captureImage')}</span>
                <span data-chrome="fileUpload.closeCamera">{chrome('fileUpload.closeCamera')}</span>
                <span data-chrome="fileUpload.useCamera">{chrome('fileUpload.useCamera')}</span>
                <span data-chrome="fileUpload.cameraUnavailable">{chrome('fileUpload.cameraUnavailable')}</span>
                <span data-chrome="fileUpload.cameraOpenFailed">{chrome('fileUpload.cameraOpenFailed')}</span>
                <span data-chrome="fileUpload.cameraCaptureFailed">{chrome('fileUpload.cameraCaptureFailed')}</span>
                <span data-chrome="fileUpload.imagesWaitingOne">{chrome('fileUpload.imagesWaitingOne', {"count": 1})}</span>
                <span data-chrome="fileUpload.imagesWaitingMany">{chrome('fileUpload.imagesWaitingMany', {"count": 2})}</span>
                <span data-chrome="fileUpload.imageReview">{chrome('fileUpload.imageReview')}</span>
                <span data-chrome="fileUpload.legibilityWarning">{chrome('fileUpload.legibilityWarning')}</span>
                <span data-chrome="fileUpload.redactionSurface">{chrome('fileUpload.redactionSurface')}</span>
                <span data-chrome="fileUpload.previewImage">{chrome('fileUpload.previewImage')}</span>
                <span data-chrome="fileUpload.addRedaction">{chrome('fileUpload.addRedaction')}</span>
                <span data-chrome="fileUpload.detectPageEdges">{chrome('fileUpload.detectPageEdges')}</span>
                <span data-chrome="fileUpload.clearRedactions">{chrome('fileUpload.clearRedactions')}</span>
                <span data-chrome="fileUpload.uploadImage">{chrome('fileUpload.uploadImage')}</span>
                <span data-chrome="fileUpload.cancel">{chrome('fileUpload.cancel')}</span>
                <span data-chrome="fileUpload.browseMultiple">{chrome('fileUpload.browseMultiple')}</span>
                <span data-chrome="fileUpload.dropzoneMultiple">{chrome('fileUpload.dropzoneMultiple')}</span>
                <span data-chrome="fileUpload.attachedOne">{chrome('fileUpload.attachedOne', {"count": 1})}</span>
                <span data-chrome="fileUpload.attachedMany">{chrome('fileUpload.attachedMany', {"count": 2})}</span>
                <span data-chrome="fileUpload.fileTooLarge">{chrome('fileUpload.fileTooLarge', {"filename": "scan.png", "limit": "25 MB"})}</span>
                <span data-chrome="fileUpload.errorTooLarge">{chrome('fileUpload.errorTooLarge')}</span>
                <span data-chrome="fileUpload.errorMimeRejected">{chrome('fileUpload.errorMimeRejected')}</span>
                <span data-chrome="fileUpload.errorNetwork">{chrome('fileUpload.errorNetwork')}</span>
                <span data-chrome="fileUpload.errorUnavailable">{chrome('fileUpload.errorUnavailable')}</span>
                <span data-chrome="fileUpload.errorUnknown">{chrome('fileUpload.errorUnknown')}</span>
                <span data-chrome="fileUpload.imagePrepareFailed">{chrome('fileUpload.imagePrepareFailed')}</span>
                <span data-chrome="fileUpload.edgeCleanupFailed">{chrome('fileUpload.edgeCleanupFailed')}</span>
                <span data-chrome="fileUpload.singleFileOnly">{chrome('fileUpload.singleFileOnly')}</span>
            </>;
        }
        const container = actRender(<UploadEditorChrome />);
        expect(container.querySelector('[data-chrome="fileUpload.attachedList"]')?.textContent).toBe("Files you have attached");
        expect(container.querySelector('[data-chrome="fileUpload.pendingList"]')?.textContent).toBe("Pending file activity");
        expect(container.querySelector('[data-chrome="fileUpload.remove"]')?.textContent).toBe("Remove scan.png");
        expect(container.querySelector('[data-chrome="fileUpload.dismissError"]')?.textContent).toBe("Dismiss error for scan.png");
        expect(container.querySelector('[data-chrome="fileUpload.uploading"]')?.textContent).toBe("Uploading...");
        expect(container.querySelector('[data-chrome="fileUpload.uploadProgress"]')?.textContent).toBe("Uploading 42%");
        expect(container.querySelector('[data-chrome="fileUpload.deferredLibrary"]')?.textContent).toBe("Saving to your document library is not yet available here.");
        expect(container.querySelector('[data-chrome="fileUpload.cameraCapture"]')?.textContent).toBe("Camera capture");
        expect(container.querySelector('[data-chrome="fileUpload.cameraPreview"]')?.textContent).toBe("Camera preview");
        expect(container.querySelector('[data-chrome="fileUpload.captureImage"]')?.textContent).toBe("Capture image");
        expect(container.querySelector('[data-chrome="fileUpload.closeCamera"]')?.textContent).toBe("Close camera");
        expect(container.querySelector('[data-chrome="fileUpload.useCamera"]')?.textContent).toBe("Use camera");
        expect(container.querySelector('[data-chrome="fileUpload.cameraUnavailable"]')?.textContent).toBe("Camera capture is not available in this browser.");
        expect(container.querySelector('[data-chrome="fileUpload.cameraOpenFailed"]')?.textContent).toBe("We could not open the camera. Choose a file instead.");
        expect(container.querySelector('[data-chrome="fileUpload.cameraCaptureFailed"]')?.textContent).toBe("We could not capture an image. Choose a file instead.");
        expect(container.querySelector('[data-chrome="fileUpload.imagesWaitingOne"]')?.textContent).toBe("1 image waiting for review.");
        expect(container.querySelector('[data-chrome="fileUpload.imagesWaitingMany"]')?.textContent).toBe("2 images waiting for review.");
        expect(container.querySelector('[data-chrome="fileUpload.imageReview"]')?.textContent).toBe("Image review before upload");
        expect(container.querySelector('[data-chrome="fileUpload.legibilityWarning"]')?.textContent).toBe("This image may be hard to read. Check focus, lighting, and glare before uploading.");
        expect(container.querySelector('[data-chrome="fileUpload.redactionSurface"]')?.textContent).toBe("Draw boxes over information you want to redact");
        expect(container.querySelector('[data-chrome="fileUpload.previewImage"]')?.textContent).toBe("Preview before upload");
        expect(container.querySelector('[data-chrome="fileUpload.addRedaction"]')?.textContent).toBe("Add redaction box");
        expect(container.querySelector('[data-chrome="fileUpload.detectPageEdges"]')?.textContent).toBe("Detect page edges");
        expect(container.querySelector('[data-chrome="fileUpload.clearRedactions"]')?.textContent).toBe("Clear redactions");
        expect(container.querySelector('[data-chrome="fileUpload.uploadImage"]')?.textContent).toBe("Upload image");
        expect(container.querySelector('[data-chrome="fileUpload.cancel"]')?.textContent).toBe("Cancel");
        expect(container.querySelector('[data-chrome="fileUpload.browseMultiple"]')?.textContent).toBe("Upload files");
        expect(container.querySelector('[data-chrome="fileUpload.dropzoneMultiple"]')?.textContent).toBe("Drop files here or click to browse");
        expect(container.querySelector('[data-chrome="fileUpload.attachedOne"]')?.textContent).toBe("1 file attached");
        expect(container.querySelector('[data-chrome="fileUpload.attachedMany"]')?.textContent).toBe("2 files attached");
        expect(container.querySelector('[data-chrome="fileUpload.fileTooLarge"]')?.textContent).toBe("\"scan.png\" is larger than the upload limit of 25 MB.");
        expect(container.querySelector('[data-chrome="fileUpload.errorTooLarge"]')?.textContent).toBe("That file is larger than the upload limit. Try a smaller file.");
        expect(container.querySelector('[data-chrome="fileUpload.errorMimeRejected"]')?.textContent).toBe("That file type is not accepted here.");
        expect(container.querySelector('[data-chrome="fileUpload.errorNetwork"]')?.textContent).toBe("We could not reach the upload service. Check your connection and try again.");
        expect(container.querySelector('[data-chrome="fileUpload.errorUnavailable"]')?.textContent).toBe("File upload is not available on this site.");
        expect(container.querySelector('[data-chrome="fileUpload.errorUnknown"]')?.textContent).toBe("We could not upload your file. Try again.");
        expect(container.querySelector('[data-chrome="fileUpload.imagePrepareFailed"]')?.textContent).toBe("We could not prepare that image. Choose the file again.");
        expect(container.querySelector('[data-chrome="fileUpload.edgeCleanupFailed"]')?.textContent).toBe("We could not clean up the image edges. You can still upload it.");
        expect(container.querySelector('[data-chrome="fileUpload.singleFileOnly"]')?.textContent).toBe("Only one file can be uploaded here.");
    });
});

describe('public-hook receipt and local-preview host scenarios', () => {
    it('translates host-selected feedback while retaining the opaque submission ID', async () => {
        const { useChromeText, FormspecProvider } = await import('../src/hooks');
        const engine = createFormEngine({ $formspec: '1.0', url: URL, version: '1.0.0', title: 'Receipt', items: [] });
        const submissionId = 'resp-opaque-{{$secret}}-123456789';
        function ReceiptPreviewChrome() {
            const chrome = useChromeText();
            return <>
                <aside aria-label={chrome('form.settings')}>
                    <label>{chrome('form.language')}</label>
                    <p role="alert">{chrome('form.languageSaveFailed')}</p>
                </aside>
                <p data-chrome="preview">{chrome('localPreview.preview')}</p>
                <p data-chrome="restored">{chrome('localPreview.draftRestored')}</p>
                <section>
                    <h2>{chrome('receipt.answersReceived')}</h2>
                    <p>{chrome('receipt.submissionId')}</p>
                    <code>{submissionId}</code>
                    <p role="note">{chrome('receipt.pendingFilingAndSigning')}</p>
                    <h3>{chrome('receipt.keepRecord')}</h3>
                    <p>{chrome('receipt.printInstruction')}</p>
                    <button>{chrome('receipt.print')}</button>
                    <button>{chrome('receipt.clear')}</button>
                    <p role="status">{chrome('receipt.clearing')}</p>
                </section>
            </>;
        }
        const container = actRender(<FormspecProvider engine={engine}><ReceiptPreviewChrome /></FormspecProvider>);
        const originalText = container.textContent;
        expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe('Form settings');
        for (const copy of ['Language', 'The language change could not be saved. Try again.',
            'Local preview', 'Draft restored', 'Answers received', 'Submission ID',
            'Case filing and signing are not yet confirmed.', 'Keep this record',
            'Print this confirmation, then clear saved access before leaving.',
            'Print confirmation', 'Clear saved access', 'Clearing...']) {
            expect(container.textContent).toContain(copy);
        }
        act(() => {
            engine.loadLocale({ $formspecLocale: '2.0', locale: 'es', version: '1.0.0',
                target: { kind: 'definition', url: URL }, strings: {
                    '$ui.receipt.answersReceived': 'Respuestas recibidas',
                    '$ui.receipt.submissionId': 'ID de envío',
                    '$ui.receipt.clearing': 'Borrando...',
                    '$ui.localPreview.preview': 'Vista previa local',
                    '$ui.localPreview.draftRestored': 'Borrador restaurado',
                    '$ui.form.settings': 'Ajustes del formulario',
                    '$ui.form.language': 'Idioma',
                    '$ui.form.languageSaveFailed': 'No se pudo guardar el idioma. Inténtalo de nuevo.',
                },
            });
            engine.loadLocale({ $formspecLocale: '2.0', locale: 'es-US', version: '1.0.0', fallback: 'es',
                target: { kind: 'definition', url: URL }, strings: {},
            });
            engine.setLocale('es-US');
        });
        expect(container.querySelector('h2')?.textContent).toBe('Respuestas recibidas');
        expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe('Ajustes del formulario');
        expect(container.querySelector('[data-chrome="preview"]')?.textContent).toBe('Vista previa local');
        expect(container.querySelector('[data-chrome="restored"]')?.textContent).toBe('Borrador restaurado');
        expect(container.querySelector('[role="alert"]')?.textContent).toBe('No se pudo guardar el idioma. Inténtalo de nuevo.');
        expect(container.querySelector('[role="status"]')?.textContent).toBe('Borrando...');
        expect(container.querySelector('[role="note"]')?.textContent).toBe('Case filing and signing are not yet confirmed.');
        expect(container.querySelector('code')?.textContent).toBe(submissionId);
        act(() => engine.setLocale(''));
        expect(container.textContent).toBe(originalText);
        expect(container.querySelector('code')?.textContent).toBe(submissionId);
    });
});

describe('public recovery and cleared-access chrome', () => {
    it('resolves exact host states and literal version values, then retains only cleared strings', async () => {
        const { useChromeText, chromeText, FormspecProvider } = await import('../src/hooks');
        const root = await import('../src/index');
        expect(root.chromeText).toBe(chromeText);
        const engine = createFormEngine({ $formspec: '1.0', url: URL, version: '2.0.0', title: 'Recovery', items: [] });
        const version = '1.0-{{$secret}}-<script>';
        function RecoveryChrome() {
            const chrome = useChromeText();
            return <section>
                <h2>{chrome('form.fields')}</h2>
                <h3>{chrome('draft.versionChangedTitle')}</h3>
                <p data-version>{chrome('draft.versionChanged', { version })}</p>
                <button>{chrome('draft.startCurrent')}</button>
                <p>{chrome('draft.startingCurrent')}</p>
                <p role="alert">{chrome('draft.startCurrentFailed')}</p>
                <p>{chrome('draft.browserAccessNotice')}</p>
                <h3 data-cleared>{chrome('receipt.clearedTitle')}</h3>
                <p data-detail>{chrome('receipt.clearedDetail')}</p>
            </section>;
        }
        const container = actRender(<FormspecProvider engine={engine}><RecoveryChrome /></FormspecProvider>);
        const initial = container.textContent;
        expect(container.querySelector('[data-version]')?.textContent).toBe(`This draft was saved with form version ${version}. Start again with the current form to continue.`);
        expect(container.querySelector('script')).toBeNull();
        expect(container.textContent).toContain('Other saved drafts stay available.');
        expect(chromeText(undefined, 'receipt.clear')).toBe('Clear saved access');
        expect(chromeText(undefined, 'receipt.printInstruction')).toBe('Print this confirmation, then clear saved access before leaving.');
        act(() => {
            engine.loadLocale({ $formspecLocale: '2.0', locale: 'es', version: '1.0.0', target: { kind: 'definition', url: URL }, strings: {
                '$ui.form.fields': 'Campos del formulario',
                '$ui.draft.versionChanged': 'Versión guardada: {{$version}}',
                '$ui.receipt.clearedTitle': 'Acceso guardado borrado',
                '$ui.receipt.clearedDetail': 'Este navegador ya no tiene acceso guardado a este borrador.',
            } });
            engine.setLocale('es');
        });
        expect(container.querySelector('h2')?.textContent).toBe('Campos del formulario');
        expect(container.querySelector('[data-version]')?.textContent).toBe(`Versión guardada: ${version}`);
        expect(container.querySelector('[role="alert"]')?.textContent).toBe('Saved access could not be cleared. Try again.');
        // The cleared view can keep two resolved strings and release all answer-bearing engine state.
        const cleared = { title: chromeText(engine, 'receipt.clearedTitle'), detail: chromeText(engine, 'receipt.clearedDetail') };
        act(() => engine.setLocale(''));
        expect(container.textContent).toBe(initial);
        expect(cleared).toEqual({ title: 'Acceso guardado borrado', detail: 'Este navegador ya no tiene acceso guardado a este borrador.' });
    });
});

it('keeps the public statusReason template for explicitly localized host guidance', async () => {
    const { FormspecProvider } = await import('../src/context');
    const { useChromeText } = await import('../src/hooks');
    const engine = createFormEngine({ $formspec: '1.0', url: URL, version: '1.0.0', items: [] });
    function Guidance() {
        const chrome = useChromeText();
        return <p role="status">{chrome('action.statusReason', {
            status: chrome('action.blocked'), reason: chrome('validationSummary.fixOne'),
        })}</p>;
    }
    const container = actRender(<FormspecProvider engine={engine}><Guidance /></FormspecProvider>);
    expect(container.textContent).toBe('Blocked: Please fix this error before continuing:');
    act(() => {
        engine.loadLocale({ $formspecLocale: '2.0', locale: 'es', version: '1.0.0',
            target: { kind: 'definition', url: URL }, strings: {
                '$ui.action.blocked': 'Bloqueado',
                '$ui.action.statusReason': '{{$reason}} ({{$status}})',
                '$ui.validationSummary.fixOne': 'Corrija este error antes de continuar.',
            } });
        engine.setLocale('es');
    });
    expect(container.textContent).toBe('Corrija este error antes de continuar. (Bloqueado)');
});
