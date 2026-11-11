import { useState } from 'react';
import { Archive, CheckCircle2, Download } from 'lucide-react';
import JSZip from 'jszip';
import type { ResultFile } from '../core/types';
import { saveBlob } from '../lib/bridge';
import { formatBytes } from '../lib/utils';
import { Spinner } from './ui';

export function ResultList({ results }: { results: ResultFile[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!results.length) return null;
  const multiple = results.length > 1;

  async function save(result: ResultFile, key: string) {
    setBusy(key);
    setError(null);
    try {
      const path = await saveBlob(result.blob, result.name);
      setSaved(path || result.name);
      window.setTimeout(() => setSaved(null), 4000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan berkas.');
    } finally {
      setBusy(null);
    }
  }

  async function saveAll() {
    setBusy('__all__');
    setError(null);
    try {
      const zip = new JSZip();
      results.forEach((result) => zip.file(result.name, result.blob));
      const blob = await zip.generateAsync({ type: 'blob' });
      const path = await saveBlob(blob, 'toolsapps-hasil.zip');
      setSaved(path || 'toolsapps-hasil.zip');
      window.setTimeout(() => setSaved(null), 4000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan semua berkas.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel overflow-hidden animate-fade-up">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400/80" />
          Selesai — {results.length} berkas
        </div>
        {multiple ? (
          <button type="button" onClick={saveAll} disabled={busy !== null} className="btn-ghost !px-3 !py-1.5 !text-xs">
            {busy === '__all__' ? <Spinner /> : <Archive className="h-3.5 w-3.5" />}
            Unduh semua (.zip)
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-white/[0.05]">
        {results.map((result, index) => {
          const key = `${result.name}-${index}`;
          return (
            <li key={key} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400">
                <Download className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-100">{result.name}</span>
                <span className="block text-[11px] text-slate-500">
                  {formatBytes(result.blob.size)}
                  {result.note ? ` • ${result.note}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => save(result, key)}
                disabled={busy !== null}
                className="btn-ghost shrink-0 !px-3 !py-2 !text-xs"
              >
                {busy === key ? <Spinner /> : <Download className="h-3.5 w-3.5" />}
                Simpan
              </button>
            </li>
          );
        })}
      </ul>
      {saved ? (
        <div className="border-t border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] text-slate-400">
          Tersimpan: {saved}
        </div>
      ) : null}
      {error ? (
        <div className="border-t border-rose-400/15 bg-rose-400/[0.06] px-4 py-2 text-[11px] text-rose-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}
