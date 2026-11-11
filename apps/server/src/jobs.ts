import { randomUUID } from 'node:crypto';
import { execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Job {
  id: string;
  kind: 'office' | 'media';
  status: JobStatus;
  progress: number;
  message?: string;
  fileName?: string;
  filePath?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  dir: string;
  child?: ChildProcess;
}

export interface PublicJob {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  message?: string;
  fileName?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, Job>();

export function jobDirectory(id: string): string {
  return path.join(config.dataDir, 'jobs', id);
}

export function createJob(kind: Job['kind']): Job {
  const id = randomUUID().replace(/-/g, '').slice(0, 16);
  const dir = jobDirectory(id);
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const job: Job = {
    id,
    kind,
    status: 'running',
    progress: 0,
    message: 'Menyiapkan...',
    createdAt: now,
    updatedAt: now,
    dir
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(
  id: string,
  patch: Partial<Pick<Job, 'status' | 'progress' | 'message' | 'fileName' | 'filePath' | 'error' | 'child'>>
): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function completeJob(id: string, filePath: string, fileName: string): void {
  updateJob(id, {
    status: 'done',
    progress: 100,
    message: 'Selesai',
    filePath,
    fileName,
    error: undefined,
    child: undefined
  });
}

export function failJob(id: string, error: string): void {
  updateJob(id, {
    status: 'error',
    message: 'Gagal',
    error,
    child: undefined
  });
}

/** Hentikan proses beserta anak-anaknya (ffmpeg/yt-dlp di Windows). */
export function terminateJobProcess(child: ChildProcess | undefined): void {
  if (!child || child.killed || !child.pid) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5000
      });
      return;
    } catch {
      // jatuh ke child.kill di bawah
    }
  }
  try {
    child.kill('SIGKILL');
  } catch {
    // proses sudah berhenti
  }
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'done' || job.status === 'error') return false;
  terminateJobProcess(job.child);
  failJob(id, 'Dibatalkan oleh pengguna.');
  return true;
}

export function toPublicJob(job: Job): PublicJob {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: Math.round(job.progress),
    message: job.message,
    fileName: job.fileName,
    error: job.error,
    createdAt: job.createdAt
  };
}

export async function cleanupExpiredJobs(): Promise<void> {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (now - job.updatedAt < config.jobTtlMs) continue;
    if (job.status === 'running') terminateJobProcess(job.child);
    jobs.delete(job.id);
    await fsp.rm(job.dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Job hanya disimpan di memori, jadi direktori dari proses sebelumnya
 * tidak akan pernah dipakai lagi. Bersihkan saat startup agar disk tidak penuh.
 */
export async function cleanupOrphanedJobDirs(): Promise<number> {
  const root = path.join(config.dataDir, 'jobs');
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.join(root, entry.name);
    const result = await fsp
      .rm(target, { recursive: true, force: true })
      .then(() => true)
      .catch(() => false);
    if (result) removed += 1;
  }
  return removed;
}

export function startCleanupTimer(): NodeJS.Timeout {
  return setInterval(() => void cleanupExpiredJobs(), 10 * 60_000).unref();
}
