/** @filedesc Tailwind adapter for FileUpload — drag-drop zone with styled file input. */
import { uiText, watchText, type FileUploadBehavior, type AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { createTailwindFieldDOM } from './shared';

export const renderFileUpload: AdapterRenderFn<FileUploadBehavior> = (
    behavior, parent, actx
) => {
    const { root, label, hint, error } = createTailwindFieldDOM(behavior);

    // Drop zone
    const dropZone = el('div', {
        class: 'flex justify-center rounded-lg border-2 border-dashed border-[color:var(--formspec-tw-border)] px-6 py-10 transition-colors',
        tabindex: '0',
        role: 'button',
        'aria-label': uiText(actx.engine, 'fileUpload.dropzoneKeyboard').value,
    });

    dropZone.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
        }
    });

    const inner = el('div', { class: 'text-center' });

    // Upload icon (SVG inline for Tailwind aesthetic)
    const iconWrapper = el('div', { class: 'mx-auto h-12 w-12 text-[var(--formspec-tw-muted)]' });
    iconWrapper.innerHTML = '<svg class="h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>';
    inner.appendChild(iconWrapper);

    const textRow = el('div', { class: 'mt-4 flex text-sm text-[var(--formspec-tw-muted)]' });
    const browseLabel = el('span', {
        class: 'relative cursor-pointer rounded-md font-medium text-[var(--formspec-tw-accent)] hover:text-[var(--formspec-tw-accent)]',
    });
    watchText(actx, uiText(actx.engine, 'fileUpload.browse'), (text) => { browseLabel.textContent = text; });
    textRow.appendChild(browseLabel);
    textRow.appendChild(document.createTextNode('\u00a0or drag and drop'));
    inner.appendChild(textRow);

    const sizeHint = el('p', { class: 'text-xs text-[var(--formspec-tw-muted)] mt-1' });
    sizeHint.textContent = behavior.accept || 'Any file type';
    inner.appendChild(sizeHint);

    dropZone.appendChild(inner);

    const input = document.createElement('input') as HTMLInputElement;
    input.className = 'sr-only';
    input.id = behavior.id;
    input.name = behavior.fieldPath;
    input.type = 'file';
    if (behavior.accept) input.accept = behavior.accept;
    if (behavior.multiple) input.multiple = true;
    dropZone.appendChild(input);

    // Drag-drop handlers
    if (behavior.dragDrop) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--formspec-tw-accent)';
            dropZone.style.backgroundColor = 'var(--formspec-tw-accent-soft)';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = '';
            dropZone.style.backgroundColor = '';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '';
            dropZone.style.backgroundColor = '';
            const files = Array.from(e.dataTransfer?.files || []);
            const fileData = files.map(f => ({ name: f.name, size: f.size, type: f.type }));
            root.dispatchEvent(new CustomEvent('formspec-files-dropped', {
                detail: { fileData, multiple: behavior.multiple },
                bubbles: false,
            }));
        });
    }

    root.appendChild(dropZone);
    root.appendChild(error);
    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control: input, hint, error,
        onValidationChange: (hasError) => {
            dropZone.style.borderColor = hasError ? 'var(--formspec-tw-danger)' : '';
        },
    });
    actx.onDispose(dispose);
};
