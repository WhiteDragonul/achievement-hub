// Componente mici refolosite de pagini. Doar stil (Tailwind + utilitarele Liquid Glass din index.css), fără logică.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ApiError, type Rarity } from '../api';

export function PageTitle({ children, subtitle, actions }: { children: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{children}</h1>
        {subtitle && <p className="mt-1 text-sm text-white/55">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-[26px] p-5 ${className}`}>{children}</section>;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const styles = {
    primary: 'glass-tint text-white hover:brightness-110',
    secondary: 'glass text-white/90 hover:bg-white/15',
    danger: 'border border-red-300/25 bg-red-500/15 text-red-200 shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] hover:bg-red-500/25',
  }[variant];
  return (
    <button
      className={`pressable min-h-10 rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`glass-field min-h-11 w-full rounded-2xl px-4 text-sm text-white outline-none placeholder:text-white/35 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`glass-field min-h-11 rounded-2xl px-4 text-sm text-white outline-none ${props.className ?? ''}`}
    />
  );
}

// Control segmentat (ca în iOS): bula activă alunecă între opțiuni.
export function Segmented<T extends string>({ options, value, onChange }: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const index = Math.max(0, options.findIndex((option) => option.id === value));
  return (
    <div className="glass relative mb-5 grid rounded-full p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span
        aria-hidden
        className="glass-pill absolute inset-y-1 left-1 rounded-full transition-transform duration-500 ease-[var(--ease-spring)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`relative min-h-10 rounded-full text-sm font-semibold transition-colors ${value === option.id ? 'text-white' : 'text-white/55 hover:text-white/80'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-10" role="status" aria-label="Se încarcă">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-white/80" />
    </div>
  );
}

// Afișează mesajul API-ului și, dacă există, constrângerea din baza de date care a respins operația.
export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Eroare necunoscută';
  const constraint = error instanceof ApiError ? error.constraint : undefined;
  return (
    <p className="mb-4 rounded-2xl border border-red-300/20 bg-red-500/12 px-4 py-3 text-sm text-red-200 backdrop-blur-xl">
      {message}
      {constraint && <span className="ml-1 font-mono text-xs text-red-300/80">({constraint})</span>}
    </p>
  );
}

const rarityStyles: Record<Rarity, { label: string; className: string }> = {
  ultra_rare: { label: 'Ultra rar', className: 'bg-rarity-ultra/15 text-rarity-ultra border-rarity-ultra/30' },
  very_rare: { label: 'Foarte rar', className: 'bg-rarity-very/15 text-rarity-very border-rarity-very/30' },
  rare: { label: 'Rar', className: 'bg-rarity-rare/15 text-rarity-rare border-rarity-rare/30' },
  common: { label: 'Comun', className: 'bg-rarity-common/12 text-rarity-common border-rarity-common/25' },
};

export function RarityBadge({ rarity }: { rarity: Rarity | null }) {
  if (!rarity) return null;
  const { label, className } = rarityStyles[rarity];
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold backdrop-blur ${className}`}>{label}</span>;
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="glass-field h-2.5 flex-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-fuchsia-400 shadow-[0_0_12px_rgb(129_140_248/0.6)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-medium tabular-nums text-white/60">{percent}%</span>
    </div>
  );
}

const platformColors: Record<string, string> = {
  steam: 'bg-sky-400/15 text-sky-200 border-sky-300/25',
  psn: 'bg-blue-500/20 text-blue-200 border-blue-300/25',
  xbox: 'bg-emerald-500/15 text-emerald-200 border-emerald-300/25',
  epic: 'bg-white/10 text-white/80 border-white/20',
};

export function PlatformBadge({ code }: { code: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${platformColors[code] ?? 'border-white/15 bg-white/10'}`}>
      {code}
    </span>
  );
}

// Avatarul: imaginea userului sau inițiala pe un gradient.
export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full border border-white/25 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-white/25 bg-gradient-to-br from-indigo-400/70 to-fuchsia-500/70 font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.4)]"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
