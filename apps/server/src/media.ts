import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { binaries } from './binaries';
import { config } from './config';
import { HttpError, clamp } from './errors';
import {
  completeJob,
  createJob,
  failJob,
  getJob,
  terminateJobProcess,
  toPublicJob,
  updateJob
} from './jobs';

const INSPECT_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 45 * 60_000;
const MAX_JSON_BYTES = 64 * 1024 * 1024;

interface YtDlpFormat {
  height?: number;
  vcodec?: string;
  acodec?: string;
  abr?: number;
  tbr?: number;
}

interface YtDlpInfo {
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
  original_url?: string;
  extractor_key?: string;
  extractor?: string;
  is_live?: boolean;
  formats?: YtDlpFormat[];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf'
};

function isPrivateHost(rawHost: string): boolean {
  const host = rawHost
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '0' ||
    host === '::1' ||
    host === '::' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  // IPv6 loopback, link-local, unique-local, dan IPv4-mapped.
  if (/^(fe|fc|fd)/.test(host) || host.startsWith('::ffff:')) return true;

  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }
  const [a, b, c] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function assertMediaUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new HttpError(400, 'Tautan tidak boleh kosong.');
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'Format tautan tidak valid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Hanya tautan http/https yang didukung.');
  }
  if (isPrivateHost(url.hostname)) {
    throw new HttpError(400, 'Tautan ke jaringan lokal tidak diizinkan.');
  }
  return url.toString();
}

function runCollect(
  command: string,
  args: string[],
  timeoutMs: number,
  onData?: (chunk: string) => void,
  maxBytes = MAX_JSON_BYTES
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncated = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (stdout.length + text.length <= maxBytes) {
        stdout += text;
      } else if (!truncated) {
        truncated = true;
      }
      onData?.(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-12_000);
    });
    child.on('error', (error) => {
      stderr += `\n${error.message}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, truncated });
    });
  });
}

function friendlyYtDlpError(stderr: string): string {
  const text = stderr.trim();
  if (/Sign in to confirm|login required|requires authentication|cookies/i.test(text)) {
    return 'Konten ini membutuhkan login. Video privat/terbatas tidak didukung.';
  }
  if (/Unsupported URL|is not a valid URL/i.test(text)) {
    return 'Tautan ini tidak dikenali oleh yt-dlp. Pastikan tautan video valid.';
  }
  if (/Private video|This video is private/i.test(text)) {
    return 'Video bersifat privat dan tidak bisa diunduh.';
  }
  if (/ffmpeg|ffprobe/i.test(text)) {
    return 'FFmpeg tidak ditemukan di server. Pasang FFmpeg untuk menggabung video/audio.';
  }
  if (/HTTP Error 429|Too Many Requests/i.test(text)) {
    return 'Platform membatasi permintaan (429). Coba lagi beberapa saat lagi.';
  }
  if (/Requested format is not available/i.test(text)) {
    return 'Format yang diminta tidak tersedia. Untuk YouTube, pasang FFmpeg di server agar video dan audio bisa digabung.';
  }
  const lastLine = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
  return lastLine ? `yt-dlp: ${lastLine.slice(0, 320)}` : 'yt-dlp gagal memproses tautan.';
}

async function inspect(url: string): Promise<Record<string, unknown>> {
  if (!binaries.ytDlp) {
    throw new HttpError(503, 'yt-dlp belum terpasang di server.');
  }

  const result = await runCollect(
    binaries.ytDlp,
    ['--no-playlist', '--no-warnings', '--socket-timeout', '20', '-J', url],
    INSPECT_TIMEOUT_MS
  );

  if (result.timedOut) throw new HttpError(504, 'Analisa tautan melebihi batas waktu.');
  if (result.code !== 0) throw new HttpError(422, friendlyYtDlpError(result.stderr));
  if (result.truncated) {
    throw new HttpError(502, 'Metadata media terlalu besar untuk dibaca server.');
  }

  let info: YtDlpInfo;
  try {
    info = JSON.parse(result.stdout) as YtDlpInfo;
  } catch {
    throw new HttpError(502, 'Respons yt-dlp tidak bisa dibaca.');
  }

  if (info.is_live) {
    throw new HttpError(422, 'Siaran langsung tidak bisa diunduh.');
  }
  if (info.duration && info.duration > config.maxMediaDuration) {
    throw new HttpError(
      422,
      `Durasi media melebihi batas ${Math.round(config.maxMediaDuration / 60)} menit.`
    );
  }

  const formats = Array.isArray(info.formats) ? info.formats : [];
  const heights = [
    ...new Set(
      formats
        .filter((format) => format.vcodec && format.vcodec !== 'none' && Number(format.height))
        .map((format) => Number(format.height))
        .filter((height) => height >= 144 && height <= 4320)
    )
  ]
    .sort((a, b) => b - a)
    .slice(0, 10);

  const audioBitrates = [
    ...new Set(
      formats
        .filter((format) => format.acodec && format.acodec !== 'none')
        .map((format) => Math.round(Number(format.abr || format.tbr || 0)))
        .filter((bitrate) => bitrate >= 32 && bitrate <= 512)
    )
  ]
    .sort((a, b) => b - a)
    .slice(0, 8);

  return {
    title: info.title || 'Tanpa judul',
    uploader: info.uploader || info.channel || '',
    duration: info.duration,
    thumbnail: info.thumbnail,
    webpageUrl: info.webpage_url || info.original_url || url,
    extractor: info.extractor_key || info.extractor || '',
    heights,
    audioBitrates
  };
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mkv', 'mov']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'ogg', 'opus', 'wav']);

function extensionOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

async function newestFile(
  directory: string,
  allowed: Set<string>
): Promise<{ name: string; valid: boolean } | null> {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const files: Array<{ name: string; mtime: number; valid: boolean }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (/\.(part|ytdl|temp)$/i.test(entry.name)) continue;
    if (entry.name.startsWith('.') || entry.name === 'metadata.json') continue;
    const stats = await fsp.stat(path.join(directory, entry.name)).catch(() => null);
    if (!stats || stats.size <= 0) continue;
    files.push({
      name: entry.name,
      mtime: stats.mtimeMs,
      valid: allowed.has(extensionOf(entry.name))
    });
  }
  files.sort((a, b) => Number(b.valid) - Number(a.valid) || b.mtime - a.mtime);
  const best = files[0];
  return best ? { name: best.name, valid: best.valid } : null;
}

async function downloadMedia(
  jobId: string,
  url: string,
  mode: 'video' | 'audio',
  quality: number
): Promise<void> {
  const job = getJob(jobId);
  if (!job || !binaries.ytDlp) return;

  if (mode === 'audio' && !binaries.ffmpeg) {
    failJob(jobId, 'Konversi MP3 membutuhkan FFmpeg di server.');
    return;
  }

  const outputTemplate = path.join(job.dir, '%(title).80s [%(id)s].%(ext)s');
  const args = [
    '--no-playlist',
    '--newline',
    '--no-warnings',
    '--no-mtime',
    '--restrict-filenames',
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    '-o',
    outputTemplate
  ];

  if (binaries.ffmpeg) args.push('--ffmpeg-location', binaries.ffmpeg);

  if (mode === 'video') {
    const height = clamp(Math.round(quality), 144, 4320);
    if (binaries.ffmpeg) {
      args.push(
        '-f',
        `bv*[height<=${height}]+ba/b[height<=${height}]/b`,
        '--merge-output-format',
        'mp4',
        '--remux-video',
        'mp4'
      );
    } else {
      args.push('-f', `b[height<=${height}][ext=mp4]/b[height<=${height}]/b`);
    }
  } else {
    const bitrate = clamp(Math.round(quality), 32, 320);
    args.push(
      '-f',
      'bestaudio/best',
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      `${bitrate}K`
    );
  }

  args.push(url);

  await new Promise<void>((resolve) => {
    let stderr = '';
    let settled = false;
    const child = spawn(binaries.ytDlp!, args, { windowsHide: true });
    updateJob(jobId, { child, progress: 1, message: 'Menghubungi platform...' });

    const timer = setTimeout(() => {
      stderr += '\nUnduhan melebihi batas waktu.';
      terminateJobProcess(child);
    }, DOWNLOAD_TIMEOUT_MS);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const percentMatches = [...text.matchAll(/\[download\]\s+([\d.]+)%/g)];
      const last = percentMatches[percentMatches.length - 1];
      if (last) {
        const percent = Number(last[1]);
        if (Number.isFinite(percent)) {
          updateJob(jobId, {
            progress: Math.min(99, Math.max(1, percent)),
            message: `Mengunduh ${percent.toFixed(1)}%`
          });
        }
      }
      if (/\[Merger\]|\[ExtractAudio\]|\[VideoConvertor\]|\[FixupM/.test(text)) {
        updateJob(jobId, { progress: 96, message: 'Memproses media...' });
      }
      if (/\[download\] Destination:/.test(text)) {
        updateJob(jobId, { message: 'Mengunduh...' });
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-12_000);
    });

    child.on('error', (error) => {
      failJob(jobId, `yt-dlp gagal dijalankan: ${error.message}`);
      finish();
    });

    child.on('close', (code) => {
      void (async () => {
        try {
          const current = getJob(jobId);
          if (!current || current.status === 'error') return;
          if (code !== 0) {
            failJob(jobId, friendlyYtDlpError(stderr));
            return;
          }
          const allowed = mode === 'audio' ? AUDIO_EXTENSIONS : VIDEO_EXTENSIONS;
          const found = await newestFile(job.dir, allowed);
          if (!found) {
            failJob(jobId, 'Unduhan selesai tetapi berkas hasil tidak ditemukan.');
            return;
          }
          if (!found.valid) {
            failJob(jobId, `Hasil unduhan tidak dikenali (${found.name}). Coba kualitas lain.`);
            return;
          }
          completeJob(jobId, path.join(job.dir, found.name), found.name);
        } catch (error) {
          failJob(
            jobId,
            error instanceof Error ? error.message : 'Gagal menyelesaikan unduhan.'
          );
        } finally {
          finish();
        }
      })();
    });
  });
}

export function registerMediaRoutes(app: FastifyInstance): void {
  app.post('/api/media/inspect', async (request) => {
    const body = (request.body ?? {}) as { url?: string };
    const url = assertMediaUrl(body.url);
    return inspect(url);
  });

  app.post('/api/media/download', async (request, reply) => {
    if (!binaries.ytDlp) {
      throw new HttpError(503, 'yt-dlp belum terpasang di server.');
    }
    const body = (request.body ?? {}) as {
      url?: string;
      mode?: string;
      quality?: number;
    };
    const url = assertMediaUrl(body.url);
    const mode = body.mode === 'audio' ? 'audio' : 'video';
    const quality = Number(body.quality) || (mode === 'audio' ? 192 : 1080);

    const job = createJob('media');
    reply.code(202);
    void downloadMedia(job.id, url, mode, quality).catch((error) => {
      failJob(job.id, error instanceof Error ? error.message : 'Unduhan gagal dijalankan.');
    });
    return toPublicJob(job);
  });
}

export function mimeForFile(fileName: string): string {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
