import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config';
import { getCapabilities } from './binaries';
import { registerOfficeRoutes } from './office';
import { mimeForFile, registerMediaRoutes } from './media';
import {
  cancelJob,
  cleanupOrphanedJobDirs,
  getJob,
  startCleanupTimer,
  toPublicJob
} from './jobs';
import { HttpError } from './errors';

async function main(): Promise<void> {
  await fsp.mkdir(config.dataDir, { recursive: true });

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
    bodyLimit: 4 * 1024 * 1024
  });

  const removedDirs = await cleanupOrphanedJobDirs();
  if (removedDirs > 0) {
    app.log.info({ removedDirs }, 'Direktori job lama dibersihkan');
  }

  app.addHook('onRequest', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  await app.register(cors, {
    origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86400
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 10
    }
  });

  app.get('/', async () => ({
    name: 'ToolsApps Server',
    status: 'ok',
    docs: '/api/health'
  }));

  app.get('/api/health', async () => {
    const capabilities = await getCapabilities();
    const clean = Object.fromEntries(
      Object.entries(capabilities).map(([key, value]) => [
        key,
        { available: value.available, version: value.version }
      ])
    );
    return {
      ok: true,
      name: 'ToolsApps Server',
      version: '0.1.0',
      capabilities: clean
    };
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request) => {
    const job = getJob(request.params.id);
    if (!job) throw new HttpError(404, 'Job tidak ditemukan atau sudah kedaluwarsa.');
    return toPublicJob(job);
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (request) => {
    const job = getJob(request.params.id);
    if (!job) throw new HttpError(404, 'Job tidak ditemukan.');
    const cancelled = cancelJob(job.id);
    return { cancelled };
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id/file', async (request, reply) => {
    const job = getJob(request.params.id);
    if (!job) throw new HttpError(404, 'Job tidak ditemukan atau sudah kedaluwarsa.');
    if (job.status !== 'done' || !job.filePath) {
      throw new HttpError(409, 'Berkas belum siap diunduh.');
    }
    const stats = await fsp.stat(job.filePath).catch(() => null);
    if (!stats) throw new HttpError(410, 'Berkas sudah dihapus dari server.');

    const fileName = job.fileName || path.basename(job.filePath);
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    reply
      .header('Content-Type', mimeForFile(fileName))
      .header('Content-Length', stats.size)
      .header(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
      )
      .header('Cache-Control', 'no-store');
    return reply.send(fs.createReadStream(job.filePath));
  });

  registerOfficeRoutes(app);
  registerMediaRoutes(app);

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ message: 'Endpoint tidak ditemukan.' });
  });

  app.setErrorHandler((error, request, reply) => {
    const code = (error as { code?: string }).code;
    const isHttpError = error instanceof HttpError;
    const statusCode =
      code === 'FST_REQ_FILE_TOO_LARGE'
        ? 413
        : isHttpError
          ? error.statusCode
          : typeof (error as { statusCode?: number }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : 500;

    if (statusCode >= 500 && !isHttpError) {
      request.log.error({ err: error }, 'Permintaan gagal');
    }

    const message =
      code === 'FST_REQ_FILE_TOO_LARGE'
        ? `Berkas melebihi batas ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`
        : statusCode >= 500 && !isHttpError
          ? 'Terjadi kesalahan internal di server.'
          : error instanceof Error
            ? error.message
            : 'Permintaan gagal.';

    reply.code(statusCode).send({ message });
  });

  const capabilities = await getCapabilities(true);
  app.log.info(
    {
      libreoffice: capabilities.libreoffice.available,
      ytDlp: capabilities.ytDlp.available,
      ffmpeg: capabilities.ffmpeg.available,
      dataDir: config.dataDir
    },
    'Komponen server terdeteksi'
  );
  if (!capabilities.libreoffice.available) {
    app.log.warn('LibreOffice tidak ditemukan — konversi Office via server dinonaktifkan.');
  }
  if (!capabilities.ytDlp.available) {
    app.log.warn('yt-dlp tidak ditemukan — unduhan media dinonaktifkan.');
  }
  if (!capabilities.ffmpeg.available) {
    app.log.warn('FFmpeg tidak ditemukan — audio MP3 & penggabungan video tidak tersedia.');
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`ToolsApps Server berjalan di http://localhost:${config.port}`);
  const cleanup = startCleanupTimer();

  const shutdown = async (signal: string) => {
    app.log.info(`Menerima ${signal}, menutup server...`);
    clearInterval(cleanup);
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
