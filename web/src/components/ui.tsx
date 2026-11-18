// Componente mici refolosite de pagini. Doar stil (Tailwind + utilitarele din index.css), fără logică.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ApiError, type Rarity } from '../api';

// ---- Iconițe: un singur set (contur 1.75px, colțuri rotunjite), desenate în SVG ----
const icons: Record<string, ReactNode> = {
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />,
  games: <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.2A3 3 0 0 0 5 18c1 0 2-.6 2.5-1.5L9 14h6l1.5 2.5c.5.9 1.5 1.5 2.5 1.5a3 3 0 0 0 3-3.2l-.7-6.2a4 4 0 0 0-4-3.6Z" />,
  user: <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />,
  friends: <path d="M16 21a6 6 0 0 0-12 0M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21a5 5 0 0 0-4-4.9M16 4.1a4 4 0 0 1 0 7.8" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7" />,
  arrowRight: <path d="M5 12h14M12 5l7 7-7 7" />,
  sync: <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5" />,
  download: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  flag: <path d="M4 22V4a1 1 0 0 1 .4-.8C5.2 2.5 6.6 2 8.5 2c3 0 4.5 2 7.5 2 1.3 0 2.5-.3 3.6-.8a.6.6 0 0 1 .9.6v10.4a1 1 0 0 1-.4.8c-1 .7-2.4 1-4.1 1-3 0-4.5-2-7.5-2-1.6 0-3 .4-4.5 1.2" />,
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3" />,
  link: <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />,
  lock: <path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" />,
};

export function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: keyof typeof icons | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icons[name]}
    </svg>
  );
}

// Titlul paginii: eticheta mică (eyebrow) + titlul mare cu serif + subtitlu. Acțiunile stau în dreapta.
export function PageTitle({ children, eyebrow, subtitle, actions }: {
  children: ReactNode; eyebrow?: ReactNode; subtitle?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="font-display text-[40px] leading-[0.98] font-extrabold tracking-[-0.035em] text-fg md:text-[60px]">{children}</h1>
        {subtitle && <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

// Titlul unei secțiuni din pagină: etichetă + (opțional) ceva în dreapta, ex. un număr.
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="eyebrow !text-fg/85">{children}</h2>
      {aside && <span className="num text-xs text-faint">{aside}</span>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel rounded-3xl p-5 ${className}`}>{children}</section>;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  const styles = {
    // Alb pe negru: o singură acțiune principală pe ecran iese în evidență fără să fie colorată.
    // Sticlă colorată în apus, text închis: o singură acțiune principală pe ecran.
    primary: 'sunset text-ink hover:brightness-110',
    secondary: 'border border-line-strong bg-raised text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] backdrop-blur-xl hover:bg-hover',
    ghost: 'text-muted hover:bg-raised hover:text-fg',
    danger: 'border border-danger/40 bg-danger/10 text-danger backdrop-blur-xl hover:bg-danger/20',
  }[variant];
  const sizes = { sm: 'min-h-9 px-3.5 text-[13px]', md: 'min-h-10 px-5 text-sm' }[size];
  return (
    <button
      className={`pressable inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 ${sizes} ${styles} ${className}`}
      {...props}
    />
  );
}

// Clasa comună câmpurilor de formular (input, select, textarea).
export const fieldClass =
  'w-full rounded-2xl border border-line bg-black/25 px-4 text-[15px] text-fg outline-none transition-colors placeholder:text-faint ' +
  'shadow-[inset_0_1px_3px_rgb(0_0_0/0.3)] backdrop-blur-xl hover:border-line-strong focus:border-sunset-pink/70 focus:bg-black/35 ' +
  'focus:shadow-[inset_0_1px_3px_rgb(0_0_0/0.3),0_0_0_4px_rgb(255_95_162/0.2)] focus-visible:outline-none';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} min-h-11 ${props.className ?? ''}`} />;
}

// <select> nativ (accesibil, merge pe mobil), cu săgeata desenată de noi.
export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${className}`}>
      <select {...props} className={`${fieldClass} min-h-11 cursor-pointer appearance-none pr-9`} />
      <Icon name="chevron" className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-faint" />
    </div>
  );
}

// Eticheta vizibilă a unui câmp (nu doar placeholder).
export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="flex items-baseline justify-between text-[13px] font-bold text-muted">
        {label}
        {hint && <span className="num text-xs font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

// Control segmentat: indicatorul alunecă sub opțiunea activă.
export function Segmented<T extends string>({ options, value, onChange, className = 'mb-6' }: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((option) => option.id === value));
  return (
    <div role="tablist" className={`relative grid rounded-full border border-line bg-black/20 p-1 backdrop-blur-xl ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span
        aria-hidden
        className="glass-pill absolute inset-y-1 left-1 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`relative min-h-9 cursor-pointer rounded-full text-[13px] font-bold transition-colors ${value === option.id ? 'text-fg' : 'text-muted hover:text-fg'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Încărcare: rânduri „schelet” în locul unui spinner (păstrează forma paginii, fără salt la afișare).
export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="panel h-14 animate-pulse rounded-2xl" style={{ animationDelay: `${index * 90}ms` }} />
      ))}
    </div>
  );
}

// Starea goală: un mesaj care spune ce urmează, nu doar „nimic”.
export function Empty({ icon = 'trophy', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="glass-pill mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-fg">
        <Icon name={icon} />
      </span>
      <p className="text-lg font-extrabold tracking-tight text-fg">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  );
}

// Afișează mesajul API-ului și, dacă există, constrângerea din baza de date care a respins operația.
export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Unknown error';
  const constraint = error instanceof ApiError ? error.constraint : undefined;
  return (
    <p role="alert" className="mb-4 flex items-start gap-2.5 rounded-2xl border border-danger/35 bg-[rgb(60_8_30/0.45)] px-4 py-3 text-sm text-[#ffc9cf] backdrop-blur-xl">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
      <span>
        {message}
        {constraint && <span className="num ml-1.5 text-xs text-danger/80">{constraint}</span>}
      </span>
    </p>
  );
}

// Raritatea: punct colorat + text (culoarea nu e singurul indiciu).
export const rarityStyles: Record<Rarity, { label: string; text: string; dot: string; ring: string }> = {
  ultra_rare: { label: 'Ultra rare', text: 'text-rarity-ultra', dot: 'bg-rarity-ultra', ring: 'ring-rarity-ultra/60' },
  very_rare: { label: 'Very rare', text: 'text-rarity-very', dot: 'bg-rarity-very', ring: 'ring-rarity-very/50' },
  rare: { label: 'Rare', text: 'text-rarity-rare', dot: 'bg-rarity-rare', ring: 'ring-rarity-rare/45' },
  common: { label: 'Common', text: 'text-rarity-common', dot: 'bg-rarity-common', ring: 'ring-white/10' },
};

export function RarityBadge({ rarity }: { rarity: Rarity | null }) {
  if (!rarity) return null;
  const { label, text, dot } = rarityStyles[rarity];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// Progres: linie subțire; devine aurie la 100% (jocul e „perfect”).
export function ProgressBar({ value, total }: { value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/30" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full origin-left rounded-full ${percent === 100 ? 'bg-gold shadow-[0_0_10px_rgb(255_212_121/0.8)]' : 'bg-gradient-to-r from-sunset-pink to-sunset-orange'}`}
          style={{ width: `${percent}%`, animation: 'fill 700ms var(--ease-out-soft) both' }}
        />
      </div>
      <span className={`num w-10 text-right text-xs ${percent === 100 ? 'text-gold' : 'text-muted'}`}>{percent}%</span>
    </div>
  );
}

const platformMeta: Record<string, { label: string; color: string }> = {
  steam: { label: 'Steam', color: '#66c0f4' },
  psn: { label: 'PlayStation', color: '#4c7dff' },
  xbox: { label: 'Xbox', color: '#52c46a' },
  epic: { label: 'Epic', color: '#d8d8dc' },
};

// Platforma: pătrățel în culoarea ei + codul în monospace.
export function PlatformBadge({ code, full = false }: { code: string; full?: boolean }) {
  const meta = platformMeta[code];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-black/25 px-2.5 py-0.5 text-[10.5px] font-bold tracking-[0.1em] text-fg/90 uppercase backdrop-blur-xl">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta?.color ?? '#ccc' }} />
      {full && meta ? meta.label : code}
    </span>
  );
}

// Avatarul: imaginea userului sau inițiala pe o suprafață neutră.
export function Avatar({ name, url, size = 40, className = '' }: { name: string; url?: string | null; size?: number; className?: string }) {
  return url ? (
    <img src={url} alt="" width={size} height={size} className={`shrink-0 rounded-full object-cover ring-1 ring-line-strong ${className}`} style={{ width: size, height: size }} />
  ) : (
    <span
      className={`sunset flex shrink-0 items-center justify-center rounded-full font-extrabold text-ink ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// Paginare simplă (Înapoi / pagina / Următoarea), folosită de listele cu LIMIT/OFFSET.
export function Pager({ page, hasNext, onChange }: { page: number; hasNext: boolean; onChange: (page: number) => void }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>
        <Icon name="arrowLeft" className="h-4 w-4" /> Previous
      </Button>
      <span className="num text-xs text-faint">page {page + 1}</span>
      <Button variant="ghost" size="sm" disabled={!hasNext} onClick={() => onChange(page + 1)}>
        Next <Icon name="arrowRight" className="h-4 w-4" />
      </Button>
    </div>
  );
}
