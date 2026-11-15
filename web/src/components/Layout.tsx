// Scheletul aplicației, mobile-first, în stil Liquid Glass:
//  - pe telefon: bară de sus + bară de tab-uri plutitoare jos (la îndemâna degetului mare);
//  - de la `md` (768px): sidebar plutitor în stânga.
// Elementul activ e marcat de o „bulă” de sticlă care alunecă la noua poziție (transform + curbă cu arc).
// Fără user logat, Layout-ul trimite la /login: toate paginile din interior sunt protejate.
import type { ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth, useCurrentUser } from '../auth';
import { Avatar, Loading } from './ui';

const icons: Record<string, ReactNode> = {
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />,
  games: <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.2A3 3 0 0 0 5 18c1 0 2-.6 2.5-1.5L9 14h6l1.5 2.5c.5.9 1.5 1.5 2.5 1.5a3 3 0 0 0 3-3.2l-.7-6.2a4 4 0 0 0-4-3.6Z" />,
  user: <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />,
  friends: <path d="M16 21a6 6 0 0 0-12 0M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21a5 5 0 0 0-4-4.9M16 4.1a4 4 0 0 1 0 7.8" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

function useNavItems() {
  const { userId, isModerator } = useCurrentUser();
  const items = [
    { to: '/', label: 'Clasament', icon: 'trophy' },
    { to: '/games', label: 'Jocuri', icon: 'games' },
    { to: `/users/${userId}`, label: 'Profil', icon: 'user' },
    { to: '/friends', label: 'Prieteni', icon: 'friends' },
  ];
  // Pagina Admin apare doar pentru moderatori și admini (API-ul verifică oricum rolul la fiecare cerere).
  if (isModerator) items.push({ to: '/admin', label: 'Admin', icon: 'shield' });
  return items;
}

// Indexul tab-ului activ, după URL (pentru poziția bulei).
function useActiveIndex(items: { to: string }[]) {
  const { pathname } = useLocation();
  // /games/12 ține de „Jocuri”; /users/30 (profilul altcuiva) nu e „Profil” pentru userul 3.
  return items.findIndex((item) =>
    item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`));
}

const roleLabels = { user: 'Jucător', moderator: 'Moderator', admin: 'Administrator' };

function UserChip({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const name = user.display_name ?? user.username;
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} url={user.avatar_url} size={compact ? 34 : 40} />
      {!compact && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-white/50">{roleLabels[user.role]}</p>
        </div>
      )}
      <button onClick={logout} title="Deconectare" aria-label="Deconectare" className="pressable glass flex h-9 w-9 items-center justify-center rounded-full text-white/75 hover:text-white">
        <Icon name="logout" className="h-4 w-4" />
      </button>
    </div>
  );
}

function Shell() {
  const navItems = useNavItems();
  const active = useActiveIndex(navItems);

  return (
    <div className="min-h-dvh md:flex md:gap-6 md:p-5">
      {/* Sidebar — doar pe ecrane late */}
      <aside className="glass-bar sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-64 shrink-0 flex-col rounded-[32px] p-4 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2 pt-2">
          <span className="glass-tint flex h-10 w-10 items-center justify-center rounded-2xl"><Icon name="trophy" /></span>
          <span className="text-lg font-bold tracking-tight">Achievement Hub</span>
        </div>
        <nav className="relative flex flex-col">
          {active >= 0 && (
            <span
              aria-hidden
              className="glass-pill absolute inset-x-0 top-0 h-12 rounded-2xl transition-transform duration-500 ease-[var(--ease-spring)]"
              style={{ transform: `translateY(${active * 3.25}rem)` }}
            />
          )}
          {navItems.map((item, index) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              className={`relative mb-1 flex h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition-colors ${
                index === active ? 'text-white' : 'text-white/55 hover:text-white/85'}`}
            >
              <Icon name={item.icon} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-3">
          <UserChip />
        </div>
      </aside>

      {/* Bara de sus — doar pe telefon; pt-[env(safe-area-inset-top)] = sub notch / Dynamic Island */}
      <header className="sticky top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
        <div className="glass-bar flex items-center justify-between rounded-full py-2 pr-2 pl-5">
          <span className="font-bold tracking-tight">Achievement Hub</span>
          <UserChip compact />
        </div>
      </header>

      {/* pb-32 pe telefon: conținutul nu ajunge sub bara de tab-uri plutitoare */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-32 md:px-2 md:pt-6 md:pb-8">
        <Outlet />
      </main>

      {/* Tab-uri jos — doar pe telefon; plutesc deasupra zonei de gesturi iOS / Android */}
      <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 md:hidden">
        <div className="glass-bar relative grid rounded-full p-1.5" style={{ gridTemplateColumns: `repeat(${navItems.length}, 1fr)` }}>
          {active >= 0 && (
            <span
              aria-hidden
              className="glass-pill absolute inset-y-1.5 left-1.5 rounded-full transition-transform duration-500 ease-[var(--ease-spring)]"
              style={{ width: `calc((100% - 0.75rem) / ${navItems.length})`, transform: `translateX(${active * 100}%)` }}
            />
          )}
          {navItems.map((item, index) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              className={`pressable relative flex flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-semibold ${
                index === active ? 'text-white' : 'text-white/50'}`}
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Layout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-dvh items-center justify-center"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell />;
}

// Fundalul animat, comun tuturor paginilor (inclusiv login).
export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span /><span /><span /><span />
    </div>
  );
}
