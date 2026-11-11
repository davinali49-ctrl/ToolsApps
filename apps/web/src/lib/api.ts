import type { Health, JobInfo, MediaDownloadRequest, MediaInspect } from '../core/types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message || data.error || `Permintaan gagal (HTTP ${response.status}).`;
  } catch {
    return `Permintaan gagal (HTTP ${response.status}).`;
  }
}

async function request<T>(url: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const external = init?.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forwardAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new ApiError(await parseError(response), response.status);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (external?.aborted) throw new ApiError('Dibatalkan.', 499);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Server tidak merespons (timeout).', 408);
    }
    throw new ApiError('Tidak bisa menghubungi server. Periksa koneksi atau URL server.', 0);
  } finally {
    external?.removeEventListener('abort', forwardAbort);
    clearTimeout(timer);
  }
}

export function fetchHealth(baseUrl: string, timeoutMs = 3500): Promise<Health> {
  return request<Health>(`${normalizeBase(baseUrl)}/api/health`, undefined, timeoutMs);
}

export function inspectMedia(baseUrl: string, url: string): Promise<MediaInspect> {
  return request<MediaInspect>(
    `${normalizeBase(baseUrl)}/api/media/inspect`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    },
    60_000
  );
}

export function startMediaDownload(baseUrl: string, payload: MediaDownloadRequest): Promise<JobInfo> {
  return request<JobInfo>(`${normalizeBase(baseUrl)}/api/media/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function startOfficeConversion(
  baseUrl: string,
  file: File,
  target: 'pdf' = 'pdf'
): Promise<JobInfo> {
  const form = new FormData();
  form.append('file', file);
  form.append('target', target);
  return request<JobInfo>(
    `${normalizeBase(baseUrl)}/api/convert/office`,
    { method: 'POST', body: form },
    5 * 60_000
  );
}

export async function fetchJob(
  baseUrl: string,
  id: string,
  signal?: AbortSignal
): Promise<JobInfo> {
  return request<JobInfo>(`${normalizeBase(baseUrl)}/api/jobs/${encodeURIComponent(id)}`, {
    signal
  });
}

export function cancelJob(baseUrl: string, id: string): Promise<{ cancelled: boolean }> {
  return request<{ cancelled: boolean }>(
    `${normalizeBase(baseUrl)}/api/jobs/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' }
  );
}

export function jobFileUrl(baseUrl: string, id: string): string {
  return `${normalizeBase(baseUrl)}/api/jobs/${encodeURIComponent(id)}/file?download=1`;
}

export async function fetchJobFile(baseUrl: string, id: string): Promise<Blob> {
  const response = await fetch(jobFileUrl(baseUrl, id));
  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  return response.blob();
}

export interface WaitOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onUpdate?: (job: JobInfo) => void;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('Dibatalkan.', 499));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(new ApiError('Dibatalkan.', 499));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function waitForJob(
  baseUrl: string,
  id: string,
  options: WaitOptions = {}
): Promise<JobInfo> {
  const { intervalMs = 900, timeoutMs = 30 * 60_000, signal, onUpdate } = options;
  const started = Date.now();

  for (;;) {
    if (signal?.aborted) throw new ApiError('Dibatalkan.', 499);
    const job = await fetchJob(baseUrl, id, signal);
    onUpdate?.(job);
    if (job.status === 'done') return job;
    if (job.status === 'error') throw new ApiError(job.error || job.message || 'Pemrosesan gagal.');
    if (Date.now() - started > timeoutMs) {
      throw new ApiError('Pemrosesan melebihi batas waktu.');
    }
    await delay(intervalMs, signal);
  }
}
