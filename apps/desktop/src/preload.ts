import { contextBridge, ipcRenderer } from 'electron';

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

const bridge = {
  runtime: 'desktop' as const,
  saveFile: (data: ArrayBuffer, fileName: string) =>
    ipcRenderer.invoke('desktop:save-file', data, fileName) as Promise<{
      saved: boolean;
      path?: string;
    }>,
  openPath: (target: string) =>
    ipcRenderer.invoke('desktop:open-path', target) as Promise<void>,
  capabilities: () => ipcRenderer.invoke('desktop:capabilities') as Promise<Capabilities>,
  convertOffice: (data: ArrayBuffer, fileName: string) =>
    ipcRenderer.invoke('desktop:convert-office', data, fileName) as Promise<ArrayBuffer>
};

contextBridge.exposeInMainWorld('toolsBridge', bridge);
