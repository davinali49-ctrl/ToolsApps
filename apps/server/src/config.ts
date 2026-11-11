import os from 'node:os';
import path from 'node:path';

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const maxUploadMb = numberFromEnv(process.env.MAX_UPLOAD_MB, 200);
const maxMediaMinutes = numberFromEnv(process.env.MAX_MEDIA_MINUTES, 180);

export const config = {
  port: numberFromEnv(process.env.PORT, 8787),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || path.join(os.tmpdir(), 'toolsapps-server'),
  maxUploadMb,
  maxUploadBytes: maxUploadMb * 1024 * 1024,
  jobTtlMs: numberFromEnv(process.env.JOB_TTL_MINUTES, 120) * 60_000,
  allowedOrigins: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  sofficePath: process.env.SOFFICE_PATH || '',
  ytDlpPath: process.env.YTDLP_PATH || '',
  ffmpegPath: process.env.FFMPEG_PATH || '',
  maxMediaMinutes,
  maxMediaDuration: maxMediaMinutes * 60
};
