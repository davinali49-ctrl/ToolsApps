import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { Dropzone } from '../components/Dropzone';
import { ResultList } from '../components/ResultList';
import { Alert, Field, ProgressBar, Spinner, ToolBadge } from '../components/ui';
import { defaultValues, getTool } from '../core/registry';
import type { ResultFile } from '../core/types';
import { runtime } from '../lib/bridge';
import { useAppStore } from '../lib/store';

export function ToolPage({
  toolId,
  onNavigate
}: {
  toolId: string;
  onNavigate: (page: string) => void;
}) {
  const tool = getTool(toolId);
  const serverUrl = useAppStore((state) => state.serverUrl);
  const serverStatus = useAppStore((state) => state.serverStatus);
  const [files, setFiles] = useState<File[]>([]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    tool ? defaultValues(tool) : {}
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultFile[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (results.length) {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [results]);

  if (!tool) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-slate-400">Alat tidak ditemukan.</p>
        <button type="button" onClick={() => onNavigate('home')} className="btn-ghost mt-4">
          Kembali ke beranda
        </button>
      </div>
    );
  }

  const Icon = tool.icon;
  const serverOnline = serverStatus === 'online';
  const showOfflineOfficeWarning =
    tool.badge === 'hybrid' && !serverOnline && runtime !== 'desktop';

  async function handleRun() {
    if (!files.length) {
      setError('Pilih berkas terlebih dahulu.');
      return;
    }
    setRunning(true);
    setError(null);
    setResults([]);
    setProgress(2);
    setProgressLabel('Menyiapkan...');
    try {
      const output = await tool!.run(files, values, {
        serverUrl,
        serverOnline,
        runtime,
        onProgress: (percent, label) => {
          setProgress(percent);
          if (label) setProgressLabel(label);
        }
      });
      if (!output.length) throw new Error('Tidak ada hasil yang dihasilkan.');
      setProgress(100);
      setProgressLabel('Selesai');
      setResults(output);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Terjadi kesalahan saat memproses.');
      setProgress(0);
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setFiles([]);
    setResults([]);
    setError(null);
    setProgress(0);
    setProgressLabel('');
    setValues(defaultValues(tool!));
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => onNavigate('home')}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Semua alat
      </button>

      <header className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-brand-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{tool.name}</h1>
            <ToolBadge badge={tool.badge} />
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{tool.description}</p>
        </div>
        {files.length || results.length ? (
          <button type="button" onClick={reset} disabled={running} className="btn-quiet !px-2.5 !py-2" title="Reset">
            <RotateCcw className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      {showOfflineOfficeWarning ? (
        <Alert tone="warning" title="Server sedang offline">
          DOCX, XLSX, CSV, dan ODS diproses dengan mode perkiraan di perangkat. DOC/RTF/ODT dan
          PowerPoint membutuhkan server/LibreOffice. Atur URL server di Pengaturan untuk hasil
          terbaik.
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Dropzone
            accept={tool.accept}
            acceptLabel={tool.acceptLabel}
            multiple={tool.multiple}
            files={files}
            onChange={(next) => {
              setFiles(next);
              setResults([]);
              setError(null);
            }}
            disabled={running}
          />

          {tool.options.length ? (
            <div className="panel space-y-4 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pengaturan</p>
              {tool.options.map((option) => (
                <Field key={option.key} label={option.label} hint={option.hint}>
                  {option.type === 'select' ? (
                    <select
                      className="input"
                      value={values[option.key] ?? option.defaultValue}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [option.key]: event.target.value }))
                      }
                      disabled={running}
                    >
                      {option.options?.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="input"
                      value={values[option.key] ?? ''}
                      placeholder={option.placeholder}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [option.key]: event.target.value }))
                      }
                      disabled={running}
                    />
                  )}
                </Field>
              ))}
            </div>
          ) : null}
        </div>

        <div className="panel space-y-4 p-4 lg:sticky lg:top-6">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Berkas dipilih</span>
            <span className="font-semibold text-slate-200">{files.length}</span>
          </div>
          <p className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
            {tool.badge === 'offline'
              ? 'Diproses sepenuhnya di perangkat. Tidak ada data yang dikirim.'
              : tool.badge === 'hybrid'
                ? 'Server/LibreOffice diprioritaskan. Mode offline tersedia untuk DOCX, XLSX, CSV, dan ODS.'
                : 'Konversi berbasis teks. Layout dan gambar tidak disalin.'}
          </p>

          {running ? (
            <ProgressBar percent={progress} label={progressLabel} />
          ) : null}

          <button
            type="button"
            onClick={handleRun}
            disabled={running || !files.length}
            className="btn-primary w-full"
          >
            {running ? <Spinner /> : <Play className="h-4 w-4" />}
            {running ? 'Memproses...' : `Jalankan ${tool.name}`}
          </button>

          {error ? <Alert tone="error">{error}</Alert> : null}
        </div>
      </div>

      {results.length ? (
        <div ref={resultRef}>
          <ResultList results={results} />
        </div>
      ) : null}
    </div>
  );
}
