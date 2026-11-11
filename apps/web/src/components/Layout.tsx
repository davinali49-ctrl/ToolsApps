import { useState, type ReactNode } from 'react';
import {
  Boxes,
  Download,
  FileStack,
  House,
  Menu,
  Server,
  Settings,
  ShieldCheck,
  X
} from 'lucide-react';
import { TOOLS } from '../core/registry';
import { useAppStore } from '../lib/store';
import { runtime, runtimeLabel } from '../lib/bridge';
import { cn } from '../lib/utils';

interface LayoutProps {
  page: string;
  onNavigate: (page: string) => void;
  children: ReactNode;
}

function ServerStatus({ onClick }: { onClick: () => void }) {
  const status = useAppStore((state) => state.serverStatus);
  const serverUrl = useAppStore((state) => state.serverUrl);
  const info = {
    online: { dot: 'bg-emerald-400', text: 'Server online', tone: 'text-slate-300' },
    offline: { dot: 'bg-rose-400', text: 'Server offline', tone: 'text-slate-300' },
    checking: { dot: 'bg-amber-400', text: 'Memeriksa server', tone: 'text-slate-300' },
    unknown: { dot: 'bg-slate-500', text: 'Server belum dicek', tone: 'text-slate-400' }
  }[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.06] px-2.5 py-2 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.03]"
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', info.dot)} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[11px] font-medium', info.tone)}>{info.text}</span>
        <span className="block truncate text-[10px] text-slate-600">
          {serverUrl.replace(/^https?:\/\//, '')}
        </span>
      </span>
      <Server className="h-3.5 w-3.5 shrink-0 text-slate-600" />
    </button>
  );
}

export function Layout({ page, onNavigate, children }: LayoutProps) {
  const [open, setOpen] = useState(false);
  const pdfTools = TOOLS.filter((tool) => tool.group === 'pdf');

  function navigate(target: string) {
    setOpen(false);
    onNavigate(target);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => navigate('home')}
        className="flex items-center gap-3 px-4 py-5 text-left"
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
          <Boxes className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-semibold tracking-tight text-white">ToolsApps</span>
          <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-600">
            Berkas & media
          </span>
        </span>
      </button>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 no-scrollbar">
        <div className="space-y-0.5">
          {[
            { key: 'home', label: 'Beranda', icon: House },
            { key: 'media', label: 'Unduh Media', icon: Download, online: true }
          ].map((item) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.key)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
                  active
                    ? 'bg-white/[0.06] font-medium text-white'
                    : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-brand-300' : 'text-slate-600')} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.online ? (
                  <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                    Online
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div>
          <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">
            Berkas & PDF
          </p>
          <div className="space-y-0.5">
            {pdfTools.map((tool) => {
              const Icon = tool.icon;
              const active = page === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(tool.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
                    active
                      ? 'bg-white/[0.06] font-medium text-white'
                      : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                  )}
                >
                  <Icon className={cn('h-4 w-4', active ? 'text-brand-300' : 'text-slate-600')} />
                  <span className="truncate">{tool.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-0.5">
          <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">
            Lainnya
          </p>
          <button
            type="button"
            aria-current={page === 'settings' ? 'page' : undefined}
            onClick={() => navigate('settings')}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
              page === 'settings'
                ? 'bg-white/[0.06] font-medium text-white'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
            )}
          >
            <Settings
              className={cn('h-4 w-4', page === 'settings' ? 'text-brand-300' : 'text-slate-600')}
            />
            Pengaturan
          </button>
        </div>
      </nav>

      <div className="space-y-2 border-t border-white/[0.06] p-3">
        <ServerStatus onClick={() => navigate('settings')} />
        <div className="flex items-center justify-between px-1 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-slate-600" />
            Offline-first
          </span>
          <span>{runtimeLabel[runtime]}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-white/[0.06] bg-ink-950 lg:block">
        {sidebar}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-white/[0.08] bg-ink-950">
            <button
              type="button"
              aria-label="Tutup"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-2 text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[264px]">
        <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-ink-950/95 px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            aria-label="Buka menu"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => navigate('home')} className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-white">
              <Boxes className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold text-white">ToolsApps</span>
          </button>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">
            v0.1
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-20 sm:px-6 lg:px-8 lg:pb-16 lg:pt-10">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink-950/95 px-2 pb-[calc(0.4rem+var(--safe-bottom))] pt-1.5 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-md items-center justify-around">
            {[
              { key: 'home', label: 'Beranda', icon: House },
              { key: 'media', label: 'Media', icon: Download },
              { key: 'settings', label: 'Setelan', icon: Settings }
            ].map((item) => {
              const Icon = item.icon;
              const active = page === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(item.key)}
                  className={cn(
                    'flex min-w-[72px] flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors',
                    active ? 'text-brand-300' : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex min-w-[72px] flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-300"
            >
              <FileStack className="h-5 w-5" />
              Alat
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
