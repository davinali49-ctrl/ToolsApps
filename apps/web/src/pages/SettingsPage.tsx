import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleDot,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  XCircle
} from 'lucide-react';
import { Alert, Spinner } from '../components/ui';
import { DEFAULT_SERVER_URL, useAppStore } from '../lib/store';
import { runtime, runtimeLabel } from '../lib/bridge';
import type { HealthCapability } from '../core/types';
import { cn, normalizeServerUrl } from '../lib/utils';

function CapabilityRow({
  name,
  description,
  capability
}: {
  name: string;
  description: string;
  capability?: HealthCapability;
}) {
  const available = Boolean(capability?.available);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
      <span className="mt-0.5">
        {available ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-400/80" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-200">{name}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
        {available && capability?.version ? (
          <p className="mt-1 truncate font-mono text-[10px] text-emerald-300/70">{capability.version}</p>
        ) : null}
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
          available
            ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
            : 'border-rose-400/20 bg-rose-400/10 text-rose-300'
        )}
      >
        {available ? 'Siap' : 'Tidak ada'}
      </span>
    </div>
  );
}

export function SettingsPage() {
  const serverUrl = useAppStore((state) => state.serverUrl);
  const serverStatus = useAppStore((state) => state.serverStatus);
  const health = useAppStore((state) => state.health);
  const serverError = useAppStore((state) => state.serverError);
  const setServerUrl = useAppStore((state) => state.setServerUrl);
  const checkServer = useAppStore((state) => state.checkServer);
  const [input, setInput] = useState(serverUrl);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setInput(serverUrl);
  }, [serverUrl]);

  async function saveAndTest() {
    const clean = normalizeServerUrl(input, DEFAULT_SERVER_URL);
    setTesting(true);
    setServerUrl(clean);
    try {
      await checkServer();
    } finally {
      setTesting(false);
    }
  }

  async function retest() {
    setTesting(true);
    try {
      await checkServer();
    } finally {
      setTesting(false);
    }
  }

  const capabilities = health?.capabilities;
  const statusMeta = {
    online: { label: 'Online', className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
    offline: { label: 'Offline', className: 'border-rose-400/25 bg-rose-400/10 text-rose-300' },
    checking: { label: 'Memeriksa', className: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
    unknown: { label: 'Belum dicek', className: 'border-white/10 bg-white/[0.04] text-slate-400' }
  }[serverStatus];

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-300">
          <SettingsIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Pengaturan</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
            Hubungkan aplikasi ke server ToolsApps untuk konversi Office dan unduhan media.
          </p>
        </div>
      </header>

      <section className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-100">Koneksi server</h2>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider',
              statusMeta.className
            )}
          >
            <CircleDot className="h-3 w-3" />
            {statusMeta.label}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            className="input min-w-0 flex-1 font-mono !text-[12px]"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={DEFAULT_SERVER_URL}
            spellCheck={false}
            disabled={testing}
          />
          <button type="button" onClick={() => void saveAndTest()} disabled={testing} className="btn-primary shrink-0">
            {testing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            Simpan & uji
          </button>
        </div>

        {serverError ? (
          <div className="mt-3">
            <Alert tone="error" title="Tidak terhubung">
              {serverError}
            </Alert>
          </div>
        ) : null}

        {serverStatus === 'online' && health ? (
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-2 text-[11px] text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Terhubung ke {health.name ?? 'ToolsApps Server'} {health.version ? `v${health.version}` : ''}
            </div>
            <CapabilityRow
              name="LibreOffice"
              description="Konversi Word, Excel, dan PowerPoint ke PDF."
              capability={capabilities?.libreoffice}
            />
            <CapabilityRow
              name="yt-dlp"
              description="Membaca tautan dan mengunduh media sosial."
              capability={capabilities?.ytDlp}
            />
            <CapabilityRow
              name="FFmpeg"
              description="Menggabung video/audio dan konversi MP3."
              capability={capabilities?.ffmpeg}
            />
            {!capabilities?.libreoffice?.available || !capabilities?.ytDlp?.available ? (
              <Alert tone="warning">
                Sebagian fitur server belum tersedia. Pasang komponen yang bertanda “Tidak ada” di
                server, lalu mulai ulang server.
              </Alert>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void retest()} disabled={testing} className="btn-ghost !py-2 !text-xs">
            {testing ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
            Uji ulang
          </button>
          <button
            type="button"
            onClick={() => {
              setInput(DEFAULT_SERVER_URL);
              setServerUrl(DEFAULT_SERVER_URL);
            }}
            className="btn-quiet !py-2 !text-xs"
          >
            Kembalikan default
          </button>
        </div>
      </section>

      <section className="panel p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-100">Menjalankan server lokal</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
          Dari folder proyek, jalankan perintah berikut. Server default berada di port 8787.
        </p>
        <div className="mt-3 space-y-2 rounded-lg border border-white/[0.06] bg-ink-950 p-3 font-mono text-[11px] text-slate-300">
          <p><span className="text-slate-600"># 1. pasang dependensi (sekali)</span><br />npm install</p>
          <p><span className="text-slate-600"># 2. jalankan server</span><br />npm run dev:server</p>
          <p><span className="text-slate-600"># 3. (terminal lain) jalankan UI</span><br />npm run dev:web</p>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Agar konversi Office dan unduhan media bekerja, server membutuhkan{' '}
          <span className="text-slate-300">LibreOffice</span>,{' '}
          <span className="text-slate-300">yt-dlp</span>, dan{' '}
          <span className="text-slate-300">FFmpeg</span>. Detail instalasi ada di{' '}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 text-slate-300">README.md</code>.
        </p>
      </section>

      <section className="panel p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-100">Platform & privasi</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <Smartphone className="mt-0.5 h-4 w-4 text-brand-300" />
            <div>
              <p className="text-xs font-semibold text-slate-200">Runtime</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{runtimeLabel[runtime]}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-slate-200">Pemrosesan lokal</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                PDF, gambar, dan ekstraksi teks tidak pernah meninggalkan perangkat.
              </p>
            </div>
          </div>
        </div>
        {runtime === 'android' ? (
          <div className="mt-3">
            <Alert tone="info" title="Android & HTTP">
              WebView Android membatasi permintaan HTTP dari origin <code className="mx-1 rounded bg-white/[0.08] px-1">https://localhost</code>.
              Build ini sudah mengaktifkan <code className="mx-1 rounded bg-white/[0.08] px-1">allowMixedContent</code> dan{' '}
              <code className="mx-1 rounded bg-white/[0.08] px-1">usesCleartextTraffic</code> untuk
              pengembangan. Untuk rilis, gunakan server HTTPS dan matikan kedua opsi.
            </Alert>
          </div>
        ) : null}
      </section>

      <section className="panel p-4">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-[11px] leading-relaxed text-slate-500">
            <p className="font-semibold text-slate-300">Sebelum dipakai publik</p>
            Tambahkan autentikasi, batas laju, validasi URL, dan pembersihan berkas otomatis di
            server. Jangan mengekspos yt-dlp/LibreOffice ke internet tanpa proteksi.
          </div>
        </div>
      </section>
    </div>
  );
}
