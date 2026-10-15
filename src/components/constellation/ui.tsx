'use client';

import clsx from 'clsx';
import { KIND_COLOR, KIND_LABEL, type EntityKind } from '@/lib/constellation/types';

export const cn = clsx;

export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'default' && 'border border-border bg-card hover:bg-accent',
        variant === 'ghost' && 'hover:bg-accent text-muted-foreground hover:text-foreground',
        variant === 'danger' && 'text-destructive hover:bg-destructive/10',
        className,
      )}
    />
  );
}

export function Badge({ children, className, style, title }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; title?: string }) {
  return (
    <span title={title} style={style} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', className)}>
      {children}
    </span>
  );
}

export function KindBadge({ kind }: { kind: EntityKind }) {
  const c = KIND_COLOR[kind];
  return (
    <Badge style={{ color: c, borderColor: `color-mix(in srgb, ${c} 35%, transparent)`, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>
      {KIND_LABEL[kind]}
    </Badge>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: color }} />;
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function host(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
