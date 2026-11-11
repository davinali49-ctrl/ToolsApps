import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ToolDef } from '../core/types';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />;
}

export function ProgressBar({
  percent,
  label
}: {
  percent: number;
  label?: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="truncate text-slate-400">{label || 'Memproses...'}</span>
        <span className="shrink-0 font-medium tabular-nums text-slate-300">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

const badgeStyles: Record<ToolDef['badge'], { label: string; className: string }> = {
  offline: { label: 'Offline', className: 'border-emerald-400/20 text-emerald-300/90' },
  hybrid: { label: 'Server / desktop', className: 'border-amber-400/20 text-amber-300/90' },
  online: { label: 'Online', className: 'border-brand-400/25 text-brand-300' },
  beta: { label: 'Beta', className: 'border-white/[0.1] text-slate-500' }
};

export function ToolBadge({ badge }: { badge: ToolDef['badge'] }) {
  const style = badgeStyles[badge];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
        style.className
      )}
    >
      {style.label}
    </span>
  );
}

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Alert({
  tone = 'error',
  title,
  children
}: {
  tone?: 'error' | 'warning' | 'info';
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    error: 'border-rose-400/20 bg-rose-400/[0.05] text-rose-200',
    warning: 'border-amber-400/20 bg-amber-400/[0.05] text-amber-100',
    info: 'border-brand-400/20 bg-brand-500/[0.06] text-brand-200'
  } as const;
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm leading-relaxed', styles[tone])}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="whitespace-pre-line text-[13px] opacity-90">{children}</div>
    </div>
  );
}
