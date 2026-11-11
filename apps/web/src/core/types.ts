import type { LucideIcon } from 'lucide-react';
import type { Runtime } from '../lib/bridge';

export type ProgressFn = (percent: number, label?: string) => void;

export interface ResultFile {
  name: string;
  blob: Blob;
  note?: string;
}

export interface RunContext {
  serverUrl: string;
  serverOnline: boolean;
  runtime: Runtime;
  onProgress: ProgressFn;
  signal?: AbortSignal;
}

export type ToolGroup = 'pdf' | 'media';

export type OptionType = 'select' | 'text';

export interface ToolOption {
  key: string;
  label: string;
  type: OptionType;
  options?: Array<{ value: string; label: string }>;
  defaultValue: string;
  placeholder?: string;
  hint?: string;
}

export interface ToolDef {
  id: string;
  name: string;
  short: string;
  description: string;
  icon: LucideIcon;
  group: ToolGroup;
  accept: string;
  acceptLabel: string;
  multiple: boolean;
  badge: 'offline' | 'hybrid' | 'online' | 'beta';
  options: ToolOption[];
  run: (
    files: File[],
    values: Record<string, string>,
    ctx: RunContext
  ) => Promise<ResultFile[]>;
}

export interface HealthCapability {
  available: boolean;
  version?: string;
  path?: string;
}

export interface Health {
  ok: boolean;
  name?: string;
  version?: string;
  capabilities?: {
    libreoffice?: HealthCapability;
    ytDlp?: HealthCapability;
    ffmpeg?: HealthCapability;
  };
}

export interface MediaInspect {
  title: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  webpageUrl: string;
  extractor?: string;
  heights: number[];
  audioBitrates: number[];
  isLive?: boolean;
}

export type MediaMode = 'video' | 'audio';

export interface MediaDownloadRequest {
  url: string;
  mode: MediaMode;
  quality: number;
  container: 'mp4' | 'mp3';
}

export interface JobInfo {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  message?: string;
  fileName?: string;
  error?: string;
}
