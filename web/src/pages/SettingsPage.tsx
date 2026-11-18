// Setările aplicației pe acest dispozitiv. Acum: tema interfeței (vezi theme.ts).
import { useState } from 'react';
import { Icon, PageTitle, SectionTitle } from '../components/ui';
import { applyTheme, getTheme, themes, type ThemeId } from '../theme';

export function SettingsPage() {
  const [current, setCurrent] = useState<ThemeId>(getTheme());

  const choose = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
  };

  return (
    <>
      <PageTitle eyebrow="Settings" subtitle="Preferences for this device.">Settings</PageTitle>

      <SectionTitle>Theme</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {themes.map((theme) => {
          const selected = theme.id === current;
          return (
            <button
              key={theme.id}
              onClick={() => choose(theme.id)}
              aria-pressed={selected}
              className={`pressable panel cursor-pointer overflow-hidden rounded-3xl p-0 text-left transition-colors hover:border-line-strong ${selected ? 'ring-2 ring-gold/70' : ''}`}
            >
              {/* Mostra temei: cerul apusului, cu soarele și linia orizontului. */}
              <span className="relative block h-28 bg-gradient-to-b from-[#2a0f4a] via-[#c2357a] to-[#ff9a5a]">
                <span className="absolute bottom-5 left-1/2 h-14 w-14 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#ffe2a6] to-[#ff8a5c] opacity-90" />
                <span className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-b from-[#3a1a5c] to-[#1a0b2e]" />
              </span>
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
    </>
  );
}
