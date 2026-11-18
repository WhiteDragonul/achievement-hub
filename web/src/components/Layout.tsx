// Scheletul aplicației, mobile-first, în stil liquid glass:
//  - pe telefon: bară de sus + bară de tab-uri plutitoare jos (la îndemâna degetului mare), cu safe-area;
//  - de la `md` (768px): sidebar de sticlă plutitor în stânga.
// Elementul activ e marcat de un indicator care alunecă la noua poziție (transform).
// Fără user logat, Layout-ul trimite la /login: toate paginile din interior sunt protejate.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth, useCurrentUser } from '../auth';
import { Avatar, Icon, Loading } from './ui';
import logoUrl from '../assets/logo.png';

function useNavItems() {
  const { userId, isModerator } = useCurrentUser();
  const items = [
    { to: '/', label: 'Leaderboard', icon: 'trophy' },
    { to: '/games', label: 'Games', icon: 'games' },
    { to: `/users/${userId}`, label: 'Profile', icon: 'user' },
    { to: '/friends', label: 'Friends', icon: 'friends' },
  ];
  // Pagina Admin apare doar pentru moderatori și admini (API-ul verifică oricum rolul la fiecare cerere).
  if (isModerator) items.push({ to: '/admin', label: 'Admin', icon: 'shield' });
  return items;
}

// Indexul tab-ului activ, după URL (pentru poziția indicatorului).
function useActiveIndex(items: { to: string }[]) {
  const { pathname } = useLocation();
  // /games/12 ține de „Jocuri”; /users/30 (profilul altcuiva) nu e „Profil” pentru userul 3.
  return items.findIndex((item) =>
    item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`));
}

const roleLabels = { user: 'Player', moderator: 'Moderator', admin: 'Administrator' };

// Semnul aplicației: cupa cu coroana în spate (imaginea din assets/logo.png).
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      alt="Achievement Hub"
      width={size}
      height={size}
      className="shrink-0 rounded-[24%] shadow-[0_4px_14px_rgb(0_0_0/0.35)]"
    />
  );
}

// Text pe un singur rând: dacă nu încape, se derulează încet stânga-dreapta în loc să fie tăiat cu „…”.
function ScrollingText({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLParagraphElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) setShift(Math.max(0, el.scrollWidth - el.clientWidth));
  }, [text]);
  return (
    <p ref={box} title={text} className={`overflow-hidden whitespace-nowrap ${className ?? ''}`}>
      <span className={`inline-block ${shift > 0 ? 'marquee' : ''}`} style={{ '--shift': `-${shift}px` } as CSSProperties}>
        {text}
      </span>
    </p>
  );
}

function SettingsButton() {
  return (
    <NavLink
      to="/settings"
      title="Settings"
      aria-label="Settings"
      className={({ isActive }) => `pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-raised hover:text-fg ${isActive ? 'bg-raised text-fg' : 'text-muted'}`}
    >
      <Icon name="settings" className="h-4 w-4" />
    </NavLink>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button
      onClick={logout}
      title="Sign out"
      aria-label="Sign out"
      className="pressable flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-raised hover:text-fg"
    >
      <Icon name="logout" className="h-4 w-4" />
    </button>
  );
}

function Shell() {
  const { user } = useAuth();
  const navItems = useNavItems();
  const active = useActiveIndex(navItems);
  const { pathname } = useLocation();
  const name = user ? user.display_name ?? user.username : '';

  return (
    <div className="min-h-dvh md:flex md:gap-2 md:p-4">
      {/* Sidebar de sticlă, plutitor: doar pe ecrane late */}
      <aside className="glass-bar sticky top-4 hidden h-[calc(100dvh-2rem)] w-64 shrink-0 flex-col rounded-[28px] px-3 py-5 md:flex">
        <div className="mb-10 flex items-center gap-2.5 px-2.5">
          <Logo size={28} />
          <span className="text-[15px] font-extrabold tracking-tight">Achievement Hub</span>
        </div>

        <p className="eyebrow mb-2 px-4">Menu</p>
        <nav className="relative flex flex-col gap-0.5">
          {active >= 0 && (
            <span
              aria-hidden
              className="glass-pill absolute inset-x-0 top-0 h-10 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
              style={{ transform: `translateY(calc(${active} * (2.5rem + 2px)))` }}
            />
          )}
          {navItems.map((item, index) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              className={`relative flex h-10 items-center gap-3 rounded-full px-4 text-sm font-bold transition-colors ${
                index === active ? 'text-fg' : 'text-muted hover:text-fg'}`}
            >
              <Icon name={item.icon} /> {item.label}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="mt-auto flex items-center gap-2 rounded-[20px] border border-line bg-raised p-2 pl-2.5">
            <Avatar name={name} url={user.avatar_url} size={34} />
            <div className="min-w-0 flex-1">
              <ScrollingText text={name} className="text-sm font-bold" />
              <p className="eyebrow !text-[10px]">{roleLabels[user.role]}</p>
            </div>
            <SettingsButton />
            <LogoutButton />
          </div>
        )}
      </aside>

      {/* Bara de sus: doar pe telefon; pt-[env(safe-area-inset-top)] = sub notch / Dynamic Island */}
      <header className="sticky top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
        <div className="glass-bar flex h-14 items-center justify-between rounded-full pr-1.5 pl-2.5">
          <span className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="text-[15px] font-extrabold tracking-tight">Achievement Hub</span>
          </span>
          <span className="flex items-center gap-1">
            {user && <Avatar name={name} url={user.avatar_url} size={28} />}
            <SettingsButton />
            <LogoutButton />
          </span>
        </div>
      </header>

      {/* key={pathname}: la fiecare rută nouă titlul paginii intră cu animația „rise”. pb-32 pe telefon: loc pt. tab-uri. */}
      <main key={pathname} className="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-32 md:px-8 md:pt-10 md:pb-12">
        <Outlet />
      </main>

      {/* Tab-uri jos: doar pe telefon; deasupra zonei de gesturi iOS / Android */}
      <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 md:hidden">
        <div className="glass-bar relative grid rounded-full p-1.5" style={{ gridTemplateColumns: `repeat(${navItems.length}, 1fr)` }}>
          {active >= 0 && (
            <span
              aria-hidden
              className="glass-pill absolute inset-y-1.5 left-1.5 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
              style={{ width: `calc((100% - 0.75rem) / ${navItems.length})`, transform: `translateX(${active * 100}%)` }}
            />
          )}
          {navItems.map((item, index) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              className={`pressable relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-bold ${
                index === active ? 'text-fg' : 'text-muted'}`}
            >
              <Icon name={item.icon} className="h-5 w-5" />
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
  if (loading) return <div className="mx-auto max-w-md px-4 pt-24"><Loading rows={3} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell />;
}

// ---- Scena din spatele sticlei: apus pe o coastă tropicală (desen original: CSS pentru cer / soare / apă, SVG pentru palmieri) ----

// O frunză de palmier, desenată o dată și rotită în jurul coroanei.
const frond = 'M0 0 C 50 -34 140 -38 230 18 C 196 4 168 2 140 6 C 160 20 170 34 176 52 C 146 26 110 14 70 12 C 86 26 94 40 96 58 C 70 30 38 14 0 8 Z';

function Palm({ x, height, lean, scale = 1 }: { x: number; height: number; lean: number; scale?: number }) {
  // Trunchiul: o curbă care pleacă de jos și se înclină cu `lean`; coroana stă în capătul ei.
  const crownX = x + lean;
  const crownY = 900 - height;
  const fronds: ReactNode[] = [-168, -140, -112, -78, -44, -14, 16, 44].map((angle, index) => (
    <path key={index} d={frond} transform={`translate(${crownX} ${crownY}) rotate(${angle}) scale(${scale * (0.85 + (index % 3) * 0.12)})`} />
  ));
  return (
    <g>
      <path
        d={`M${x - 14 * scale} 900 C ${x} ${900 - height * 0.45}, ${crownX - lean * 0.2} ${crownY + height * 0.25}, ${crownX - 5} ${crownY} L ${crownX + 5} ${crownY} C ${crownX - lean * 0.15 + 8} ${crownY + height * 0.25}, ${x + 14} ${900 - height * 0.45}, ${x + 14 * scale} 900 Z`}
      />
      {fronds}
    </g>
  );
}

export function Scene() {
  return (
    <div className="scene" aria-hidden>
      <div className="scene-sun" />
      <div className="scene-glint" />
      {/* Palmierii stau în colțurile de jos; fiecare grup e ancorat de marginea lui ca să nu fie tăiat pe telefon. */}
      <svg className="scene-palms" viewBox="0 0 700 900" preserveAspectRatio="xMinYMax meet" fill="currentColor" style={{ left: 0, right: 'auto', width: 'min(70vw, 700px)' }}>
        <Palm x={70} height={740} lean={-30} scale={1.2} />
        <Palm x={190} height={440} lean={-40} scale={0.8} />
        <path d="M0 900 L0 840 Q 160 820 330 850 T 700 880 L700 900 Z" />
      </svg>
      <svg className="scene-palms" viewBox="0 0 600 900" preserveAspectRatio="xMaxYMax meet" fill="currentColor" style={{ right: 0, left: 'auto', width: 'min(60vw, 600px)' }}>
        <Palm x={540} height={660} lean={30} scale={1.1} />
        <path d="M0 900 Q 260 860 600 830 L600 900 Z" />
      </svg>
    </div>
  );
}
