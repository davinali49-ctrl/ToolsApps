import { useState } from 'react';
import {
  ClipboardPaste,
  Download,
  Film,
  Link2,
  Music2,
  Server,
  Settings,
  Wand2,
  Youtube
} from 'lucide-react';
import { Alert, ProgressBar, Spinner, ToolBadge } from '../components/ui';
import { inspectMedia, cancelJob, jobFileUrl, startMediaDownload, waitForJob } from '../lib/api';
import { useAppStore } from '../lib/store';
import type { MediaInspect, MediaMode } from '../core/types';
import { cn } from '../lib/utils';

const VIDEO_PRESETS = [2160, 1440, 1080, 720, 480, 360];
const AUDIO_PRESETS = [320, 256, 192, 128, 96];

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function qualityLabel(height: number): string {
  if (height >= 2160) return '4K';
  if (height >= 1440) return '2K';
  return `${height}p`;
}

export function MediaPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const serverUrl = useAppStore((state) => state.serverUrl);
  const serverStatus = useAppStore((state) => state.serverStatus);
  const [url, setUrl] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [info, setInfo] = useState<MediaInspect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MediaMode>('video');
  const [videoQuality, setVideoQuality] = useState(1080);
  const [audioBitrate, setAudioBitrate] = useState(192);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [done, setDone] = useState<{ url: string; name: string } | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const serverOnline = serverStatus === 'online';

  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      setError('Browser tidak mengizinkan akses clipboard. Tempel tautan secara manual.');
    }
  }

  async function analyze() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Tempel tautan video terlebih dahulu.');
      return;
    }
    if (!serverOnline) {
      setError('Server offline. Unduhan media membutuhkan server yt-dlp yang aktif.');
      return;
    }
    setInspecting(true);
    setError(null);
    setInfo(null);
    setDone(null);
    try {
      const result = await inspectMedia(serverUrl, trimmed);
      setInfo(result);
      if (result.heights.length) {
        const preferred = result.heights.includes(1080)
          ? 1080
          : result.heights[Math.floor(result.heights.length / 2)] ?? 720;
        setVideoQuality(preferred);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membaca tautan.');
    } finally {
      setInspecting(false);
    }
  }

  async function download() {
    if (!info) return;
    setDownloading(true);
    setError(null);
    setDone(null);
    setProgress(0);
    setProgressMessage('Menyiapkan unduhan...');
    const abort = new AbortController();
    setController(abort);
    try {
      const job = await startMediaDownload(serverUrl, {
        url: info.webpageUrl || url.trim(),
        mode,
        quality: mode === 'audio' ? audioBitrate : videoQuality,
        container: mode === 'audio' ? 'mp3' : 'mp4'
      });
      setJobId(job.id);
      const finished = await waitForJob(serverUrl, job.id, {
        signal: abort.signal,
        timeoutMs: 45 * 60_000,
        onUpdate: (update) => {
          setProgress(update.progress);
          setProgressMessage(update.message || 'Mengunduh...');
        }
      });
      setProgress(100);
      setProgressMessage('Selesai');
      setDone({
        url: jobFileUrl(serverUrl, finished.id),
        name: finished.fileName || (mode === 'audio' ? 'audio.mp3' : 'video.mp4')
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unduhan gagal.';
      setError(message === 'Dibatalkan.' ? 'Unduhan dibatalkan. Proses di server mungkin masih berjalan.' : message);
    } finally {
      setDownloading(false);
      setController(null);
      setJobId(null);
    }
  }

  function cancelDownload() {
    controller?.abort();
    if (jobId) void cancelJob(serverUrl, jobId).catch(() => undefined);
  }

  const heights = info?.heights.length ? info.heights : VIDEO_PRESETS;

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-brand-300">
          <Download className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Unduh Media</h1>
            <ToolBadge badge="online" />
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
            YouTube, Instagram, dan TikTok. Pilih resolusi video hingga 4K atau ekstrak audio MP3
            dengan bitrate pilihan.
          </p>
        </div>
      </header>

      {!serverOnline ? (
        <Alert tone="warning" title="Server downloader belum aktif">
          Fitur ini membutuhkan server dengan <span className="font-semibold">yt-dlp</span> dan{' '}
          <span className="font-semibold">ffmpeg</span>. Jalankan <code>npm run dev:server</code> lalu
          atur URL-nya di Pengaturan.
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200 underline underline-offset-4"
          >
            <Settings className="h-3.5 w-3.5" />
            Buka Pengaturan
          </button>
        </Alert>
      ) : null}

      <div className="panel p-4 sm:p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void analyze();
          }}
          className="space-y-3"
        >
          <label className="label">Tautan video</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input
                type="url"
                className="input !pl-9"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={inspecting || downloading}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={pasteLink}
                disabled={inspecting || downloading}
                className="btn-ghost shrink-0 !px-3"
                title="Tempel dari clipboard"
              >
                <ClipboardPaste className="h-4 w-4" />
                <span className="sm:hidden">Tempel</span>
              </button>
              <button
                type="submit"
                disabled={inspecting || downloading || !serverOnline}
                className="btn-primary shrink-0"
              >
                {inspecting ? <Spinner /> : <Wand2 className="h-4 w-4" />}
                {inspecting ? 'Menganalisa...' : 'Analisa'}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="chip"><Youtube className="h-3 w-3 text-slate-500" /> YouTube</span>
          <span className="chip">Instagram Reels</span>
          <span className="chip">TikTok</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Server className="h-3 w-3" />
            {serverStatus === 'online' ? 'Server siap' : serverStatus === 'checking' ? 'Memeriksa...' : 'Server offline'}
          </span>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {info ? (
        <div className="panel overflow-hidden animate-fade-up">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
            {info.thumbnail ? (
              <img
                src={info.thumbnail}
                alt=""
                referrerPolicy="no-referrer"
                className="h-32 w-full rounded-xl border border-white/[0.07] object-cover sm:h-24 sm:w-44"
              />
            ) : (
              <div className="grid h-24 w-full shrink-0 place-items-center rounded-xl bg-white/[0.04] text-slate-600 sm:w-44">
                <Film className="h-7 w-7" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100">
                {info.title}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {[info.uploader, formatDuration(info.duration), info.extractor]
                  .filter(Boolean)
                  .join(' • ')}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {info.heights.slice(0, 6).map((height) => (
                  <span key={height} className="chip !text-[10px]">{qualityLabel(height)}</span>
                ))}
                {!info.heights.length ? <span className="chip !text-[10px]">Audio saja</span> : null}
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] p-4 sm:p-5">
            <div className="mb-4 inline-flex rounded-lg border border-white/[0.08] bg-ink-950 p-1">
              <button
                type="button"
                onClick={() => setMode('video')}
                disabled={downloading}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors',
                  mode === 'video'
                    ? 'bg-white/[0.06] text-white'
                    : 'text-slate-500 hover:text-slate-200'
                )}
              >
                <Film className="h-3.5 w-3.5" />
                Video MP4
              </button>
              <button
                type="button"
                onClick={() => setMode('audio')}
                disabled={downloading}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors',
                  mode === 'audio'
                    ? 'bg-white/[0.06] text-white'
                    : 'text-slate-500 hover:text-slate-200'
                )}
              >
                <Music2 className="h-3.5 w-3.5" />
                Audio MP3
              </button>
            </div>

            {mode === 'video' ? (
              <div>
                <p className="label">Resolusi</p>
                <div className="flex flex-wrap gap-2">
                  {heights.map((height) => (
                    <button
                      key={height}
                      type="button"
                      onClick={() => setVideoQuality(height)}
                      disabled={downloading}
                      className={cn(
                        'rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors',
                        videoQuality === height
                          ? 'border-brand-400/40 bg-brand-500/[0.08] text-brand-200'
                          : 'border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
                      )}
                    >
                      {qualityLabel(height)}
                      <span className="ml-1.5 text-[10px] font-normal opacity-60">{height}p</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-[11px] text-slate-500">
                  Video dan audio digabung menjadi MP4. Tersedia hingga resolusi sumber.
                </p>
              </div>
            ) : (
              <div>
                <p className="label">Bitrate audio</p>
                <div className="flex flex-wrap gap-2">
                  {AUDIO_PRESETS.map((bitrate) => (
                    <button
                      key={bitrate}
                      type="button"
                      onClick={() => setAudioBitrate(bitrate)}
                      disabled={downloading}
                      className={cn(
                        'rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors',
                        audioBitrate === bitrate
                          ? 'border-brand-400/40 bg-brand-500/[0.08] text-brand-200'
                          : 'border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
                      )}
                    >
                      {bitrate} kbps
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-[11px] text-slate-500">
                  Dikonversi ke MP3 oleh ffmpeg di server. Bitrate tinggi tidak selalu menambah
                  kualitas sumber.
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => void download()}
                disabled={downloading}
                className="btn-primary sm:min-w-[190px]"
              >
                {downloading ? <Spinner /> : <Download className="h-4 w-4" />}
                {downloading ? 'Mengunduh...' : 'Unduh sekarang'}
              </button>
              {downloading ? (
                <button
                  type="button"
                  onClick={cancelDownload}
                  className="btn-ghost"
                >
                  Batalkan
                </button>
              ) : null}
              <span className="text-[11px] text-slate-500">
                {mode === 'video' ? `MP4 • ${qualityLabel(videoQuality)}` : `MP3 • ${audioBitrate} kbps`}
              </span>
            </div>

            {downloading || (progress > 0 && progress < 100) ? (
              <div className="mt-4">
                <ProgressBar percent={progress} label={progressMessage} />
              </div>
            ) : null}

            {done ? (
              <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-sm font-medium text-white">Berkas siap diunduh</p>
                <p className="mt-1 text-[11px] text-slate-500">{done.name}</p>
                <a
                  href={done.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary mt-3 !py-2 !text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Simpan berkas
                </a>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  Tautan berlaku sementara. Di Android, browser akan menangani penyimpanan ke folder
                  Download.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="panel p-4 text-[11px] leading-relaxed text-slate-500">
        <p className="mb-1 font-semibold text-slate-400">Catatan penggunaan</p>
        Unduh hanya konten yang kamu berhak akses. Hormati hak cipta dan ketentuan layanan
        masing-masing platform. Video privat atau yang butuh login tidak didukung.
      </div>
    </div>
  );
}
