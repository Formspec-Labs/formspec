/** @filedesc Default adapter for FileUpload — file input with optional drag-drop zone and file list. */
import type { FileUploadBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';
import { createFieldDOM, finalizeFieldDOM } from './shared';
import { uiText } from '../ui-text.js';
import { watchText } from '../watch-text.js';
import { formatBytes } from '../../format';

export const renderFileUpload: AdapterRenderFn<FileUploadBehavior> = (
    behavior, parent, actx
) => {
    const fieldDOM = createFieldDOM(behavior, actx);
    fieldDOM.root.classList.add('formspec-file-upload');

    const input = document.createElement('input');
    input.type = 'file';
    input.className = 'formspec-file-input-hidden';
    input.id = behavior.id;
    input.name = behavior.fieldPath;
    if (behavior.accept) input.accept = behavior.accept;
    if (behavior.multiple) input.multiple = true;

    // Browse button (replaces raw input display)
    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'formspec-file-browse-btn formspec-focus-ring formspec-button-secondary';
    browseBtn.textContent = 'Browse';
    browseBtn.addEventListener('click', () => input.click());

    // File list container — rebuilt by the behavior on each change
    const fileListEl = document.createElement('ul');
    fileListEl.className = 'formspec-file-list';
    fileListEl.setAttribute('aria-label', 'Selected files');

    const rebuildFileList = () => {
        fileListEl.innerHTML = '';
        const files = behavior.files();
        // React omits the list until files exist; keep the ul out of layout when empty
        // so margin-top on .formspec-file-list does not add space above Submit.
        if (files.length === 0) {
            fileListEl.hidden = true;
            return;
        }
        fileListEl.hidden = false;

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const li = document.createElement('li');
            li.className = 'formspec-file-list-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'formspec-file-list-name';
            nameSpan.textContent = f.name;
            li.appendChild(nameSpan);

            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'formspec-file-list-size';
            sizeSpan.textContent = formatBytes(f.size);
            li.appendChild(sizeSpan);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'formspec-file-list-remove formspec-focus-ring';
            removeBtn.setAttribute('aria-label', `Remove ${f.name}`);
            removeBtn.innerHTML = '<span aria-hidden="true">\u00d7</span>';
            const idx = i;
            removeBtn.addEventListener('click', () => behavior.removeFile(idx));
            li.appendChild(removeBtn);

            fileListEl.appendChild(li);
        }

        if (behavior.multiple && files.length > 1) {
            const actionsLi = document.createElement('li');
            actionsLi.className = 'formspec-file-list-actions';
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'formspec-file-list-clear formspec-focus-ring';
            clearBtn.textContent = 'Clear all';
            clearBtn.addEventListener('click', () => behavior.clearFiles());
            actionsLi.appendChild(clearBtn);
            fileListEl.appendChild(actionsLi);
        }
    };

    if (behavior.dragDrop) {
        const dropZone = document.createElement('div');
        dropZone.className = 'formspec-file-drop-zone formspec-focus-ring';
        const dropZoneName = document.createElement('span');
        dropZoneName.hidden = true; // referenced by aria-labelledby, not read as content
        dropZone.appendChild(dropZoneName);

        const content = document.createElement('div');
        content.className = 'formspec-file-drop-content';

        const icon = document.createElement('span');
        icon.className = 'formspec-file-drop-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '\u21F5';

        const label = document.createElement('span');
        label.className = 'formspec-file-drop-label';
        label.textContent = behavior.multiple ? 'Drag & drop files here' : 'Drag & drop a file here';

        content.appendChild(icon);
        content.appendChild(label);
        content.appendChild(browseBtn);
        dropZone.appendChild(content);

        dropZone.setAttribute('tabindex', '0');
        dropZone.setAttribute('role', 'button');
        // Named "<label> <$ui.fileUpload.dropzone>": the first Tab stop says which field it belongs to.
        fieldDOM.label.id ||= `${behavior.id}-label`;
        dropZoneName.id = `${behavior.id}-dropzone-label`;
        watchText(actx, uiText(actx.engine, 'fileUpload.dropzone'), (text) => { dropZoneName.textContent = text; });
        dropZone.setAttribute('aria-labelledby', `${fieldDOM.label.id} ${dropZoneName.id}`);
        dropZone.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                input.click();
            }
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('formspec-file-drop-zone--active');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('formspec-file-drop-zone--active');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('formspec-file-drop-zone--active');
            const files = Array.from(e.dataTransfer?.files || []);
            const fileData = files.map(f => ({ name: f.name, size: f.size, type: f.type }));
            fieldDOM.root.dispatchEvent(new CustomEvent('formspec-files-dropped', {
                detail: { fileData, multiple: behavior.multiple },
                bubbles: false,
            }));
        });

        fieldDOM.root.appendChild(dropZone);
        fieldDOM.root.appendChild(input);
    } else {
        fieldDOM.root.appendChild(input);
        fieldDOM.root.appendChild(browseBtn);
    }

    fieldDOM.root.appendChild(fileListEl);

    finalizeFieldDOM(fieldDOM, behavior, actx);
    parent.appendChild(fieldDOM.root);

    const refs: any = {
        root: fieldDOM.root,
        label: fieldDOM.label,
        control: input,
        hint: fieldDOM.hint,
        error: fieldDOM.error,
        _rebuildFileList: rebuildFileList,
    };
    const dispose = behavior.bind(refs);
    actx.onDispose(dispose);
    rebuildFileList();
};
