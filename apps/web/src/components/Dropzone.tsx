import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  File as FileIcon,
  Plus,
  UploadCloud,
  X
} from 'lucide-react';
import { cn, formatBytes } from '../lib/utils';

interface DropzoneProps {
  accept: string;
  acceptLabel: string;
  multiple: boolean;
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

const MAX_SIZE = 200 * 1024 * 1024;

export function Dropzone({
  accept,
  acceptLabel,
  multiple,
  files,
  onChange,
  disabled
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function addFiles(incoming: File[]) {
    setError(null);
    if (!incoming.length) return;
    const tooBig = incoming.find((file) => file.size > MAX_SIZE);
    if (tooBig) {
      setError(`"${tooBig.name}" melebihi 200 MB.`);
      return;
    }
    if (!multiple) {
      onChange([incoming[0]!]);
      return;
    }
    const merged = [...files];
    for (const file of incoming) {
      const duplicate = merged.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
      );
      if (!duplicate) merged.push(file);
    }
    onChange(merged);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  return (
    <div>
      <div
        className={cn(
          'rounded-xl border border-dashed transition-colors',
          dragging
            ? 'border-brand-400/60 bg-brand-500/[0.05]'
            : 'border-white/[0.08] bg-white/[0.01] hover:border-white/[0.14]',
          disabled && 'pointer-events-none opacity-60'
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files ?? []));
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />

        {files.length === 0 ? (
          <button
            type="button"
            onClick={openPicker}
            className="flex w-full flex-col items-center gap-3 px-6 py-12 text-center outline-none"
          >
            <span className="grid h-12 w-12 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-brand-300">
              <UploadCloud className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-100">
                Tarik berkas ke sini atau <span className="text-brand-300">pilih dari perangkat</span>
              </span>
              <span className="mt-1.5 block text-xs text-slate-500">
                {acceptLabel} • maks. 200 MB {multiple ? '• bisa beberapa berkas' : ''}
              </span>
            </span>
          </button>
        ) : (
          <div className="p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-xs font-medium text-slate-400">
                {files.length} berkas dipilih
              </span>
              <button
                type="button"
                onClick={openPicker}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-300 transition-colors hover:bg-white/[0.05]"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah
              </button>
            </div>
            <ul className="space-y-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 px-3 py-2.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-slate-400">
                    <FileIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-200">
                      {file.name}
                    </span>
                    <span className="block text-[11px] text-slate-500">{formatBytes(file.size)}</span>
                  </span>
                  {multiple && files.length > 1 ? (
                    <span className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label="Naikkan urutan"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="rounded p-0.5 text-slate-500 transition hover:text-slate-200 disabled:opacity-25"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Turunkan urutan"
                        disabled={index === files.length - 1}
                        onClick={() => move(index, 1)}
                        className="rounded p-0.5 text-slate-500 transition hover:text-slate-200 disabled:opacity-25"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Hapus ${file.name}`}
                    onClick={() => onChange(files.filter((_, position) => position !== index))}
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 px-1 text-[11px] text-slate-500">
              Tarik berkas lain ke area ini untuk menambahkan.
            </p>
          </div>
        )}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
