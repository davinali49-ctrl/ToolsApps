import { Capacitor } from '@capacitor/core';

export type Runtime = 'web' | 'desktop' | 'android';

interface DesktopCapability {
  available: boolean;
  version?: string;
  path?: string;
}

export interface DesktopCapabilities {
  soffice: DesktopCapability;
  ffmpeg: DesktopCapability;
  ytDlp: DesktopCapability;
  platform: string;
}

export interface ToolsBridge {
  runtime: Runtime;
  saveFile(data: ArrayBuffer, fileName: string): Promise<{ saved: boolean; path?: string }>;
  openPath(path: string): Promise<void>;
  capabilities(): Promise<DesktopCapabilities>;
  convertOffice?(data: ArrayBuffer, fileName: string): Promise<ArrayBuffer>;
}

declare global {
  interface Window {
    toolsBridge?: ToolsBridge;
  }
}

export const runtime: Runtime = (() => {
  if (typeof window !== 'undefined' && window.toolsBridge) return window.toolsBridge.runtime;
  if (Capacitor.isNativePlatform()) return 'android';
  return 'web';
})();

export const isDesktop = runtime === 'desktop';
export const isAndroid = runtime === 'android';

export const runtimeLabel: Record<Runtime, string> = {
  web: 'Web / PWA',
  desktop: 'Desktop',
  android: 'Android'
};

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Gagal membaca berkas.'));
    reader.readAsDataURL(blob);
  });
}

function browserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Simpan hasil konversi sesuai platform: dialog desktop, Downloads Android, atau unduhan browser. */
export async function saveBlob(blob: Blob, fileName: string): Promise<string | undefined> {
  if (isDesktop && window.toolsBridge) {
    try {
      const result = await window.toolsBridge.saveFile(await blobToArrayBuffer(blob), fileName);
      if (result.saved) return result.path;
    } catch {
      // jatuh ke unduhan browser bila dialog gagal
    }
  }

  if (isAndroid) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const base64 = await blobToBase64(blob);
      const written = await Filesystem.writeFile({
        path: `ToolsApps/${fileName}`,
        data: base64,
        directory: Directory.Documents,
        recursive: true
      });
      if (Capacitor.getPlatform() === 'android') {
        await Share.share({ title: fileName, url: written.uri }).catch(() => undefined);
      }
      return written.uri;
    } catch {
      // jatuh ke unduhan browser
    }
  }

  browserDownload(blob, fileName);
  return undefined;
}

export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function getDesktopCapabilities(): Promise<DesktopCapabilities | null> {
  if (!isDesktop || !window.toolsBridge) return null;
  try {
    return await window.toolsBridge.capabilities();
  } catch {
    return null;
  }
}

export async function convertOfficeLocal(
  file: File,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  if (!isDesktop || !window.toolsBridge?.convertOffice) {
    throw new Error('Konversi Office lokal hanya tersedia di aplikasi desktop.');
  }
  onProgress?.(15);
  const buffer = await file.arrayBuffer();
  onProgress?.(35);
  const result = await window.toolsBridge.convertOffice(buffer, file.name);
  onProgress?.(95);
  return new Blob([result], { type: 'application/pdf' });
}
