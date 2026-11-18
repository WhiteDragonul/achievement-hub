// Setările aplicației: tema interfeței (vezi theme.ts) și explicațiile despre datele preluate de la platforme.
import { useState } from 'react';
import { Card, Icon, PageTitle, PlatformBadge, SectionTitle } from '../components/ui';
import { applyTheme, getTheme, themes, type ThemeId } from '../theme';

const privacy = [
  { code: 'steam', text: 'You sign in on steamcommunity.com. We only receive your SteamID, never your password. Set "Game details" to Public in Steam privacy settings.' },
  { code: 'psn', text: 'We read your public trophies by Online ID. Set "Trophies" to Anyone in PlayStation privacy settings.' },
  { code: 'xbox', text: 'We read your public achievements by gamertag. Set "Game and app history" and "Achievements" to Everybody in Xbox privacy settings.' },
  { code: 'epic', text: 'Epic has no public achievements API, so Epic accounts use demo data.' },
];

// Mostra temei: apusul pentru Leonida; o fereastră alb-negru miniaturală pentru Dark / Light.
function ThemePreview({ id }: { id: ThemeId }) {
  if (id === 'leonida') {
    return (
      <span className="relative block h-28 bg-gradient-to-b from-[#2a0f4a] via-[#c2357a] to-[#ff9a5a]">
        <span className="absolute bottom-5 left-1/2 h-14 w-14 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#ffe2a6] to-[#ff8a5c] opacity-90" />
        <span className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-b from-[#3a1a5c] to-[#1a0b2e]" />
      </span>
    );
  }
  const dark = id === 'dark';
  return (
    <span className={`relative flex h-28 gap-2 overflow-hidden p-3 ${dark ? 'bg-black' : 'bg-[#ececee]'}`}>
      {/* aceleași forme estompate ca fundalul temei */}
      <span className={`absolute -top-6 -left-4 h-20 w-24 rounded-full blur-2xl ${dark ? 'bg-white/30' : 'bg-black/20'}`} />
      <span className={`absolute -right-6 -bottom-8 h-24 w-28 rounded-full blur-2xl ${dark ? 'bg-white/20' : 'bg-black/15'}`} />
      <span className={`relative w-1/4 rounded-xl border backdrop-blur-md ${dark ? 'border-white/15 bg-white/10' : 'border-white bg-white/60'}`} />
      <span className="relative flex flex-1 flex-col gap-2">
        <span className={`relative h-3 w-1/2 rounded-full ${dark ? 'bg-white' : 'bg-black'}`} />
        <span className={`relative flex-1 rounded-xl border backdrop-blur-md ${dark ? 'border-white/15 bg-white/10' : 'border-white bg-white/60'}`} />
      </span>
    </span>
  );
}

export function SettingsPage() {
  const [current, setCurrent] = useState<ThemeId>(getTheme());

  const choose = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
  };

  return (
    <>
      <PageTitle eyebrow="Settings" subtitle="Theme and privacy.">Settings</PageTitle>

      <SectionTitle>Theme</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {themes.map((theme) => {
          const selected = theme.id === current;
          return (
            <button
              key={theme.id}
              onClick={() => choose(theme.id)}
              aria-pressed={selected}
              className={`pressable panel cursor-pointer overflow-hidden rounded-3xl p-0 text-left transition-colors hover:border-line-strong ${selected ? 'ring-2 ring-gold/70' : ''}`}
            >
              <ThemePreview id={theme.id} />
              <span className="flex items-center justify-between gap-3 p-4">
                <span>
                  <span className="block font-bold">{theme.name}</span>
                  <span className="block text-sm text-muted">{theme.description}</span>
                </span>
                {selected && (
                  <span className="sunset flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink">
                    <Icon name="check" className="h-4 w-4" />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Ce citim de la fiecare platformă și ce setare de confidențialitate trebuie să fie publică. */}
      <div className="mt-10">
        <SectionTitle>Privacy &amp; security</SectionTitle>
      </div>
      <Card className="!p-0">
        <ul>
          {privacy.map((item, index) => (
            <li key={item.code} className={`flex flex-col items-start gap-2 px-5 py-4 ${index > 0 ? 'border-t border-line' : ''}`}>
              <PlatformBadge code={item.code} full />
              <p className="text-sm leading-relaxed text-muted">{item.text}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
