import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  shell
} from 'electron';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

const isDev = Boolean(process.env.TOOLSAPP_DEV_URL);
const devUrl = process.env.TOOLSAPP_DEV_URL || '';
const rendererRoot = path.resolve(__dirname, '..', 'renderer');
const APP_HOST = 'toolsapps';
const activeProcesses = new Set<ChildProcess>();
let mainWindow: BrowserWindow | null = null;

interface BinaryInfo {
  available: boolean;
  version?: string;
  path?: string;
}

interface Capabilities {
  soffice: BinaryInfo;
  ffmpeg: BinaryInfo;
  ytDlp: BinaryInfo;
  platform: string;
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

function where(command: string): string | null {
  if (path.isAbsolute(command) && fs.existsSync(command)) return command;
  try {
    const output = execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], {
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

function findBinary(name: 'soffice' | 'ffmpeg' | 'ytDlp'): string | null {
  const direct = where(name === 'ytDlp' ? 'yt-dlp' : name);
  if (direct) return direct;
  for (const candidate of WINDOWS_CANDIDATES[name] ?? []) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function versionOf(binaryPath: string): string | undefined {
  try {
    const output = execFileSync(binaryPath, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 6000
    });
    const line = output.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
    return line?.slice(0, 120);
  } catch {
    return undefined;
  }
}

let capabilityCache: Capabilities | null = null;

function detectCapabilities(force = false): Capabilities {
  if (!force && capabilityCache) return capabilityCache;
  const soffice = findBinary('soffice');
  const ffmpeg = findBinary('ffmpeg');
  const ytDlp = findBinary('ytDlp');
  capabilityCache = {
    soffice: {
      available: Boolean(soffice),
      path: soffice ?? undefined,
      version: soffice ? versionOf(soffice) : undefined
    },
    ffmpeg: {
      available: Boolean(ffmpeg),
      path: ffmpeg ?? undefined,
      version: ffmpeg ? versionOf(ffmpeg) : undefined
    },
    ytDlp: {
      available: Boolean(ytDlp),
      path: ytDlp ?? undefined,
      version: ytDlp ? versionOf(ytDlp) : undefined
    },
    platform: process.platform
  };
  return capabilityCache;
}

function killProcessTree(child: ChildProcess): void {
  if (child.pid && process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
      return;
    } catch {
      // jatuh ke kill biasa bila taskkill gagal
    }
  }
  child.kill('SIGKILL');
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    activeProcesses.add(child);
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      killProcessTree(child);
      finish(new Error('Proses melebihi batas waktu.'));
    }, timeoutMs);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      activeProcesses.delete(child);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stderr);
    }

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-6000);
    });
    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim().slice(-500) || `Proses keluar dengan kode ${code}.`));
    });
  });
}

function safeName(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^\w.\- ()\[\]]/g, '_')
    .replace(/[. ]+$/, '')
    .slice(0, 140);
  if (!base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(base)) return 'berkas';
  return base;
}

function bufferFrom(data: unknown): Buffer {
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error('Data berkas tidak valid.');
}

function fileNameFrom(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Nama berkas tidak valid.');
  }
  return safeName(name);
}

function isAppUrl(target: string): boolean {
  try {
    const url = new URL(target);
    return url.protocol === 'app:' && url.host === APP_HOST;
  } catch {
    return false;
  }
}

function sameOrigin(target: string, expected: string): boolean {
  try {
    return new URL(target).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

async function convertOffice(data: Uint8Array, fileName: string): Promise<ArrayBuffer> {
  const soffice = findBinary('soffice');
  if (!soffice) {
    throw new Error(
      'LibreOffice tidak ditemukan. Pasang LibreOffice dari libreoffice.org lalu coba lagi.'
    );
  }

  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'toolsapps-office-'));
  const profile = path.join(directory, '.profile');
  await fsp.mkdir(profile, { recursive: true });
  const input = path.join(directory, safeName(fileName));
  await fsp.writeFile(input, data);

  try {
    await runProcess(
      soffice,
      [
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        '--convert-to',
        'pdf',
        '--outdir',
        directory,
        input
      ],
      3 * 60_000
    );

    const entries = await fsp.readdir(directory);
    const expected = `${path.parse(input).name}.pdf`;
    const inputName = path.basename(input);
    const pdf =
      entries.find((entry) => entry === expected) ??
      entries.find((entry) => entry !== inputName && entry.toLowerCase().endsWith('.pdf'));
    if (!pdf) throw new Error('LibreOffice tidak menghasilkan PDF. Format mungkin tidak didukung.');

    const buffer = await fsp.readFile(path.join(directory, pdf));
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } finally {
    await fsp.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) {
      return new Response('Not found', { status: 404 });
    }

    let relative: string;
    try {
      relative = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (relative === '/' || relative === '') relative = '/index.html';

    const filePath = path.resolve(rendererRoot, `.${relative}`);
    const inside = path.relative(rendererRoot, filePath);
    if (inside.startsWith('..') || path.isAbsolute(inside)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      if (!fs.statSync(filePath).isFile()) {
        return new Response('Not found', { status: 404 });
      }
    } catch {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#080c19',
    autoHideMenuBar: true,
    title: 'ToolsApps',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? sameOrigin(url, devUrl) : isAppUrl(url);
    if (!allowed) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    }
  });

  if (isDev) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadURL(`app://${APP_HOST}/index.html`);
  }
}

ipcMain.handle('desktop:save-file', async (_event, data: unknown, fileName: unknown) => {
  const buffer = bufferFrom(data);
  const name = fileNameFrom(fileName);
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const options = {
    title: 'Simpan hasil',
    defaultPath: path.join(app.getPath('downloads'), name),
    buttonLabel: 'Simpan'
  };
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { saved: false };
  await fsp.writeFile(result.filePath, buffer);
  return { saved: true, path: result.filePath };
});

ipcMain.handle('desktop:open-path', async (_event, target: unknown) => {
  if (typeof target !== 'string' || !target) return;
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) return;
  await shell.openPath(resolved);
});

ipcMain.handle('desktop:capabilities', async () => detectCapabilities());

ipcMain.handle('desktop:convert-office', async (_event, data: unknown, fileName: unknown) =>
  convertOffice(bufferFrom(data), fileNameFrom(fileName))
);

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  if (process.platform === 'win32') {
    app.setAppUserModelId('id.toolsapps.desktop');
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerAppProtocol();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('will-quit', () => {
    for (const child of activeProcesses) killProcessTree(child);
    activeProcesses.clear();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
