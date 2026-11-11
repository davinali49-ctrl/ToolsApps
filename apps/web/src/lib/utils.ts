import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function baseName(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'berkas';
}

/** Terima "localhost:8787" maupun URL lengkap, lalu buang garis miring di akhir. */
export function normalizeServerUrl(value: string, fallback = 'http://localhost:8787'): string {
  let clean = value.trim();
  if (!clean) return fallback;
  if (!/^https?:\/\//i.test(clean)) clean = `http://${clean}`;
  return clean.replace(/\/+$/, '');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
