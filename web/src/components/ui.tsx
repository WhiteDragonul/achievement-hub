// Componente mici refolosite de pagini. Doar stil (Tailwind), fără logică.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ApiError, type Rarity } from '../api';

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-4 ${className}`}>{children}</section>;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const styles = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
    secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700',
    danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25',
  }[variant];
  return (
    <button
      className={`min-h-10 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-indigo-400 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-indigo-400 ${props.className ?? ''}`}
    />
  );
}

export function Loading() {
  return <p className="py-8 text-center text-sm text-slate-400">Se încarcă…</p>;
}

// Afișează mesajul API-ului și, dacă există, constrângerea din baza de date care a respins operația.
export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Eroare necunoscută';
  const constraint = error instanceof ApiError ? error.constraint : undefined;
  return (
    <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
      {constraint && <span className="ml-1 font-mono text-xs text-red-400">({constraint})</span>}
    </p>
  );
}

const rarityStyles: Record<Rarity, { label: string; className: string }> = {
  ultra_rare: { label: 'Ultra rar', className: 'bg-rarity-ultra/15 text-rarity-ultra' },
  very_rare: { label: 'Foarte rar', className: 'bg-rarity-very/15 text-rarity-very' },
  rare: { label: 'Rar', className: 'bg-rarity-rare/15 text-rarity-rare' },
  common: { label: 'Comun', className: 'bg-rarity-common/15 text-rarity-common' },
};

export function RarityBadge({ rarity }: { rarity: Rarity | null }) {
  if (!rarity) return null;
  const { label, className } = rarityStyles[rarity];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-indigo-400" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-slate-400">{percent}%</span>
    </div>
  );
}

const platformColors: Record<string, string> = {
  steam: 'bg-sky-500/15 text-sky-300',
  psn: 'bg-blue-500/15 text-blue-300',
  xbox: 'bg-green-500/15 text-green-300',
  epic: 'bg-slate-500/20 text-slate-200',
};

export function PlatformBadge({ code }: { code: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${platformColors[code] ?? 'bg-slate-800'}`}>
      {code}
    </span>
  );
}
