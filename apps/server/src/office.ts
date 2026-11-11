import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { binaries } from './binaries';
import { config } from './config';
import {
  completeJob,
  createJob,
  failJob,
  getJob,
  terminateJobProcess,
  toPublicJob,
  updateJob
} from './jobs';
import { HttpError } from './errors';

const ALLOWED_EXTENSIONS = new Set([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'rtf',
  'odt',
  'ods',
  'odp',
  'csv',
  'txt'
]);

const CONVERT_TIMEOUT_MS = 3 * 60_000;

function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()\[\]]/g, '_').slice(0, 140);
  return base || 'berkas';
}

async function findPdf(directory: string): Promise<string | null> {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const candidates: Array<{ file: string; mtime: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pdf')) continue;
    const stats = await fsp.stat(path.join(directory, entry.name)).catch(() => null);
    if (stats) candidates.push({ file: entry.name, mtime: stats.mtimeMs });
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.file ?? null;
}

async function convertWithLibreOffice(jobId: string, inputPath: string): Promise<void> {
  const job = getJob(jobId);
  if (!job || !binaries.soffice) return;

  const profileDir = path.join(job.dir, '.profile');
  fs.mkdirSync(profileDir, { recursive: true });
  updateJob(jobId, { progress: 25, message: 'Menjalankan LibreOffice...' });

  const args = [
    '--headless',
    '--norestore',
    '--nolockcheck',
    '--nodefault',
    '--nofirststartwizard',
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    '--convert-to',
    'pdf',
    '--outdir',
    job.dir,
    inputPath
  ];

  await new Promise<void>((resolve) => {
    let stderr = '';
    let settled = false;
    const child = spawn(binaries.soffice!, args, { windowsHide: true });
    updateJob(jobId, { child, progress: 45, message: 'Mengonversi dengan LibreOffice...' });

    const timer = setTimeout(() => {
      stderr += '\nProses melebihi batas waktu.';
      terminateJobProcess(child);
    }, CONVERT_TIMEOUT_MS);

    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) failJob(jobId, error);
      resolve();
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) updateJob(jobId, { progress: 70, message: 'Menyimpan PDF...' });
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-6000);
    });
    child.on('error', (error) => finish(`LibreOffice gagal dijalankan: ${error.message}`));
    child.on('close', (code) => {
      if (getJob(jobId)?.status === 'error') {
        finish();
        return;
      }
      if (code !== 0) {
        finish(`LibreOffice keluar dengan kode ${code}. ${stderr.trim().slice(-400)}`);
        return;
      }
      void (async () => {
        try {
          const pdfName = await findPdf(job.dir);
          if (!pdfName) {
            finish('LibreOffice tidak menghasilkan PDF. Format berkas mungkin tidak didukung.');
            return;
          }
          completeJob(jobId, path.join(job.dir, pdfName), pdfName);
          await fsp.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
          await fsp.rm(inputPath, { force: true }).catch(() => undefined);
          finish();
        } catch (error) {
          finish(
            error instanceof Error ? error.message : 'Gagal menyelesaikan konversi Office.'
          );
        }
      })();
    });
  });
}

export function registerOfficeRoutes(app: FastifyInstance): void {
  app.post('/api/convert/office', async (request, reply) => {
    if (!binaries.soffice) {
      throw new HttpError(
        503,
        'LibreOffice belum terpasang di server. Pasang LibreOffice atau gunakan aplikasi desktop.'
      );
    }

    let part;
    try {
      part = await request.file();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new HttpError(413, `Berkas terlalu besar. Batas unggah ${config.maxUploadMb} MB.`);
      }
      throw error;
    }

    if (!part) throw new HttpError(400, 'Tidak ada berkas yang diunggah.');
    const originalName = part.filename || 'berkas';
    const extension = path.extname(originalName).slice(1).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      part.file.resume();
      throw new HttpError(
        415,
        `Format .${extension || '?'} tidak didukung. Gunakan Word, Excel, PowerPoint, atau CSV.`
      );
    }

    const job = createJob('office');
    const fileName = safeFileName(originalName);
    const inputPath = path.join(job.dir, fileName);

    try {
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(inputPath);
        part.file.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        part.file.pipe(writeStream);
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      failJob(job.id, 'Gagal menyimpan berkas unggahan.');
      await fsp.rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new HttpError(413, `Berkas terlalu besar. Batas unggah ${config.maxUploadMb} MB.`);
      }
      throw error;
    }

    if (part.file.truncated) {
      failJob(job.id, 'Berkas melebihi batas ukuran.');
      await fsp.rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
      throw new HttpError(413, `Berkas terlalu besar. Batas unggah ${config.maxUploadMb} MB.`);
    }

    reply.code(202);
    void convertWithLibreOffice(job.id, inputPath).catch((error) => {
      failJob(job.id, error instanceof Error ? error.message : 'Konversi gagal dijalankan.');
    });
    return toPublicJob(job);
  });
}
