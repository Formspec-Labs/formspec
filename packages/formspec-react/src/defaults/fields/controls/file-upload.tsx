/** @filedesc FileUpload with drag-drop zone and maxSize validation. */
'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { CommonInputProps } from '../field-control-types';
import { formatBytes } from '../format-bytes';

function filesFromFieldValue(value: unknown, multiple: boolean | undefined): File[] {
    if (value == null) return [];
    if (value instanceof File) return [value];
    if (Array.isArray(value)) {
        return value.filter((entry): entry is File => entry instanceof File);
    }
    if (multiple) return [];
    return [];
}

function fileListsMatch(a: File[], b: File[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((file, index) => {
        const other = b[index];
        return (
            file === other
            || (file.name === other.name
                && file.size === other.size
                && file.lastModified === other.lastModified)
        );
    });
}

/** Engine coercion JSON-roundtrips File to `{}` — do not drop local picks on that artifact. */
function shouldPreserveLocalFiles(value: unknown, prev: File[], next: File[]): boolean {
    if (next.length > 0 || prev.length === 0 || value == null) return false;
    if (value instanceof File) return false;
    if (Array.isArray(value) && value.some((entry) => entry instanceof File)) return false;
    return true;
}

/** Item 22: FileUpload with drag-drop zone and maxSize validation. */
export function FileUploadControl({ field, node, common, isReadonly }: CommonInputProps) {
    const accept = node.props?.accept as string | undefined;
    const multiple = node.props?.multiple as boolean | undefined;
    const maxSize = node.props?.maxSize as number | undefined;
    const dragDrop = node.props?.dragDrop !== false;

    const [sizeError, setSizeError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [files, setFiles] = useState<File[]>(() => filesFromFieldValue(field.value, multiple));
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const next = filesFromFieldValue(field.value, multiple);
        setFiles((prev) => {
            if (fileListsMatch(prev, next)) return prev;
            if (shouldPreserveLocalFiles(field.value, prev, next)) return prev;
            return next;
        });
        if (field.value == null) setSizeError(null);
    }, [field.value, multiple]);

    const addFiles = (incoming: FileList | null) => {
        if (!incoming || incoming.length === 0) return;
        const newFiles = Array.from(incoming);

        if (maxSize != null) {
            const oversized = newFiles.find(f => f.size > maxSize);
            if (oversized) {
                setSizeError(`"${oversized.name}" exceeds the maximum size of ${formatBytes(maxSize)}.`);
                return;
            }
        }
        setSizeError(null);

        if (multiple) {
            // Accumulate — deduplicate by name+size+lastModified
            const merged = [...files];
            for (const f of newFiles) {
                if (!merged.some(e => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified)) {
                    merged.push(f);
                }
            }
            setFiles(merged);
            field.setValue(merged);
        } else {
            setFiles([newFiles[0]]);
            field.setValue(newFiles[0]);
        }
        // Reset the input so the same file can be re-selected after removal
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index: number) => {
        const next = files.filter((_, i) => i !== index);
        setFiles(next);
        field.setValue(next.length > 0 ? (multiple ? next : next[0]) : null);
        field.touch();
    };

    const clearAll = () => {
        setFiles([]);
        setSizeError(null);
        field.setValue(null);
        field.touch();
    };

    const hiddenInput = (
        <input
            {...common}
            ref={fileInputRef}
            type="file"
            className="formspec-file-input-hidden"
            disabled={isReadonly}
            accept={accept}
            multiple={multiple}
            onChange={(e) => addFiles(e.target.files)}
        />
    );

    const fileList = files.length > 0 && (
        <ul className="formspec-file-list" aria-label="Selected files">
            {files.map((f, i) => (
                <li key={`${f.name}-${f.lastModified}`} className="formspec-file-list-item">
                    <span className="formspec-file-list-name">{f.name}</span>
                    <span className="formspec-file-list-size">{formatBytes(f.size)}</span>
                    {!isReadonly && (
                        <button
                            type="button"
                            className="formspec-file-list-remove"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => removeFile(i)}
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                    )}
                </li>
            ))}
            {multiple && files.length > 1 && !isReadonly && (
                <li className="formspec-file-list-actions">
                    <button type="button" className="formspec-file-list-clear" onClick={clearAll}>
                        Clear all
                    </button>
                </li>
            )}
        </ul>
    );

    const errorEl = sizeError && (
        <p className="formspec-file-size-error formspec-error">{sizeError}</p>
    );

    const browseBtnClass = 'formspec-file-browse-btn formspec-focus-ring formspec-button-secondary';

    if (!dragDrop) {
        // Siblings only — formspec-file-upload lives on the field root (parity with default web component adapter).
        return (
            <>
                {hiddenInput}
                <button
                    type="button"
                    className={browseBtnClass}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isReadonly}
                >
                    Choose file{multiple ? 's' : ''}
                </button>
                {fileList}
                {errorEl}
            </>
        );
    }

    return (
        <>
            <div
                className={`formspec-file-drop-zone formspec-focus-ring${isDragOver ? ' formspec-file-drop-zone--active' : ''}`}
                tabIndex={isReadonly ? -1 : 0}
                role="button"
                aria-label="Drop files here or click to browse"
                onKeyDown={(e) => {
                    if (isReadonly) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                    }
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    addFiles(e.dataTransfer.files);
                }}
            >
                <div className="formspec-file-drop-content">
                    <span className="formspec-file-drop-icon" aria-hidden="true">{'\u21F5'}</span>
                    <span className="formspec-file-drop-label">
                        {files.length === 0
                            ? (multiple ? 'Drag & drop files here' : 'Drag & drop a file here')
                            : `${files.length} file${files.length !== 1 ? 's' : ''} selected`}
                    </span>
                    <button
                        type="button"
                        className={browseBtnClass}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isReadonly}
                    >
                        Browse
                    </button>
                </div>
            </div>
            {hiddenInput}
            {fileList}
            {errorEl}
        </>
    );
}
