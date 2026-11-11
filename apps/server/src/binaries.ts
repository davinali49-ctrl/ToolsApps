import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from './config';

const execFileAsync = promisify(execFile);

export interface BinaryInfo {
  available: boolean;
  path?: string;
  version?: string;
}

export interface Capabilities {
  libreoffice: BinaryInfo;
  ytDlp: BinaryInfo;
  ffmpeg: BinaryInfo;
}

const WINDOWS_CANDIDATES: Record<string, string[]> = {
  soffice: [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
  ],
  ffmpeg: [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe')
  ],
  ytDlp: [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'yt-dlp', 'yt-dlp.exe'),
    path.join(process.env.USERPROFILE || '', 'yt-dlp.exe'),
    'C:\\yt-dlp\\yt-dlp.exe'
  ]
};

function lookupOnPath(command: string): string | null {
  if (path.isAbsolute(command) && fs.existsSync(command)) return command;
  try {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    const output = execFileSync(locator, [command], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000
    });
    const first = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return first && fs.existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

function resolveBinary(name: 'soffice' | 'ffmpeg' | 'ytDlp', override: string): string | null {
  if (override) {
    const resolved = lookupOnPath(override);
    if (resolved) return resolved;
  }
  const direct = lookupOnPath(name === 'ytDlp' ? 'yt-dlp' : name);
  if (direct) return direct;

  for (const candidate of WINDOWS_CANDIDATES[name] ?? []) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export const binaries = {
  soffice: resolveBinary('soffice', config.sofficePath),
  ytDlp: resolveBinary('ytDlp', config.ytDlpPath),
  ffmpeg: resolveBinary('ffmpeg', config.ffmpegPath)
};

async function readVersion(binaryPath: string): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['--version'], {
      timeout: 6000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    });
    const line = `${stdout || ''}\n${stderr || ''}`
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find(Boolean);
    return line ? line.slice(0, 120) : undefined;
  } catch {
    return undefined;
  }
}

let cache: { at: number; value: Capabilities } | null = null;

export async function getCapabilities(force = false): Promise<Capabilities> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.value;

  const [libreofficeVersion, ytDlpVersion, ffmpegVersion] = await Promise.all([
    binaries.soffice ? readVersion(binaries.soffice) : Promise.resolve(undefined),
    binaries.ytDlp ? readVersion(binaries.ytDlp) : Promise.resolve(undefined),
    binaries.ffmpeg ? readVersion(binaries.ffmpeg) : Promise.resolve(undefined)
  ]);

  const value: Capabilities = {
    libreoffice: {
      available: Boolean(binaries.soffice),
      path: binaries.soffice ?? undefined,
      version: libreofficeVersion
    },
    ytDlp: {
      available: Boolean(binaries.ytDlp),
      path: binaries.ytDlp ?? undefined,
      version: ytDlpVersion
    },
    ffmpeg: {
      available: Boolean(binaries.ffmpeg),
      path: binaries.ffmpeg ?? undefined,
      version: ffmpegVersion
    }
  };

  cache = { at: Date.now(), value };
  return value;
}
