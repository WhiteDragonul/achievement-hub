// Scheletul aplicației, mobile-first:
//  - pe telefon: bară de sus cu titlul + bară de tab-uri jos (navigarea la îndemâna degetului mare);
//  - de la lățimea `md` (768px) în sus: sidebar fix în stânga, fără tab-uri jos.
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type User } from '../api';
import { useCurrentUser } from '../current-user';

const icons: Record<string, ReactNode> = {
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />,
  games: <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.2A3 3 0 0 0 5 18c1 0 2-.6 2.5-1.5L9 14h6l1.5 2.5c.5.9 1.5 1.5 2.5 1.5a3 3 0 0 0 3-3.2l-.7-6.2a4 4 0 0 0-4-3.6Z" />,
  user: <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />,
  friends: <path d="M16 21a6 6 0 0 0-12 0M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21a5 5 0 0 0-4-4.9M16 4.1a4 4 0 0 1 0 7.8" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

function useNavItems() {
  const { userId } = useCurrentUser();
  return [
    { to: '/', label: 'Clasament', icon: 'trophy' },
    { to: '/games', label: 'Jocuri', icon: 'games' },
    { to: `/users/${userId}`, label: 'Profil', icon: 'user' },
    { to: '/friends', label: 'Prieteni', icon: 'friends' },
    { to: '/admin', label: 'Admin', icon: 'shield' },
  ];
}

// Selectorul temporar de user (până la autentificarea din etapa 3).
function CurrentUserPicker() {
  const { userId, setUserId } = useCurrentUser();
  const [draft, setDraft] = useState(String(userId));
  const { data: user } = useQuery({ queryKey: ['user', userId], queryFn: () => api<User>(`/users/${userId}`) });

  return (
    <form
      className="flex items-center gap-2 text-xs text-slate-400"
      onSubmit={(event) => {
        event.preventDefault();
        if (Number(draft) > 0) setUserId(Number(draft));
      }}
    >
      <span className="hidden sm:inline">Acționezi ca</span>
      <span className="font-semibold text-slate-200">{user?.username ?? '…'}</span>
      <input
        aria-label="Id utilizator"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        inputMode="numeric"
      />
    </form>
  );
}

export function Layout() {
  const navItems = useNavItems();

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar — doar pe ecrane late */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950 p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2 text-lg font-bold">
          <span className="text-rarity-ultra"><Icon name="trophy" /></span> Achievement Hub
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                }`}
            >
              <Icon name={item.icon} /> {item.label}
            </NavLink>
          ))}
        </nav>
        <CurrentUserPicker />
      </aside>

      {/* Bara de sus — doar pe telefon */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur md:hidden">
        <span className="font-bold">Achievement Hub</span>
        <CurrentUserPicker />
      </header>

      {/* pb-24 pe telefon: conținutul nu ajunge sub bara de tab-uri */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-24 md:px-8 md:pt-8 md:pb-8">
        <Outlet />
      </main>

      {/* Tab-uri jos — doar pe telefon; pb-[env(safe-area-inset-bottom)] = spațiu pentru bara de gesturi iOS/Android */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${isActive ? 'text-indigo-300' : 'text-slate-500'}`}
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
